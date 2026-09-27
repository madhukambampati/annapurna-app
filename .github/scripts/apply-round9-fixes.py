from pathlib import Path

agent = Path('src/agent.ts')
s = agent.read_text()

old = '''const PLACEMENT_CLAIM = /\\b(?:order\\s+(?:is\\s+|has\\s+been\\s+)?(?:confirmed|placed|booked)|(?:confirmed|placed|booked)\\s+(?:the\\s+|your\\s+)?order|lock(?:ing|ed)?\\s+(?:this|it|the order)\\s+in)\\b/i;'''
new = '''const PLACEMENT_CLAIM = /\\b(?:order\\s+(?:is\\s+|has\\s+been\\s+|was\\s+)?(?:confirm(?:ed|ing)|placed|booked)|(?:confirm(?:ed|ing)|placed|booked)\\s+(?:this|it|the\\s+order|your\\s+order)|(?:this|it|that|the\\s+order|your\\s+order)\\s+(?:went|has\\s+gone|is\\s+going)\\s+through|(?:went|gone|going)\\s+through|successfully\\s+(?:placed|confirmed|booked)|lock(?:ing|ed)?\\s+(?:this|it|the order)\\s+in)\\b/i;
const PLACED_ORDER_CHANGE = /\\b(?:change|modify|cancel|update|edit|replace)\\b/i;'''
assert old in s
s = s.replace(old, new, 1)

anchor = '''function deterministicCustomStart(text: string, menu: MenuItem[]): boolean {
  return CUSTOM_RECIPE_WORDS.test(text) || bulkMenuQuantity(text, menu) != null;
}
'''
insert = anchor + '''
/** A clearly unrelated normal menu order can safely replace a stale custom draft. */
function clearlyNormalMenuOrder(text: string, menu: MenuItem[]): boolean {
  if (looksCustom(text, menu) || CUSTOM_CONFIRM.test(text)) return false;
  const orderSignal = /^\\s*\\d+\\b/.test(text) || /\\b(?:order|want|need|would like|add|get me|give me|take)\\b/i.test(text);
  if (!orderSignal) return false;
  const tt = tokens(text);
  return menu.some((it) => {
    const mt = tokens(it.name.replace(/\\s+combo$/i, ""));
    return mt.size > 0 && [...mt].every((t) => tt.has(t));
  });
}
'''
assert anchor in s
s = s.replace(anchor, insert, 1)

anchor2 = '''    // Large explicit quantities and custom-recipe requests are captured before Claude. These are the
    // failure-prone forms from QA; ordinary catering/headcount flows keep their existing behavior.
    if (!draft?.custom && deterministicCustomStart(text, menu)) {
'''
replace2 = '''    // After a stale custom quote has been refused, a clearly unrelated normal menu order starts cleanly.
    // This prevents old custom state from swallowing the next normal confirmation. The old custom alert
    // is also closed so the owner cannot later quote an abandoned/stale request from an old screen.
    const afterStaleCustomRefusal = !!draft?.custom && draft.custom.price == null &&
      /(?:old quote|quote the current request again|final price must come from Annapurna Home Foods|still need the final price)/i.test(lastShop ?? "");
    if (afterStaleCustomRefusal && clearlyNormalMenuOrder(text, menu)) {
      store.clearDraft(msg.from);
      for (const a of store.listAlerts(true)) {
        if (a.waId === msg.from && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);
      }
      draft = null;
      out.issues.push("stale_custom_cleared_for_normal_order");
    }

    // Large explicit quantities and custom-recipe requests are captured before Claude. A fresh
    // catering/headcount request immediately after an already-placed order is also forced down this
    // path so it cannot be mistaken for a change/cancel request for that earlier order.
    const freshCustomAfterPlaced = !draft?.custom && open.length > 0 && looksCustom(text, menu) && !PLACED_ORDER_CHANGE.test(text);
    if (!draft?.custom && (deterministicCustomStart(text, menu) || freshCustomAfterPlaced)) {
'''
assert anchor2 in s
s = s.replace(anchor2, replace2, 1)

