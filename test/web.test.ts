import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import { loadConfig, type Config } from "../src/config.js";
import { RateLimiter } from "../src/limiter.js";
import { createServer, validContact, validName } from "../src/server.js";
import { FRI_6PM, NOW, modelReply, setup } from "./helpers.js";

const ASSETS = { "index.html": "<html>shop</html>", "desk.html": "<html>desk</html>", "app.js": "//app", "desk.js": "//desk" };
const DAY = 86_400_000;

interface Res { status: number; json: any; text: string; headers: Headers }

async function rig(over: { web?: Partial<Config["web"]>; ownerToken?: string; simulator?: boolean } = {}) {
  const t = setup({ judge: (c) => (c.awaitingConfirmation && /^yes/i.test(c.message) ? { agrees: 0.97 } : {}) });
  let clock = NOW;
  const cfg: Config = { ...t.cfg, ownerToken: over.ownerToken ?? "secret", simulator: over.simulator ?? false, web: { ...t.cfg.web, ...over.web } };
  const limiter = new RateLimiter(() => clock);
  const server: Server = createServer({ agent: t.agent, store: t.store, cfg, assets: ASSETS, now: () => clock, limiter });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = async (method: string, path: string, o: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> => {
    const r = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...o.headers },
      body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body),
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  const start = async (name = "Asha", contact = "519-804-3658", headers?: Record<string, string>) => {
    const r = await call("POST", "/web/session", { body: { name, contact, consent: true }, headers });
    assert.equal(r.status, 200, r.text);
    return r.json.token as string;
  };
  const say = (token: string, text: string) => call("POST", "/web/message", { token, body: { text } });
  return {
    t, call, start, say, base,
    advance: (ms: number) => { clock += ms; },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Runs fn with a fresh server and always shuts it down. */
async function withRig(fn: (r: Awaited<ReturnType<typeof rig>>) => Promise<void>, over: Parameters<typeof rig>[0] = {}) {
  const r = await rig(over);
  try {
    await fn(r);
  } finally {
    await r.close();
  }
}

describe("limiter", () => {
  test("counts inside a window and resets after it", () => {
    let now = 1000;
    const l = new RateLimiter(() => now);
    assert.equal(l.hit("k", 2, 60_000).ok, true);
    assert.equal(l.hit("k", 2, 60_000).ok, true);
    const third = l.hit("k", 2, 60_000);
    assert.equal(third.ok, false);
    assert.equal(third.retryAfter, 60);
    now += 60_001;
    assert.equal(l.hit("k", 2, 60_000).ok, true);
  });
  test("keys are independent, peek does not count", () => {
    const l = new RateLimiter(() => 0);
    l.hit("a", 1, 1000);
    assert.equal(l.hit("a", 1, 1000).ok, false);
    assert.equal(l.hit("b", 1, 1000).ok, true);
    assert.equal(l.peek("c", 1), true);
    assert.equal(l.peek("c", 1), true);
    l.hit("c", 1, 1000);
    assert.equal(l.peek("c", 1), false);
  });
  test("refuses new keys when the table is full, existing keys still work", () => {
    const l = new RateLimiter(() => 0, 2);
    assert.equal(l.hit("a", 5, 1000).ok, true);
    assert.equal(l.hit("b", 5, 1000).ok, true);
    assert.equal(l.hit("c", 5, 1000).ok, false);
    assert.equal(l.hit("a", 5, 1000).ok, true);
  });
});

test("customer identity validation accepts real values and rejects junk", () => {
  for (const ok of [
    "519-804-3658", "+1 (519) 804 3658", "5192345678", "6478043658",
    "maddy@example.com", "first.last+orders@example.co"
  ]) assert.equal(validContact(ok), true, ok);
  for (const bad of [
    "", "abc", "12345", "not an email@", "a@b", "a@b.c", "519+8043658",
    "1234567890", "12345678890", "1111111111", "0000000000", "5191550101",
    "9112345678", "5199115678", "5195550101", "+1 (123) 456-7890",
    "<b>x</b>@a.com", "test@example..com", "test@-example.com", ".test@example.com", "test@exam_ple.com",
    "1234567890123456", "<script>alert(1)</script>", "x".repeat(81)
  ]) assert.equal(validContact(bad), false, bad);
  for (const ok of ["Asha", "M. Kiran", "Siva-Parvathi", "José", "O'Connor", "Maxy", "M", "M.", "Madhu Babu"]) assert.equal(validName(ok), true, ok);
  for (const bad of ["", "1234", "M@xy", "Madhu_1", "Madhu ..", "Madhu - - Babu", "Ravi-", "<script>alert(1)</script>", "A < B", "x".repeat(61)]) assert.equal(validName(bad), false, bad);
});

describe("web: files and headers", () => {
  test("serves only the allowlist, with security headers", () =>
    withRig(async ({ call }) => {
      const home = await call("GET", "/");
      assert.equal(home.text, "<html>shop</html>");
      assert.match(home.headers.get("content-security-policy")!, /script-src 'self'/);
      assert.doesNotMatch(home.headers.get("content-security-policy")!, /script-src[^;]*unsafe/);
      assert.equal(home.headers.get("x-content-type-options"), "nosniff");
      assert.equal(home.headers.get("x-frame-options"), "DENY");
      assert.equal((await call("GET", "/desk")).text, "<html>desk</html>");
      assert.equal((await call("GET", "/app.js")).text, "//app");
      for (const bad of ["/desk.html", "/index.html", "/package.json", "/src/server.js", "/../package.json", "/%2e%2e/package.json", "/public/app.js", "/.env", "/annapurna.db"]) {
        assert.equal((await call("GET", bad)).status, 404, bad);
      }
    }));

  test("HSTS only when the proxy says https", () =>
    withRig(async ({ call }) => {
      assert.equal((await call("GET", "/health")).headers.get("strict-transport-security"), null);
      assert.ok((await call("GET", "/health", { headers: { "x-forwarded-proto": "https" } })).headers.get("strict-transport-security"));
    }));

  test("WEB=off hides the customer site but keeps the desk API", () =>
    withRig(async ({ call }) => {
      assert.equal((await call("GET", "/")).status, 404);
      assert.equal((await call("GET", "/web/menu")).status, 404);
      assert.equal((await call("POST", "/web/session", { body: { name: "A", contact: "5198043658", consent: true } })).status, 404);
      assert.equal((await call("GET", "/api/state", { token: "secret" })).status, 200);
    }, { web: { enabled: false } }));
});

describe("web: menu and sessions", () => {
  test("public menu shows prices but not ingredients", () =>
    withRig(async ({ call }) => {
      const r = await call("GET", "/web/menu");
      assert.equal(r.status, 200);
      assert.ok(r.json.items.length >= 8);
      assert.ok(r.json.items.every((i: any) => !("recipe" in i) && !("aliases" in i)));
      assert.ok(r.json.items.every((i: any) => !/please add|not set yet/i.test(i.desc ?? "")), "owner-facing placeholders are not shown");
      assert.ok(Array.isArray(r.json.pickupDays));
      // the weekly plan is a list of lines, one weekday each, for the Menu sheet
      assert.ok(r.json.weekly.length >= 6);
      assert.match(r.json.weekly[0], /^Monday: /);
      assert.ok(r.json.weekly.every((l: string) => !/never quote a price|Annapurna Home Foods confirms those/.test(l)), "agent-only notes are not shown to customers");
    }));

  test("owner can edit the weekly plan shown to customers", () =>
    withRig(async ({ call }) => {
      const put = await call("PUT", "/api/settings", { token: "secret", body: { weeklyMenu: "Monday: 4 idli\n\nTuesday: 3 dosa" } });
      assert.equal(put.status, 200);
      assert.deepEqual((await call("GET", "/web/menu")).json.weekly, ["Monday: 4 idli", "Tuesday: 3 dosa"]);
    }));

  test("session needs a name, a valid contact and consent", () =>
    withRig(async ({ call }) => {
      const s = (body: unknown) => call("POST", "/web/session", { body });
      assert.equal((await s({ name: "", contact: "5198043658", consent: true })).status, 400);
      assert.equal((await s({ name: "A", contact: "nope", consent: true })).status, 400);
      assert.equal((await s({ name: "A", contact: "5198043658" })).status, 400);
      assert.equal((await s({ name: "A", contact: "5198043658", consent: "true" })).status, 400);
      assert.equal((await call("POST", "/web/session", { body: "not json" })).status, 400);
      const ok = await s({ name: "  Asha  ", contact: "5198043658", consent: true });
      assert.equal(ok.status, 200);
      assert.ok(ok.json.token.length >= 30);
      assert.equal(ok.json.name, "Asha");
    }));

  test("the raw token is never stored, only its hash", () =>
    withRig(async ({ t, start }) => {
      const token = await start();
      const db = (t.store as any).db;
      const rows = db.prepare("SELECT token_hash FROM web_sessions").all() as Array<{ token_hash: string }>;
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0]!.token_hash, token);
      assert.match(rows[0]!.token_hash, /^[0-9a-f]{64}$/);
    }));

  test("endpoints reject missing, wrong and expired tokens", () =>
    withRig(async ({ call, start, advance }) => {
      assert.equal((await call("POST", "/web/message", { body: { text: "hi" } })).status, 401);
      assert.equal((await call("POST", "/web/message", { token: "nope", body: { text: "hi" } })).status, 401);
      assert.equal((await call("GET", "/web/history", { token: "x".repeat(300) })).status, 401);
      assert.equal((await call("GET", "/web/orders")).status, 401);
      assert.equal((await call("DELETE", "/web/me")).status, 401);
      const token = await start();
      assert.equal((await call("GET", "/web/history", { token })).status, 200);
      advance(61 * DAY);
      assert.equal((await call("GET", "/web/history", { token })).status, 401);
    }));

  test("using a session keeps it alive", () =>
    withRig(async ({ call, start, advance }) => {
      const token = await start();
      for (let i = 0; i < 4; i++) {
        advance(30 * DAY);
        assert.equal((await call("GET", "/web/history", { token })).status, 200);
      }
    }));
});

