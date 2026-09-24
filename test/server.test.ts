import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import type { Server } from "node:http";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { FRI_6PM, modelReply, setup } from "./helpers.js";

describe("http server", () => {
  const t = setup({ judge: (c) => (c.awaitingConfirmation && /^yes/i.test(c.message) ? { agrees: 0.97 } : {}) });
  let server: Server;
  let base = "";
  const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
    const { token, ...rest } = init;
    const r = await fetch(base + path, {
      ...rest,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, json, text };
  };
  const post = (path: string, body: unknown, token?: string) => call(path, { method: "POST", body: JSON.stringify(body), token });

  before(async () => {
    const cfg = { ...t.cfg, ownerToken: "secret", simulator: true };
    server = createServer({ agent: t.agent, store: t.store, cfg, assets: { "index.html": "<html>shop</html>", "desk.html": "<html>desk</html>", "desk.js": "//desk" } });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  test("health and index are public", async () => {
    assert.deepEqual((await call("/health")).json, { ok: true });
    assert.equal((await call("/")).text, "<html>shop</html>");
    assert.equal((await call("/desk")).text, "<html>desk</html>");
  });

  test("owner API needs the token, and compares it safely", async () => {
    assert.equal((await call("/api/state")).status, 401);
    assert.equal((await call("/api/state", { token: "wrong" })).status, 401);
    assert.equal((await call("/api/state", { token: "secre" })).status, 401);
    assert.equal((await call("/api/state", { token: "secret" })).status, 200);
  });

  test("simulator: message -> read-back -> yes -> order shows up in the console", async () => {
    t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 2, pack: "bogo", asked_for: "kheema fry" }], pickup: FRI_6PM, name: "Asha", stage: "awaiting_confirmation" }));
    const a = await post("/sim/message", { from: "+15195550101", text: "2 kheema fry bogo friday 6pm" });
    assert.equal(a.status, 200);
    assert.match(a.json.replies[0], /Total: \$56/);
    const b = await post("/sim/message", { from: "+15195550101", text: "yes" });
    assert.equal(b.json.orderId, 1);
    const s = await call("/api/state", { token: "secret" });
    assert.equal(s.json.orders.length, 1);
    assert.equal(s.json.orders[0].status, "cook");
    const h = await call("/sim/history?from=%2B15195550101");
    assert.equal(h.json.messages.length, 4);
  });

  test("simulator validates input", async () => {
    assert.equal((await post("/sim/message", { from: "", text: "hi" })).status, 400);
    assert.equal((await post("/sim/message", { from: "x" })).status, 400);
    assert.equal((await call("/sim/message", { method: "POST", body: "[1]" })).status, 400);
    assert.equal((await call("/sim/message", { method: "POST", body: "not json" })).status, 400);
    assert.equal((await call("/sim/message", { method: "POST", body: JSON.stringify({ from: "x", text: "y".repeat(200_000) }) })).status, 413);
  });

  test("order status moves follow the allowed steps only", async () => {
    assert.equal((await post("/api/orders/1/status", { status: "done" }, "secret")).status, 400); // cook -> done not allowed
    assert.equal((await post("/api/orders/1/status", { status: "ready" }, "secret")).json.order.status, "ready");
    assert.equal((await post("/api/orders/1/status", { status: "done" }, "secret")).json.order.status, "done");
    assert.equal((await post("/api/orders/1/status", { status: "cancelled" }, "secret")).status, 400); // done is final
    assert.equal((await post("/api/orders/99/status", { status: "ready" }, "secret")).status, 404);
  });

  test("accepting a held order clears its flags", async () => {
    t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: "2026-09-26T12:00", stage: "awaiting_confirmation" }));
    await post("/sim/message", { from: "+1416", text: "1 kheema fry saturday noon" });
    const y = await post("/sim/message", { from: "+1416", text: "yes" });
    const id = y.json.orderId;
    assert.equal(t.store.getOrder(id)!.status, "hold");
    const r = await post(`/api/orders/${id}/status`, { status: "cook" }, "secret");
    assert.deepEqual([r.json.order.status, r.json.order.flags], ["cook", []]);
  });

  test("cook and buy summary", async () => {
    const c = await call("/api/cook", { token: "secret" });
    assert.equal(c.status, 200);
    assert.equal(c.json.days.length, 1); // only the accepted Saturday order is still 'cook'
    assert.equal(c.json.days[0].date, "2026-09-26");
  });

  test("menu edits: switch a combo off, set a price, reject bad numbers", async () => {
    const off = await call("/api/menu/kheema_fry", { method: "PATCH", body: JSON.stringify({ live: false }), token: "secret" });
    assert.equal(off.json.item.live, false);
    assert.equal(t.store.getMenu().find((m) => m.id === "kheema_fry")!.live, false);
    const price = await call("/api/menu/bagara_chicken_fry", { method: "PATCH", body: JSON.stringify({ single: 19, bogo: 30 }), token: "secret" });
    assert.deepEqual([price.json.item.single, price.json.item.bogo, price.json.item.verify], [19, 30, false]);
    assert.equal((await call("/api/menu/bagara_chicken_fry", { method: "PATCH", body: JSON.stringify({ single: -5 }), token: "secret" })).status, 400);
    assert.equal((await call("/api/menu/bagara_chicken_fry", { method: "PATCH", body: JSON.stringify({ single: "abc" }), token: "secret" })).status, 400);
    assert.equal((await call("/api/menu/nope", { method: "PATCH", body: "{}", token: "secret" })).status, 404);
  });

  test("settings update is validated", async () => {
    const r = await call("/api/settings", { method: "PUT", body: JSON.stringify({ noticeHrs: 3, days: [1, 3, 9, "x", 3, 5], address: "  12 Test St " }), token: "secret" });
    assert.deepEqual([r.json.settings.noticeHrs, r.json.settings.days, r.json.settings.address], [3, [1, 3, 5], "12 Test St"]);
    assert.equal(t.store.getSettings().noticeHrs, 3);
  });

  test("alerts can be marked done", async () => {
    t.store.insertAlert({ waId: "w", cust: "X", note: "n", orderId: null, createdAt: 0 });
    const id = t.store.listAlerts(true)[0]!.id;
    await post(`/api/alerts/${id}/done`, {}, "secret");
    assert.equal(t.store.listAlerts(true).length, 0);
  });

  test("unknown routes 404, and errors do not leak internals", async () => {
    assert.equal((await call("/nope")).status, 404);
    assert.equal((await call("/api/nope", { token: "secret" })).status, 404);
  });
});

test("simulator can be switched off; owner API is open only when no token is configured", async () => {
  const t = setup();
  const server = createServer({ agent: t.agent, store: t.store, cfg: { ...loadConfig({}), simulator: false }, assets: {} });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const sim = await fetch(base + "/sim/message", { method: "POST", body: JSON.stringify({ from: "a", text: "b" }) });
    assert.equal(sim.status, 404);
    assert.equal((await fetch(base + "/api/state")).status, 200);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