old_guard = '''    if (!custom && PLACEMENT_CLAIM.test(reply)) {
      const hasRealOrderNumber = open.some((o) => new RegExp(`#${o.id}\\\\b`).test(reply));
      if (!hasRealOrderNumber) {
        reply = "I haven't placed an order from that message. Tell me what you'd like, and I'll show you a Check your order review before anything is placed.";
        out.issues.push("false_confirmation_blocked");
      }
    }
'''
new_guard = '''    if (!custom && PLACEMENT_CLAIM.test(reply)) {
      const hasRealOrderNumber = open.some((o) => new RegExp(`#${o.id}\\\\b`).test(reply));
      if (!hasRealOrderNumber) {
        reply = "I haven't placed an order from that message. Tell me what you'd like, and I'll show you a Check your order review before anything is placed.";
        out.issues.push("false_confirmation_blocked");
      }
    }
'''
# Keep the existing real-order-number exception for factual status replies, but the broadened regex
# now catches "Confirming this now" and "went through" claims with no order number.
assert old_guard in s
s = s.replace(old_guard, new_guard, 1)

anchor3 = '''    const order = store.insertOrder({
      waId, name, items: [item], pickup: draft.pickup_local, flags: [], status: "cook", notes, createdAt: now,
    });
    store.clearDraft(waId);
'''
replace3 = '''    const order = store.insertOrder({
      waId, name, items: [item], pickup: draft.pickup_local, flags: [], status: "cook", notes, createdAt: now,
    });
    // The Needs-you custom request is fulfilled by this real order. Close every still-open
    // unlinked custom request alert for this customer so the owner desk does not retain stale work.
    for (const a of store.listAlerts(true)) {
      if (a.waId === waId && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);
    }
    store.clearDraft(waId);
'''
assert anchor3 in s
s = s.replace(anchor3, replace3, 1)
agent.write_text(s)

server = Path('src/server.ts')
s = server.read_text()
old_import = 'import { dayRange, itemDays, itemLabel, total } from "./menu.js";'
new_import = 'import { dayRange, itemDays, itemLabel, money, total } from "./menu.js";'
assert old_import in s
s = s.replace(old_import, new_import, 1)

old_low = '''function lowValueOwnerReply(text: string): boolean {
  return /^(?:ok(?:ay)?|yes|no|sure|thanks|thank you|no thank you|yes please|got it|fine|alright)[\\s.!?]*$/i.test(text.trim());
}'''
new_low = '''function lowValueOwnerReply(text: string): boolean {
  return /^(?:ok(?:ay)?|yes|no|sure|thanks|thank you|no thank you|yes please|got it|fine|alright|order\\s+confirm(?:ed|ing)|confirm(?:ed|ing)\\s+ord\\w*)[\\s.!?]*$/i.test(text.trim());
}'''
assert old_low in s
s = s.replace(old_low, new_low, 1)

old_owner_add = '''            const id = store.addMessage(waId, "owner", text, now());

            // Custom/catering orders keep the owner's quoted total in the draft.
'''
new_owner_add = '''            // Bare numeric quotes are valid owner input, but do not leak a fragment such as "120$"
            // into the customer's chat. Store a complete, customer-readable quote instead.
            const customerText = draft?.custom && quoted != null && bareOwnerPrice(text)
              ? `Annapurna Home Foods quoted ${money(quoted)} for this custom order.`
              : text;
            const id = store.addMessage(waId, "owner", customerText, now());

            // Custom/catering orders keep the owner's quoted total in the draft.
'''
assert old_owner_add in s
s = s.replace(old_owner_add, new_owner_add, 1)

old_return = '''            return send(req, res, 200, { message: { id, who: "owner", text, ts: now() } });'''
new_return = '''            return send(req, res, 200, { message: { id, who: "owner", text: customerText, ts: now() } });'''
assert old_return in s
s = s.replace(old_return, new_return, 1)

old_status = '''          if (note) store.addMessage(o.waId, "owner", note, now());'''
new_status = '''          if (note) store.addMessage(o.waId, "agent", note, now());'''
assert old_status in s
s = s.replace(old_status, new_status, 1)
server.write_text(s)

# Add regression coverage matching the manual QA sequences.
test = Path('test/web.test.ts')
s = test.read_text()
marker = 'Round 9: stale custom refusal cannot swallow the next normal order'
assert marker not in s
s += r'''

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
'''
test.write_text(s)