describe("web: chat and orders", () => {
  test("message -> read-back -> yes -> order; orders list shows it", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha", "asha@example.com");
      t.llm.push(modelReply({ reply: "Sure, noted.", items: [{ id: "kheema_fry", qty: 2, pack: "bogo", asked_for: "kheema fry" }], pickup: FRI_6PM, notes: "Spicy", stage: "awaiting_confirmation" }));
      const a = await say(token, "2 kheema fry combos bogo, Friday 6pm");
      assert.equal(a.status, 200);
      const texts = a.json.messages.map((m: any) => `${m.who}:${m.text}`).join("\n");
      assert.match(texts, /cust:2 kheema fry/);
      assert.match(texts, /agent:.*Total: \$56/s);
      const b = await say(token, "yes");
      assert.equal(b.json.orderId, 1);
      const o = await call("GET", "/web/orders", { token });
      assert.equal(o.json.orders.length, 1);
      assert.deepEqual([o.json.orders[0].status, o.json.orders[0].total], ["cook", 56]);
      assert.equal(o.json.orders[0].notes, "Spicy");
      assert.match(o.json.orders[0].pickupText, /Fri/);
      // the desk sees name and contact
      const st = await call("GET", "/api/state", { token: "secret" });
      assert.equal(st.json.orders[0].contact, "asha@example.com");
      assert.equal(st.json.customers[0].contact, "asha@example.com");
    }));

  test("Round 6: rapid duplicate confirmation requests create exactly one real order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Double Tap", "double@example.com");
      t.llm.push(modelReply({ reply: "Ready to review.", items: [{ id: "bagara_chicken_fry", qty: 1, pack: "bogo", asked_for: "bagara chicken fry" }], pickup: "2026-09-26T18:00", stage: "awaiting_confirmation" }));
      const review = await say(token, "1 Bagara Rice and Chicken Fry combo BOGO Saturday 6 PM");
      const readback = review.json.messages.find((m: any) => m.who === "agent" && /Please check your order/.test(m.text));
      assert.ok(readback?.id);
      const body = { text: "Yes, confirm", requestId: `confirm:${readback.id}` };
      const [a, b] = await Promise.all([
        call("POST", "/web/message", { token, body }),
        call("POST", "/web/message", { token, body }),
      ]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(orders.length, 1);
      assert.equal(orders[0].total, 22);
      const confirmations = t.store.getMessages(t.store.listCustomers()[0]!.waId, 100).filter((m: any) => /Order #\d+.*is confirmed/.test(m.text));
      assert.equal(confirmations.length, 1);
    }));

  test("Round 5: large explicit quantity bypasses the model and creates no phantom order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Bulk Buyer", "5198040130");
      const before = t.llm.prompts.length;
      const r = await say(token, "25 Chicken Kheema Fry combos, spicy, pickup this Saturday 4pm");
      assert.equal(t.llm.prompts.length, before);
      assert.ok(r.json.messages.some((m: any) => /No order is placed yet/i.test(m.text)));
      const waId = t.store.listCustomers()[0]!.waId;
      const d = t.store.getDraft(waId)!;
      assert.ok(d.custom);
      assert.equal(d.pickup_local, "2026-09-26T16:00");
      assert.match(d.items[0]?.name ?? "", /Chicken Kheema Fry/i);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$250" } });
      const placed = await say(token, "Confirm the order");
      assert.equal(placed.json.orderId, 1);
      assert.match((await call("GET", "/web/orders", { token })).json.orders[0].items[0], /^25 x Chicken Kheema Fry combo.*custom catering/i);
    }));

  test("Round 7: abandoning a quoted bulk request cannot contaminate the next normal order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Bulk Reset", "bulk-reset@example.com");
      await say(token, "25 Chicken Kheema Fry combos, spicy, pickup this Saturday 4pm");
      const waId = t.store.listCustomers()[0]!.waId;
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$180" } });
      assert.equal(t.store.getDraft(waId)!.custom?.price, 180);
      assert.ok(t.store.getDraft(waId)!.custom?.quote_key);

      const abandoned = await say(token, "Never mind the bulk one");
      assert.ok(abandoned.json.messages.some((m: any) => /cleared that pending custom\/bulk request/i.test(m.text)));
      assert.equal(t.store.getDraft(waId), null);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);

      t.llm.push(modelReply({
        reply: "Sure.",
        items: [{ id: "fry_piece_pulao", qty: 1, pack: "single", asked_for: "Gongura Fry Piece Pulao combo" }],
        pickup: "2026-09-26T18:00",
        stage: "awaiting_confirmation",
      }));
      const review = await say(token, "1 Gongura Fry Piece Pulao combo, Saturday 6 PM");
      const text = review.json.messages.map((m: any) => m.text).join("\n");
      assert.match(text, /1 x Gongura Fry Piece Pulao combo: \$17/);
      assert.doesNotMatch(text, /\$180|25 x|custom catering/i);

      const placed = await say(token, "YES");
      assert.equal(placed.json.orderId, 1);
      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(orders.length, 1);
      assert.equal(orders[0].total, 17);
      assert.deepEqual(orders[0].items, ["1 x Gongura Fry Piece Pulao combo"]);

      const stored = (await call("GET", "/api/state", { token: "secret" })).json.orders[0];
      assert.deepEqual([stored.items[0].id, stored.items[0].qty, stored.items[0].pack, stored.items[0].amt], ["fry_piece_pulao", 1, "single", 17]);
      assert.doesNotMatch(stored.notes, /Custom order/i);
    }));

  test("Round 7: changing custom terms after an owner quote invalidates that quote", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Quote Safety", "quote-safety@example.com");
      await say(token, "25 Chicken Kheema Fry combos, pickup this Saturday 4pm");
      const waId = t.store.listCustomers()[0]!.waId;
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$180" } });
      assert.equal(t.store.getDraft(waId)!.custom?.price, 180);

      t.llm.push(modelReply({
        reply: "Okay, changed.",
        items: [{ id: "fry_piece_pulao", qty: 1, pack: "single", asked_for: "Gongura Fry Piece Pulao combo" }],
        pickup: "2026-09-26T16:00",
        stage: "collecting",
      }));
      const changed = await say(token, "Actually make that 1 Gongura Fry Piece Pulao combo instead");
      assert.ok(changed.json.messages.some((m: any) => /cleared the old quoted price/i.test(m.text)));
      const d = t.store.getDraft(waId)!;
      assert.ok(d.custom);
      assert.equal(d.custom!.price, null);
      assert.equal(d.custom!.approved, false);

      const confirm = await say(token, "YES");
      assert.equal(confirm.json.orderId, null);
      assert.ok(confirm.json.messages.some((m: any) => /still need the final price/i.test(m.text)));
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);
    }));

  test("Round 8: abandon plus a replacement order in the same message becomes a normal $17 order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Robin Shaw", "robin.shaw@example.com");
      await say(token, "25 Chicken Kheema Fry combos, spicy, pickup this Saturday 4pm");
      const waId = t.store.listCustomers()[0]!.waId;
      assert.ok(t.store.getDraft(waId)?.custom);

      t.llm.push(modelReply({
        reply: "Sure.",
        items: [{ id: "fry_piece_pulao", qty: 1, pack: "single", asked_for: "Gongura Fry Piece Pulao combo" }],
        pickup: "2026-09-27T13:00",
        notes: "Medium spice, no extras",
        stage: "awaiting_confirmation",
      }));
      const switched = await say(token, "Never mind the bulk one. Just 1 Gongura Fry Piece Pulao combo, medium, pickup Sunday 1pm, no extras");
      const switchedText = switched.json.messages.map((m: any) => m.text).join("\n");
      assert.match(switchedText, /cleared that pending custom\/bulk request/i);
      assert.match(switchedText, /1 x Gongura Fry Piece Pulao combo: \$17/);
      assert.doesNotMatch(switchedText, /price to be confirmed|custom catering|\$200/i);
      assert.equal(t.store.getDraft(waId)?.custom, undefined);
      assert.equal(t.store.listAlerts(true).filter((a) => a.waId === waId && a.note.startsWith("Custom/bulk request:")).length, 0);

      // A stale owner tab cannot inject an old bare bulk quote after the reset.
      const staleQuote = await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "200$" } });
      assert.equal(staleQuote.status, 409);
      assert.equal(t.store.getMessages(waId, 100).some((m) => m.who === "owner" && m.text === "200$"), false);

      const placed = await say(token, "Yes, please confirm the $17 Gongura Fry Piece Pulao combo");
      assert.equal(placed.json.orderId, 1);
      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(orders.length, 1);
      assert.equal(orders[0].total, 17);
      assert.deepEqual(orders[0].items, ["1 x Gongura Fry Piece Pulao combo"]);
      assert.equal(t.store.listAlerts(true).some((a) => /Custom\/bulk request/.test(a.note)), false);
    }));

  test("Round 8: $17 before a menu name is a price, never bulk quantity 17", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Price Words", "price@example.com");
      t.llm.push(modelReply({
        items: [{ id: "fry_piece_pulao", qty: 1, pack: "single", asked_for: "Gongura Fry Piece Pulao combo" }],
        pickup: "2026-09-27T13:00",
        stage: "awaiting_confirmation",
      }));
      const r = await say(token, "Please order the $17 Gongura Fry Piece Pulao combo for Sunday 1pm");
      const waId = t.store.listCustomers()[0]!.waId;
      assert.equal(t.store.getDraft(waId)?.custom, undefined);
      assert.match(r.json.messages.map((m: any) => m.text).join("\n"), /1 x Gongura Fry Piece Pulao combo: \$17/);
      assert.equal(t.store.listAlerts(true).some((a) => /Custom\/bulk request/.test(a.note)), false);
      const placed = await say(token, "YES");
      assert.equal(placed.json.orderId, 1);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders[0].total, 17);
    }));

  test("Round 8: explicit Oct 3 custom pickup is not collapsed to the nearest Saturday", () =>
    withRig(async ({ t, start, say }) => {
      const token = await start("Calendar Safety", "calendar@example.com");
      await say(token, "25 Chicken Kheema Fry combos");
      const r = await say(token, "pickup Saturday Oct 3 2pm");
      const waId = t.store.listCustomers()[0]!.waId;
      assert.equal(t.store.getDraft(waId)!.pickup_local, "2026-10-03T14:00");
      assert.ok(r.json.messages.some((m: any) => /Sat, Oct 3.*2:00 PM/i.test(m.text)));
    }));

  test("Round 5: custom recipe bypasses model; Sunday noon parses; customer price is ignored", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Custom Buyer", "5198040131");
      const before = t.llm.prompts.length;
      const r = await say(token, "Chicken Pulao with Mirchi Ka Salan, extra spicy, double masala, custom recipe");
      assert.equal(t.llm.prompts.length, before);
      assert.ok(r.json.messages.some((m: any) => /No order is placed yet/i.test(m.text)));
      const waId = t.store.listCustomers()[0]!.waId;
      const pickup = await say(token, "medium spice, pickup Sunday noon");
      assert.ok(pickup.json.messages.some((m: any) => /pickup is Sun, Sep 27 · 12:00 PM/i.test(m.text)));
      assert.equal(t.store.getDraft(waId)!.pickup_local, "2026-09-27T12:00");
      const price = await say(token, "Final price is $13");
      assert.ok(price.json.messages.some((m: any) => /final price must come from Annapurna Home Foods/i.test(m.text)));
      assert.equal(t.store.getDraft(waId)!.custom?.price, null);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);
    }));

  test("Round 5: model error is recoverable and model prose cannot fake order confirmation", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Recovery Buyer", "5198040132");
      t.llm.push(new Error("boom"));
      const failed = await say(token, "1 Bagara Rice and Chicken Fry combo BOGO Saturday 11 AM");
      assert.equal(failed.json.recoverableError, true);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);
      t.llm.push(modelReply({ reply: "Sure, order is confirmed. Locking this in now." }));
      const later = await say(token, "Hello");
      assert.ok(later.json.messages.some((m: any) => /haven't placed an order/i.test(m.text)));
      assert.equal(later.json.orderId, null);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);
    }));

  test("custom catering: owner price + approval then customer YES creates a real order and notification", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("KM", "5198043658");

      t.llm.push(modelReply({
        reply: "Thanks! Annapurna Home Foods will confirm this custom catering request here.",
        items: [{ id: "bagara_chicken_fry", qty: 15, pack: "single", asked_for: "Bagara rice and chicken fry for 15 people" }],
        pickup: null,
        stage: "collecting",
        needs_owner: true,
        owner_note: "Custom catering: Bagara rice and chicken fry for 15 people",
      }));
      await say(token, "Hi I would like to order Bagara rice and chicken fry for 15 people");

      t.llm.push(modelReply({
        reply: "Thanks for the pickup time. Annapurna Home Foods will confirm the exact price here.",
        items: [{ id: "bagara_chicken_fry", qty: 15, pack: "single", asked_for: "Bagara rice and chicken fry for 15 people" }],
        pickup: FRI_6PM,
        stage: "collecting",
        needs_owner: true,
        owner_note: "Custom catering pickup Friday 6 PM; price needs owner confirmation",
      }));
      await say(token, "Friday at 6 PM, may I know the price?");

      const waId = t.store.listCustomers()[0]!.waId;
      assert.equal((await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$120" } })).status, 200);
      assert.equal((await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "Thank you, I am confirming the order." } })).status, 200);

      const d = t.store.getDraft(waId)!;
      assert.deepEqual([d.custom?.price, d.custom?.approved, d.pickup_local], [120, true, FRI_6PM]);

      const confirmed = await say(token, "Yes please confirm");
      assert.equal(confirmed.status, 200);
      assert.equal(confirmed.json.orderId, 1);
      assert.ok(confirmed.json.messages.some((m: any) => /Order #1 is confirmed:/.test(m.text)));

      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(orders.length, 1);
      assert.deepEqual([orders[0].status, orders[0].total], ["cook", 120]);
      assert.match(orders[0].items[0], /15 x .*custom catering/i);

      const owner = await call("GET", "/api/state", { token: "secret" });
      assert.equal(owner.json.orders.length, 1);
      assert.equal(owner.json.orders[0].items[0].amt, 120);
      assert.match(t.notifier.sent.at(-1)!.title, /Custom order #1 confirmed/);
      assert.equal(t.store.getDraft(waId), null);
    }));

  test("custom catering: pickup + owner price + customer confirmation creates the order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("KM", "5198043658");

      t.llm.push(modelReply({
        reply: "A tray order for 15 people is a custom catering request. Annapurna Home Foods will confirm the details and pricing here.",
        items: [{ id: "bagara_chicken_fry", qty: 15, pack: "single", asked_for: "Bagara rice and chicken fry for 15 people" }],
        pickup: null,
        stage: "collecting",
        needs_owner: true,
        owner_note: "Custom tray order for 15 people: Bagara rice and chicken fry",
      }));
      await say(token, "I would like to place a tray order of bagara rice and chicken fry for 15 people");

      const waId = t.store.listCustomers()[0]!.waId;
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, {
        token: "secret",
        body: { text: "Sure thank you, what is the date and time?" },
      });

      // Common custom pickup replies are parsed by code, not by the LLM.
      const promptsBeforePickup = t.llm.prompts.length;
      const pickup = await say(token, "Tomorrow 6:00 PM EST, may I know the price?");
      assert.equal(t.llm.prompts.length, promptsBeforePickup);
      assert.ok(pickup.json.messages.some((m: any) => /pickup is Thu, Sep 24 · 6:00 PM/i.test(m.text)));

      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, {
        token: "secret",
        body: { text: "15 people is a medium tray so it would be around 110$" },
      });

      const d = t.store.getDraft(waId)!;
      assert.deepEqual([d.custom?.price, d.pickup_local], [110, "2026-09-24T18:00"]);

      // No separate owner-approval message is required. The quoted price is the owner's terms;
      // the customer's explicit confirmation places the real order.
      const promptsBeforeConfirm = t.llm.prompts.length;
      const confirmed = await say(token, "Sure thank you, I am confirming the order");
      assert.equal(t.llm.prompts.length, promptsBeforeConfirm);
      assert.equal(confirmed.json.orderId, 1);
      assert.ok(confirmed.json.messages.some((m: any) => /Order #1 is confirmed:/.test(m.text)));

      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(orders.length, 1);
      assert.deepEqual([orders[0].status, orders[0].total], ["cook", 110]);
      assert.match(orders[0].items[0], /15 x Bagara Rice and Chicken Fry combo.*custom catering/i);
      assert.match(orders[0].pickupText, /Thu, Sep 24 · 6:00 PM/);

      const owner = await call("GET", "/api/state", { token: "secret" });
      assert.equal(owner.json.orders.length, 1);
      assert.equal(owner.json.orders[0].status, "cook");
      assert.match(t.notifier.sent.at(-1)!.title, /Custom order #1 confirmed/);

      // After confirmation it follows the ordinary order lifecycle.
      await call("POST", "/api/orders/1/status", { token: "secret", body: { status: "ready", confirm: true } });
      let customerOrders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(customerOrders[0].status, "ready");

      await call("POST", "/api/orders/1/status", { token: "secret", body: { status: "done", confirm: true } });
      customerOrders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(customerOrders[0].status, "done");
    }));

  test("a normal menu order after a custom order stays normal and uses menu pricing", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("KM", "5198043658");

      // First place a real custom order for 15 people.
      t.llm.push(modelReply({
        reply: "Saved as a custom order.",
        items: [{ id: "bagara_chicken_fry", qty: 15, pack: "single", asked_for: "Bagara rice and chicken fry for 15 people" }],
        pickup: FRI_6PM,
        stage: "collecting",
        needs_owner: true,
        owner_note: "Custom catering for 15 people",
      }));
      await say(token, "Bagara rice and chicken fry tray order for 15 people Friday 6 PM");
      const waId = t.store.listCustomers()[0]!.waId;
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$120" } });
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "I am confirming the order" } });
      const custom = await say(token, "Confirm the order");
      assert.equal(custom.json.orderId, 1);
      assert.equal(t.store.getDraft(waId), null);

      // Same customer now places an ordinary BOGO menu order.
      t.llm.push(modelReply({
        reply: "Perfect.",
        items: [{ id: "bagara_chicken_fry", qty: 1, pack: "bogo", asked_for: "Bagara Rice and Chicken Fry combo" }],
        pickup: "2026-09-26T11:00",
        notes: "Spicy, no extras",
        stage: "awaiting_confirmation",
      }));
      const rb = await say(token, "I'd like Bagara Rice and Chicken Fry combo BOGO, spicy, no extras, Saturday 11 AM");
      const readback = rb.json.messages.map((m: any) => m.text).join("\n");
      assert.match(readback, /1 x Bagara Rice and Chicken Fry combo \(Buy 1 Get 1\): \$22/);
      assert.doesNotMatch(readback, /custom catering/i);

      const normal = await say(token, "yes confirm");
      assert.equal(normal.json.orderId, 2);

      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      const latest = orders.find((o: any) => o.id === 2);
      assert.ok(latest);
      assert.equal(latest.total, 22);
      assert.deepEqual(latest.items, ["1 x Bagara Rice and Chicken Fry combo (Buy 1 Get 1)"]);

      const owner = await call("GET", "/api/state", { token: "secret" });
      const stored = owner.json.orders.find((o: any) => o.id === 2);
      assert.deepEqual(
        [stored.items[0].id, stored.items[0].qty, stored.items[0].pack, stored.items[0].amt],
        ["bagara_chicken_fry", 1, "bogo", 22],
      );
      assert.doesNotMatch(stored.notes, /Custom order/i);
    }));

  test("ended-session resume keeps the same customer and existing orders", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Test User", "test@example.com");
      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(token, "1 kheema fry friday 6pm");
      await say(token, "yes");
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 1);
      const resumed = await call("POST", "/web/resume", { token, body: { name: "Test User", contact: "test@example.com", consent: true } });
      assert.equal(resumed.status, 200);
      assert.equal(t.store.listCustomers().length, 1);
      assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 1);
      const wrong = await call("POST", "/web/resume", { token, body: { name: "Other", contact: "other@example.com", consent: true } });
      assert.equal(wrong.status, 409);
    }));

  test("customer can request cancellation without the order being auto-cancelled", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha", "5198043658");
      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(token, "1 kheema fry friday 6pm");
      const id = (await say(token, "yes")).json.orderId;
      const r = await call("POST", `/web/orders/${id}/cancel-request`, { token });
      assert.equal(r.status, 200);
      assert.equal(t.store.getOrder(id)!.status, "cook");
      const alert = t.store.listAlerts(true).find((a) => a.orderId === id);
      assert.ok(alert);
      assert.match(alert!.note, /Cancellation requested/);
      assert.ok(r.json.messages.some((m: any) => /cancellation request/i.test(m.text)));
      assert.match(t.notifier.sent.at(-1)!.title, /Cancellation request/);
      const cancelled = await call("POST", "/api/orders/" + id + "/status", { token: "secret", body: { status: "cancelled" } });
      assert.equal(cancelled.status, 200);
      assert.equal(t.store.listAlerts(true).some((a) => a.orderId === id), false);
    }));

  test("ready and picked-up transitions require explicit owner confirmation", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha");
      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(token, "1 kheema fry friday 6pm");
      const id = (await say(token, "yes")).json.orderId;
      assert.equal((await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "ready" } })).status, 400);
      assert.equal(t.store.getOrder(id)!.status, "cook");
      assert.equal((await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "ready", confirm: true } })).status, 200);
      assert.equal((await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "done" } })).status, 400);
      assert.equal(t.store.getOrder(id)!.status, "ready");
      assert.equal((await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "done", confirm: true } })).status, 200);
    }));

  test("customers cannot see each other's chats or orders", () =>
    withRig(async ({ t, start, say, call }) => {
      const a = await start("Asha", "5198043658");
      const b = await start("Bala", "5198040102");
      t.llm.push(modelReply({ reply: "A-secret-reply", items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(a, "one kheema fry friday 6pm");
      await say(a, "yes");
      const hb = await call("GET", "/web/history", { token: b });
      assert.deepEqual(hb.json.messages, []);
      assert.deepEqual((await call("GET", "/web/orders", { token: b })).json.orders, []);
      assert.equal((await call("GET", "/web/orders", { token: a })).json.orders.length, 1);
      // a token cannot be used to name another customer
      assert.equal((await call("GET", "/web/history?waId=" + encodeURIComponent(t.store.listCustomers()[0]!.waId), { token: b })).json.messages.length, 0);
      // the owner API is not reachable with a customer token
      assert.equal((await call("GET", "/api/state", { token: a })).status, 401);
      assert.equal((await call("POST", "/api/customers/x/reply", { token: a, body: { text: "hi" } })).status, 401);
    }));

  test("message validation", () =>
    withRig(async ({ start, say, call }) => {
      const token = await start();
      assert.equal((await say(token, "   ")).status, 400);
      assert.equal((await say(token, "a".repeat(1001))).status, 400);
      assert.equal((await call("POST", "/web/message", { token, body: {} })).status, 400);
      assert.equal((await call("POST", "/web/message", { token, body: { text: 42 } })).status, 400);
    }));

  test("if Claude fails the customer still gets a polite answer and Maddy is alerted", () =>
    withRig(async ({ t, start, say }) => {
      const token = await start("Asha");
      t.llm.push(new Error("boom"));
      const r = await say(token, "hello");
      assert.equal(r.status, 200);
      assert.equal(r.json.recoverableError, true);
      assert.ok(r.json.messages.some((m: any) => m.who === "agent"));
      assert.ok(t.store.listAlerts(true).length >= 1);
    }));

  test("terse owner filler replies are rejected and bare prices require an active custom request", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha");
      const waId = t.store.listCustomers()[0]!.waId;
      const reply = (text: string) => call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text } });

      for (const filler of ["Yes", "Ok", "No thank you", "Sure", "Thanks"]) {
        const r = await reply(filler);
        assert.equal(r.status, 400, filler);
      }
      assert.equal((await reply("$120")).status, 409, "a stale bare price cannot leak into an ordinary chat");
      await say(token, "25 Chicken Kheema Fry combos");
      assert.equal((await reply("$120")).status, 200, "a bare quoted price is allowed for an active custom request");
      assert.equal((await reply("Yes, we can prepare that for tomorrow.")).status, 200);

      const history = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "owner");
      assert.deepEqual(history.map((m: any) => m.text), ["Annapurna Home Foods quoted $120 for this custom order.", "Yes, we can prepare that for tomorrow."]);
    }));

  test("owner replies and status notes show up in the customer's chat", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha");
      // a Monday combo order is outside the combo pickup days, so it waits on the owner
      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: "2026-09-28T12:00", stage: "awaiting_confirmation" }));
      await say(token, "1 kheema fry monday noon");
      const y = await say(token, "yes");
      const id = y.json.orderId;
      assert.equal(t.store.getOrder(id)!.status, "hold");
      const last = (await call("GET", "/web/history", { token })).json.messages.at(-1).id;

      const rep = await call("POST", `/api/customers/${encodeURIComponent(t.store.listCustomers()[0]!.waId)}/reply`, { token: "secret", body: { text: "Monday works, see you then!" } });
      assert.equal(rep.status, 200);
      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "cook" } });
      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "ready", confirm: true } });

      const h = await call("GET", `/web/history?after=${last}`, { token });
      const owner = h.json.messages.filter((m: any) => m.who === "owner").map((m: any) => m.text);
      const system = h.json.messages.filter((m: any) => m.who === "agent").map((m: any) => m.text);
      assert.deepEqual(owner, ["Monday works, see you then!"]);
      assert.equal(system.length, 2);
      assert.match(system[0], /confirmed your order #1/);
      assert.match(system[1], /ready for pickup/);

      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "done", confirm: true } });
      const after = (await call("GET", "/web/history", { token })).json.messages;
      const thanks = after.at(-1);
      assert.equal(thanks.who, "agent");
      assert.match(thanks.text, /Thank you for your order, Asha! Enjoy your food/);
      assert.match(thanks.text, /instagram\.com\/annapurna_hometaste/);
      // moving back and forth does not send it twice
      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "done", confirm: true } }).catch(() => null);
      const count = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => /Enjoy your food/.test(m.text)).length;
      assert.equal(count, 1);
    }));

  test("cancelling from the desk tells the customer; unknown customer/empty reply are rejected", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha");
      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(token, "1 kheema fry friday 6pm");
      const id = (await say(token, "yes")).json.orderId;
      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "cancelled" } });
      const system = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "agent");
      assert.match(system.at(-1).text, /cancelled/);

      // with a reason from the owner, the customer sees it
      t.llm.push(modelReply({ items: [{ id: "fry_piece_pulao", qty: 1, pack: "single", asked_for: "fry piece pulao" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(token, "1 fry piece pulao friday 6pm");
      const id2 = (await say(token, "yes")).json.orderId;
      await call("POST", `/api/orders/${id2}/status`, { token: "secret", body: { status: "cancelled", reason: "Sorry, this dish is sold out for that day.\u0007" } });
      const last = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "agent").at(-1).text;
      assert.equal(last, `Sorry, order #${id2} has been cancelled.\nSorry, this dish is sold out for that day.`);
      const wa = t.store.listCustomers()[0]!.waId;
      assert.equal((await call("POST", `/api/customers/${encodeURIComponent(wa)}/reply`, { token: "secret", body: { text: "  " } })).status, 400);
      assert.equal((await call("POST", "/api/customers/web%3Anobody/reply", { token: "secret", body: { text: "hi" } })).status, 404);
      assert.equal((await call("GET", `/api/customers/${encodeURIComponent(wa)}/messages`, { token: "secret" })).json.messages.length > 0, true);
    }));

  test("delete my chat removes messages and login, keeps the placed order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Asha");
      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
      await say(token, "1 kheema fry friday 6pm");
      await say(token, "yes");
      const wa = t.store.listCustomers()[0]!.waId;
      assert.ok(t.store.getMessages(wa, 50).length > 0);
      // A chat-only alert would otherwise leave the owner with a stale Open chat card and a blank thread.
      t.store.insertAlert({ waId: wa, cust: "Asha", note: "Custom/bulk request: old pending request", orderId: null, createdAt: Date.now() });
      const placedOrder = t.store.listOrders()[0]!;
      t.store.insertAlert({ waId: wa, cust: "Asha", note: "Cancellation requested for order #" + placedOrder.id, orderId: placedOrder.id, createdAt: Date.now() });
      assert.ok(t.store.listAlerts(true).some((a) => a.waId === wa && a.orderId == null));
      assert.ok(t.store.listAlerts(true).some((a) => a.waId === wa && a.note.startsWith("Cancellation requested")));
      assert.equal((await call("DELETE", "/web/me", { token })).status, 200);
      assert.equal(t.store.getMessages(wa, 50).length, 0);
      assert.equal(t.store.listAlerts(true).some((a) => a.waId === wa && a.orderId == null), false);
      assert.equal(t.store.listAlerts(true).some((a) => a.waId === wa && a.note.startsWith("Cancellation requested")), false);
      assert.equal((await call("GET", "/web/history", { token })).status, 401);
      assert.equal(t.store.listOrders().length, 1);

      // Regression: order lifecycle events after deletion must not reconstruct a fake, partial chat.
      const orderId = t.store.listOrders()[0]!.id;
      await call("POST", `/api/orders/${orderId}/status`, { token: "secret", body: { status: "ready", confirm: true } });
      await call("POST", `/api/orders/${orderId}/status`, { token: "secret", body: { status: "done", confirm: true } });
      assert.equal(t.store.getMessages(wa, 50).length, 0, "ready/thank-you notes do not recreate deleted messages");
      const owner = await call("GET", "/api/state", { token: "secret" });
      assert.equal(owner.json.customers.some((c: any) => c.waId === wa), false, "deleted chat stays out of owner Chats");
      assert.equal(owner.json.orders.some((o: any) => o.waId === wa), true, "order history is preserved");
      const thread = await call("GET", `/api/customers/${encodeURIComponent(wa)}/messages`, { token: "secret" });
      assert.deepEqual(thread.json.messages, [], "direct thread lookup is an honest empty state");
      assert.equal((await call("POST", `/api/customers/${encodeURIComponent(wa)}/reply`, { token: "secret", body: { text: "hello" } })).status, 410);
    }));
});

