import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import { loadConfig, type Config } from "../src/config.js";
import { RateLimiter } from "../src/limiter.js";
import { createServer, validContact } from "../src/server.js";
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
  const start = async (name = "Asha", contact = "519-555-0101", headers?: Record<string, string>) => {
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

test("validContact accepts phones and emails, rejects junk", () => {
  for (const ok of ["519-555-0101", "+1 (519) 555 0101", "maddy@example.com", "5195550101"]) assert.equal(validContact(ok), true, ok);
  for (const bad of ["", "abc", "12345", "not an email@", "a@b", "<script>alert(1)</script>", "x".repeat(81)]) assert.equal(validContact(bad), false, bad);
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
      assert.equal((await call("POST", "/web/session", { body: { name: "A", contact: "5195550101", consent: true } })).status, 404);
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
      assert.equal((await s({ name: "", contact: "5195550101", consent: true })).status, 400);
      assert.equal((await s({ name: "A", contact: "nope", consent: true })).status, 400);
      assert.equal((await s({ name: "A", contact: "5195550101" })).status, 400);
      assert.equal((await s({ name: "A", contact: "5195550101", consent: "true" })).status, 400);
      assert.equal((await call("POST", "/web/session", { body: "not json" })).status, 400);
      const ok = await s({ name: "  Asha  ", contact: "5195550101", consent: true });
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
      t.llm.push(modelReply({ reply: "Sure, noted.", items: [{ id: "kheema_fry", qty: 2, pack: "bogo", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
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
      assert.match(o.json.orders[0].pickupText, /Fri/);
      // the desk sees name and contact
      const st = await call("GET", "/api/state", { token: "secret" });
      assert.equal(st.json.orders[0].contact, "asha@example.com");
      assert.equal(st.json.customers[0].contact, "asha@example.com");
    }));

  test("customers cannot see each other's chats or orders", () =>
    withRig(async ({ t, start, say, call }) => {
      const a = await start("Asha", "5195550101");
      const b = await start("Bala", "5195550102");
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
      assert.ok(r.json.messages.some((m: any) => m.who === "agent"));
      assert.ok(t.store.listAlerts(true).length >= 1);
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
      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "ready" } });

      const h = await call("GET", `/web/history?after=${last}`, { token });
      const owner = h.json.messages.filter((m: any) => m.who === "owner").map((m: any) => m.text);
      assert.equal(owner.length, 3);
      assert.equal(owner[0], "Monday works, see you then!");
      assert.match(owner[1], /confirmed your order #1/);
      assert.match(owner[2], /ready for pickup/);

      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "done" } });
      const after = (await call("GET", "/web/history", { token })).json.messages;
      const thanks = after.at(-1);
      assert.equal(thanks.who, "agent");
      assert.match(thanks.text, /Thank you for your order, Asha! Enjoy your food/);
      assert.match(thanks.text, /instagram\.com\/annapurna_hometaste/);
      // moving back and forth does not send it twice
      await call("POST", `/api/orders/${id}/status`, { token: "secret", body: { status: "done" } }).catch(() => null);
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
      const owner = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "owner");
      assert.match(owner.at(-1).text, /cancelled/);
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
      assert.equal((await call("DELETE", "/web/me", { token })).status, 200);
      assert.equal(t.store.getMessages(wa, 50).length, 0);
      assert.equal((await call("GET", "/web/history", { token })).status, 401);
      assert.equal(t.store.listOrders().length, 1);
    }));
});

describe("web: abuse limits", () => {
  test("new chats per IP per hour", () =>
    withRig(async ({ call, advance }) => {
      const body = { name: "A", contact: "5195550101", consent: true };
      for (let i = 0; i < 2; i++) assert.equal((await call("POST", "/web/session", { body })).status, 200);
      const blocked = await call("POST", "/web/session", { body });
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
      advance(3_600_001);
      assert.equal((await call("POST", "/web/session", { body })).status, 200);
    }, { web: { sessionsPerIpHour: 2 } }));

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
      const a = await start("A", "5195550101");
      const b = await start("B", "5195550102");
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
      const body = { name: "A", contact: "5195550101", consent: true };
      const spoof = (n: number) => ({ "x-forwarded-for": `9.9.9.${n}, 1.2.3.4` });
      assert.equal((await call("POST", "/web/session", { body, headers: spoof(1) })).status, 200);
      assert.equal((await call("POST", "/web/session", { body, headers: spoof(2) })).status, 429);
      assert.equal((await call("POST", "/web/session", { body, headers: { "x-forwarded-for": "9.9.9.3, 5.6.7.8" } })).status, 200);
    }, { web: { proxyHops: 1, sessionsPerIpHour: 1 } });
    // hops = 0: the header is ignored, so everyone shares the socket address
    await withRig(async ({ call }) => {
      const body = { name: "A", contact: "5195550101", consent: true };
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
      const r = await call("POST", "/web/session", { body: JSON.stringify({ name: "x".repeat(300_000), contact: "5195550101", consent: true }) });
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