describe("web: abuse limits", () => {
  test("new chats per IP per hour", () =>
    withRig(async ({ call, advance }) => {
      const body = { name: "A", contact: "5198043658", consent: true };
      for (let i = 0; i < 2; i++) assert.equal((await call("POST", "/web/session", { body })).status, 200);
      const blocked = await call("POST", "/web/session", { body });
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
      advance(3_600_001);
      assert.equal((await call("POST", "/web/session", { body })).status, 200);
    }, { web: { sessionsPerIpHour: 2 } }));

  test("invalid signup attempts do not consume the hourly new-chat quota", () =>
    withRig(async ({ call }) => {
      for (let i = 0; i < 5; i++) {
        const badPhone = await call("POST", "/web/session", { body: { name: "Asha", contact: "1234567890", consent: true } });
        assert.equal(badPhone.status, 400);
        assert.match(badPhone.json.error, /valid Canadian\/US phone/i);
      }
      const badEmail = await call("POST", "/web/session", { body: { name: "Asha", contact: "test@example..com", consent: true } });
      assert.equal(badEmail.status, 400);
      assert.match(badEmail.json.error, /valid email/i);
      const valid = await call("POST", "/web/session", { body: { name: "Madhu  Babu", contact: "2267894561", consent: true } });
      assert.equal(valid.status, 200);
      assert.equal(valid.json.name, "Madhu Babu");
      const blocked = await call("POST", "/web/session", { body: { name: "Bala", contact: "2267894562", consent: true } });
      assert.equal(blocked.status, 429);
    }, { web: { sessionsPerIpHour: 1 } }));

  test("returning customer resume bypasses an exhausted new-chat IP quota", () =>
    withRig(async ({ call }) => {
      const existing = { name: "Returning User", contact: "returning@example.com", consent: true };
      const created = await call("POST", "/web/session", { body: existing });
      assert.equal(created.status, 200);
      const token = created.json.token as string;

      // The only allowed new chat from this network has now been consumed.
      const blocked = await call("POST", "/web/session", { body: { name: "New User", contact: "new@example.com", consent: true } });
      assert.equal(blocked.status, 429);

      // Resuming the already-authenticated saved chat is not a new session and must still work.
      const resumed = await call("POST", "/web/resume", { token, body: existing });
      assert.equal(resumed.status, 200);
      assert.equal((await call("GET", "/web/orders", { token })).status, 200);
    }, { web: { sessionsPerIpHour: 1 } }));

  test("wrong contact on resume does not invalidate the existing saved session", () =>
    withRig(async ({ call }) => {
      const existing = { name: "Returning User", contact: "returning@example.com", consent: true };
      const created = await call("POST", "/web/session", { body: existing });
      const token = created.json.token as string;

      const wrong = await call("POST", "/web/resume", {
        token,
        body: { name: "Returning User", contact: "wrong@example.com", consent: true },
      });
      assert.equal(wrong.status, 409);

      // The same token is still valid; correcting the contact resumes the original customer.
      const corrected = await call("POST", "/web/resume", { token, body: existing });
      assert.equal(corrected.status, 200);
      assert.equal((await call("GET", "/web/history", { token })).status, 200);
    }, { web: { sessionsPerIpHour: 1 } }));

  test("messages per minute per customer, then it frees up", () =>
    withRig(async ({ t, start, say, advance }) => {
      const token = await start();
      for (let i = 0; i < 3; i++) {
        t.llm.push(modelReply({ reply: "ok" }));
        assert.equal((await say(token, "hi " + i)).status, 200);
      }
      const r = await say(token, "one more");
      assert.equal(r.status, 429);
      assert.equal(t.llm.prompts.length, 3); // the blocked message never reached Claude
      advance(60_001);
      t.llm.push(modelReply({ reply: "ok" }));
      assert.equal((await say(token, "later")).status, 200);
    }, { web: { msgPerMinute: 3 } }));

  test("messages per day per customer", () =>
    withRig(async ({ t, start, say, advance }) => {
      const token = await start();
      for (let i = 0; i < 2; i++) {
        t.llm.push(modelReply({ reply: "ok" }));
        assert.equal((await say(token, "hi")).status, 200);
        advance(61_000); // stay under the per-minute limit
      }
      assert.equal((await say(token, "hi")).status, 429);
    }, { web: { msgPerDay: 2 } }));

  test("global daily cap stops the Claude bill with a 503", () =>
    withRig(async ({ t, start, say }) => {
      const a = await start("A", "5198043658");
      const b = await start("B", "5198040102");
      t.llm.push(modelReply(), modelReply());
      assert.equal((await say(a, "hi")).status, 200);
      assert.equal((await say(b, "hi")).status, 200);
      const r = await say(a, "hi again");
      assert.equal(r.status, 503);
      assert.equal(t.llm.prompts.length, 2);
    }, { web: { globalPerDay: 2 } }));

  test("client IP comes from the proxy header only when PROXY_HOPS is set", async () => {
    // hops = 1: the last X-Forwarded-For entry is the one the proxy added. A spoofed first entry must not help.
    await withRig(async ({ call }) => {
      const body = { name: "A", contact: "5198043658", consent: true };
      const spoof = (n: number) => ({ "x-forwarded-for": `9.9.9.${n}, 1.2.3.4` });
      assert.equal((await call("POST", "/web/session", { body, headers: spoof(1) })).status, 200);
      assert.equal((await call("POST", "/web/session", { body, headers: spoof(2) })).status, 429);
      assert.equal((await call("POST", "/web/session", { body, headers: { "x-forwarded-for": "9.9.9.3, 5.6.7.8" } })).status, 200);
    }, { web: { proxyHops: 1, sessionsPerIpHour: 1 } });
    // hops = 0: the header is ignored, so everyone shares the socket address
    await withRig(async ({ call }) => {
      const body = { name: "A", contact: "5198043658", consent: true };
      assert.equal((await call("POST", "/web/session", { body, headers: { "x-forwarded-for": "9.9.9.1" } })).status, 200);
      assert.equal((await call("POST", "/web/session", { body, headers: { "x-forwarded-for": "9.9.9.2" } })).status, 429);
    }, { web: { proxyHops: 0, sessionsPerIpHour: 1 } });
  });

  test("too many wrong owner tokens locks the guesser out, even for the right token", () =>
    withRig(async ({ call, advance }) => {
      for (let i = 0; i < 10; i++) assert.equal((await call("GET", "/api/state", { token: "guess" + i })).status, 401);
      const locked = await call("GET", "/api/state", { token: "secret" });
      assert.equal(locked.status, 429);
      assert.ok(Number(locked.headers.get("retry-after")) > 0);
      advance(15 * 60_000 + 1000);
      assert.equal((await call("GET", "/api/state", { token: "secret" })).status, 200);
    }));

  test("whoami shows the IP the limits use, owner only", () =>
    withRig(async ({ call }) => {
      assert.equal((await call("GET", "/api/whoami")).status, 401);
      const r = await call("GET", "/api/whoami", { token: "secret", headers: { "x-forwarded-for": "9.9.9.9, 1.2.3.4, 10.0.0.1" } });
      assert.equal(r.json.ip, "1.2.3.4");
      assert.equal(r.json.proxyHops, 2);
    }, { web: { proxyHops: 2 } }));

  test("oversized request bodies get a clean 413", () =>
    withRig(async ({ call }) => {
      const r = await call("POST", "/web/session", { body: JSON.stringify({ name: "x".repeat(300_000), contact: "5198043658", consent: true }) });
      assert.equal(r.status, 413);
      assert.equal((await call("GET", "/health")).status, 200);
    }));
});

test("the simulator stays off unless switched on, and the desk needs the token", async () => {
  await withRig(async ({ call }) => {
    assert.equal((await call("POST", "/sim/message", { body: { from: "a", text: "b" } })).status, 404);
    assert.equal((await call("GET", "/api/state")).status, 401);
    const st = await call("GET", "/api/state", { token: "secret" });
    assert.deepEqual(st.json.features, { simulator: false, web: true });
  });
  assert.equal(loadConfig({}).simulator, false);
});

describe("web: menu status, pickup days and human handoff", () => {
  test("every dish shows exactly one availability status; the Sunday special is off, and shows its date when on", () =>
    withRig(async ({ t, call }) => {
      const m = (await call("GET", "/web/menu")).json;
      const by = (id: string) => m.items.find((x: any) => x.id === id);
      assert.equal(by("sunday_bogo_special").live, false);
      assert.equal(by("sunday_bogo_special").availability, "Not running right now");
      assert.doesNotMatch(by("sunday_bogo_special").desc, /only this Sunday|Available only/i);
      assert.equal(by("kheema_fry").availability, "Pickup Fri to Sun");
      assert.equal(by("plan_full").availability, "Pickup Mon to Fri");
      const menu = t.store.getMenu();
      menu.find((x) => x.id === "sunday_bogo_special")!.live = true;
      t.store.putMenu(menu);
      const on = (await call("GET", "/web/menu")).json.items.find((x: any) => x.id === "sunday_bogo_special");
      assert.match(on.availability, /^Sunday only · September 27$/);
      assert.deepEqual(m.contact, { instagram: "annapurna_hometaste", phone: "" });
    }));

  test("Talk to a person: visible status in history, one alert, cleared when the owner replies", () =>
    withRig(async ({ t, call, start }) => {
      const token = await start("Asha");
      assert.equal((await call("GET", "/web/history", { token })).json.handoff, null);
      const h = await call("POST", "/web/handoff", { token });
      assert.equal(h.status, 200);
      assert.match(h.json.messages.at(-1).text, /sent your request to Annapurna Home Foods/);
      assert.ok(h.json.handoff.at > 0);
      assert.ok((await call("GET", "/web/history", { token })).json.handoff, "status stays visible");
      await call("POST", "/web/handoff", { token });
      assert.equal(t.store.listAlerts(true).filter((a) => a.note.startsWith("Wants to talk to a person")).length, 1);
      const waId = t.store.listCustomers()[0]!.waId;
      await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "Hi Asha, this is Annapurna." } });
      assert.equal((await call("GET", "/web/history", { token })).json.handoff, null);
      assert.equal((await call("POST", "/web/handoff", {})).status, 401);
    }));

  test("owner can edit combo pickup days and contact details", () =>
    withRig(async ({ t, call }) => {
      const r = await call("PUT", "/api/settings", { token: "secret", body: { comboDays: [6, 0], contactInstagram: "@my.shop", contactPhone: "519 555 0100 <b>" } });
      assert.equal(r.status, 200, r.text);
      const s = t.store.getSettings();
      assert.deepEqual(s.comboDays, [0, 6]);
      assert.equal(s.contactInstagram, "my.shop");
      assert.equal(s.contactPhone, "519 555 0100");
    }));
});


test("Round 9: stale custom refusal cannot swallow the next normal order", () =>
  withRig(async ({ t, start, say, call }) => {
    const token = await start("Rowan", "rowan@example.com");
    await say(token, "20 Bagara Rice and Chicken Fry combos, pickup Saturday 5pm");
    const waId = t.store.listCustomers()[0]!.waId;
    assert.ok(t.store.getDraft(waId)?.custom);
    await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$140" } });

    t.llm.push(modelReply({
      reply: "Okay, updated to 25 people.",
      items: [{ id: "bagara_chicken_fry", qty: 25, pack: "single", asked_for: "Bagara rice and chicken fry for 25 people" }],
      pickup: "2026-09-26T17:00",
      stage: "collecting",
    }));
    await say(token, "Actually make it for 25 people instead");
    assert.equal(t.store.getDraft(waId)!.custom?.price, null);

    const stale = await say(token, "I confirm the $140 price for this order");
    assert.equal(stale.json.orderId, null);
    assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);

    t.llm.push(modelReply({
      reply: "Here is your review.",
      items: [{ id: "fry_piece_pulao", qty: 1, pack: "single", asked_for: "Gongura Fry Piece Pulao combo" }],
      pickup: "2026-10-04T13:00",
      notes: "Medium spice, no extras",
      stage: "awaiting_confirmation",
    }));
    const normal = await say(token, "1 Gongura Fry Piece Pulao combo, medium, pickup Sunday Oct 4 1pm, no extras");
    assert.equal(t.store.getDraft(waId)?.custom, undefined);
    assert.ok(normal.json.messages.some((m: any) => /1 x Gongura Fry Piece Pulao combo: \$17/.test(m.text)));

    const placed = await say(token, "YES");
    assert.equal(placed.json.orderId, 1);
    const orders = (await call("GET", "/web/orders", { token })).json.orders;
    assert.equal(orders.length, 1);
    assert.equal(orders[0].total, 17);
    assert.deepEqual(orders[0].items, ["1 x Gongura Fry Piece Pulao combo"]);
  }));

test("Round 9: model cannot say Confirming this now or went through without a real order number", () =>
  withRig(async ({ t, start, say, call }) => {
    const token = await start("Rowan", "rowan2@example.com");
    t.llm.push(modelReply({ reply: "Perfect — Confirming this now!" }));
    const a = await say(token, "hello");
    assert.ok(a.json.messages.some((m: any) => /haven't placed an order/i.test(m.text)));
    t.llm.push(modelReply({ reply: "Yes Rowan, that one went through!" }));
    const b = await say(token, "did that go through?");
    assert.ok(b.json.messages.some((m: any) => /haven't placed an order/i.test(m.text)));
    assert.equal((await call("GET", "/web/orders", { token })).json.orders.length, 0);
  }));

test("Round 9: new 20-person catering request after a confirmed order starts a fresh custom request", () =>
  withRig(async ({ t, start, say }) => {
    const token = await start("Repeat Caterer", "repeat@example.com");
    const waId = t.store.listCustomers()[0]!.waId;
    t.store.insertOrder({
      waId,
      name: "Repeat Caterer",
      items: [{ id: "custom:1", name: "Bagara Rice and Chicken Fry combo · custom catering", qty: 15, pack: "single", amt: 120 }],
      pickup: "2026-09-26T17:00",
      flags: [],
      status: "cook",
      notes: "Earlier custom order",
      createdAt: NOW,
    });

    const beforePrompts = t.llm.prompts.length;
    const r = await say(token, "Bagara rice and chicken fry for 20 people, next Saturday 5pm, medium spice");
    assert.equal(t.llm.prompts.length, beforePrompts);
    assert.ok(t.store.getDraft(waId)?.custom);
    assert.equal(t.store.getDraft(waId)!.items[0]?.qty, 20);
    assert.ok(r.json.messages.some((m: any) => /custom\/bulk request/i.test(m.text)));
    assert.equal(t.store.listAlerts(true).filter((a) => a.waId === waId && /Custom\/bulk request/.test(a.note)).length, 1);
    assert.equal(t.store.listAlerts(true).some((a) => /cancel or change order/i.test(a.note)), false);
  }));

test("Round 9: a fulfilled custom order automatically closes its Needs-you alert", () =>
  withRig(async ({ t, start, say, call }) => {
    const token = await start("Alert Clear", "alertclear@example.com");
    await say(token, "25 Bagara Rice and Chicken Fry combos, pickup Saturday 5pm");
    const waId = t.store.listCustomers()[0]!.waId;
    assert.equal(t.store.listAlerts(true).filter((a) => a.waId === waId && /Custom\/bulk request/.test(a.note)).length, 1);
    await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "$180" } });
    const placed = await say(token, "CONFIRM THE ORDER");
    assert.equal(placed.json.orderId, 1);
    assert.equal(t.store.listAlerts(true).filter((a) => a.waId === waId && /Custom\/bulk request/.test(a.note)).length, 0);
  }));

test("Round 9: Done on an alert creates no customer chat message", () =>
  withRig(async ({ t, start, say, call }) => {
    const token = await start("Alert Done", "alertdone@example.com");
    await say(token, "25 Bagara Rice and Chicken Fry combos, pickup Saturday 5pm");
    const waId = t.store.listCustomers()[0]!.waId;
    const alert = t.store.listAlerts(true).find((a) => a.waId === waId)!;
    const before = t.store.getMessages(waId, 200).map((m) => [m.who, m.text]);
    const done = await call("POST", `/api/alerts/${alert.id}/done`, { token: "secret" });
    assert.equal(done.status, 200);
    assert.deepEqual(t.store.getMessages(waId, 200).map((m) => [m.who, m.text]), before);
  }));

test("Round 9: bare owner prices become complete quote messages and lifecycle notes are system-authored", () =>
  withRig(async ({ t, start, say, call }) => {
    const token = await start("Clean Bubbles", "cleanbubbles@example.com");
    await say(token, "25 Bagara Rice and Chicken Fry combos, pickup Saturday 5pm");
    const waId = t.store.listCustomers()[0]!.waId;
    const quote = await call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text: "180$" } });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.message.text, "Annapurna Home Foods quoted $180 for this custom order.");
    assert.equal(t.store.getMessages(waId, 200).some((m) => m.text === "180$"), false);

    const placed = await say(token, "CONFIRM THE ORDER");
    assert.equal(placed.json.orderId, 1);
    await call("POST", "/api/orders/1/status", { token: "secret", body: { status: "ready", confirm: true } });
    const ready = t.store.getMessages(waId, 200).filter((m) => /ready for pickup/i.test(m.text)).at(-1)!;
    assert.equal(ready.who, "agent");
  }));
