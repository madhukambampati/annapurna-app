import assert from "node:assert/strict";
import { test } from "node:test";
import { FRI_6PM, judgment, modelReply, setup, TZ } from "./helpers.js";
import { localToEpoch } from "../src/time.js";

const KHEEMA_BOGO = { id: "kheema_fry", qty: 2, pack: "bogo", asked_for: "chicken kheema fry combos" };
const yesJudge = (ctx: { message: string; awaitingConfirmation: boolean }) =>
  ctx.awaitingConfirmation && /^yes/i.test(ctx.message) ? { agrees: 0.97 } : {};

/** Runs the usual first turn: customer orders, model proposes, code reads back. */
async function orderAndReadBack(t: ReturnType<typeof setup>, items = [KHEEMA_BOGO], pickup: string | null = FRI_6PM, said = "2 chicken kheema fry combos buy 1 get 1, friday 6pm") {
  t.llm.push(modelReply({ reply: "Sure, noted!", items, pickup, name: "Asha", stage: "awaiting_confirmation" }));
  return t.say(said);
}

test("happy path: model proposes, CODE reads back, customer says yes, CODE places the order", async () => {
  const t = setup({ judge: yesJudge });
  const r1 = await orderAndReadBack(t);
  assert.equal(r1.route, "normal");
  const rb = r1.replies[0]!;
  assert.match(rb, /Please check your order/);
  assert.match(rb, /2 x Chicken Kheema Fry combo \(Buy 1 Get 1\): \$56/);
  assert.match(rb, /Total: \$56/);
  assert.match(rb, /Pickup: Fri, Sep 25 · 6:00 PM at 1425B Blockline Rd, Kitchener/);
  assert.match(rb, /Reply YES/);
  assert.doesNotMatch(rb, /Sure, noted/, "the model's own wording must not replace the read-back");
  assert.equal(t.store.getDraft("+15195550101")!.stage, "awaiting_confirmation");
  assert.equal(t.store.listOrders().length, 0, "nothing is placed before the customer says yes");

  const r2 = await t.say("yes");
  assert.equal(r2.route, "confirm_order");
  assert.equal(t.llm.prompts.length, 1, "no model call is needed to place an order");
  const orders = t.store.listOrders();
  assert.equal(orders.length, 1);
  assert.deepEqual([orders[0]!.status, orders[0]!.flags, orders[0]!.pickup, orders[0]!.name], ["cook", [], FRI_6PM, "Asha"]);
  assert.match(r2.replies[0]!, /Order #1 is confirmed/);
  assert.match(r2.replies[0]!, /Total: \$56/);
  assert.match(r2.replies[0]!, /Fri, Sep 25 · 6:00 PM/);
  assert.equal(t.store.getDraft("+15195550101"), null);
  assert.equal(t.notifier.sent[0]!.title, "New order #1");
  assert.match(t.store.getCustomer("+15195550101")!.profile, /Last order/);
});

test("the model saying 'confirmed' does nothing: only the customer's yes places an order", async () => {
  const t = setup();
  t.llm.push({ ...(modelReply({ items: [KHEEMA_BOGO], pickup: FRI_6PM }) as object), stage: "confirmed", reply: "Your order is confirmed!" });
  const r = await t.say("2 kheema fry friday 6pm");
  assert.equal(t.store.listOrders().length, 0);
  assert.equal(t.store.getDraft("+15195550101")!.stage, "collecting");
  assert.equal(r.orderId, undefined);
});

test("a bare 'yes' with no read-back pending never creates an order", async () => {
  const t = setup({ judge: () => ({ agrees: 0.99 }) }); // even if the judge is over-eager
  t.llm.push(modelReply({ reply: "Yes to what? What would you like to order?" }));
  await t.say("yes");
  assert.equal(t.store.listOrders().length, 0);
});

test("regression: asked for Bagara rice and chicken fry, model wrote kheema fry", async () => {
  const t = setup({ judge: yesJudge });
  const menu = t.store.getMenu();
  const bagara = menu.find((m) => m.id === "bagara_chicken_fry")!;
  bagara.single = null;
  bagara.bogo = null;
  t.store.putMenu(menu);
  const r = await orderAndReadBack(t, [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "Bagara rice and chicken fry" }]);
  assert.deepEqual(r.issues, ["corrected_item"]);
  assert.match(r.replies[0]!, /Bagara Rice and Chicken Fry combo/);
  assert.doesNotMatch(r.replies[0]!, /Kheema/);
  // no price is set for this combo (removed from the menu here), so Maddy confirms it
  assert.match(r.replies[0]!, /price to be confirmed/);
  assert.match(r.replies[0]!, /Annapurna Home Foods needs to confirm this order first \(price not set\)/);
  const r2 = await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.deepEqual([o.status, o.flags], ["hold", ["Price not set"]]);
  assert.equal(o.items[0]!.id, "bagara_chicken_fry");
  assert.match(r2.replies[0]!, /reach out to you here in this chat/);
  assert.equal(t.notifier.sent.at(-1)!.title, "Order #1 needs you");
});

test("a dish that is not on the menu is not swapped for another; Maddy is told", async () => {
  const t = setup();
  t.llm.push(modelReply({ reply: "Sure, paneer tikka coming up!", items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "paneer tikka masala" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
  const r = await t.say("1 paneer tikka masala friday 6pm");
  assert.match(r.replies[0]!, /I don't see "paneer tikka masala" on the ordering menu/);
  assert.doesNotMatch(r.replies[0]!, /coming up/);
  assert.equal(t.store.getDraft("+15195550101")!.items.length, 0);
  assert.equal(t.store.listAlerts(true).length, 1);
  assert.equal(t.store.listOrders().length, 0);
});

test("an ambiguous dish name gets a question with the close matches, not a guess", async () => {
  const t = setup();
  t.llm.push(modelReply({ items: [{ id: "chicken_pulao_salan", qty: 1, pack: "single", asked_for: "chicken pulao" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
  const r = await t.say("1 chicken pulao friday 6pm");
  assert.match(r.replies[0]!, /which one did you mean for "chicken pulao"/);
  assert.match(r.replies[0]!, /Chicken Kheema Pulao with Raitha/);
  assert.match(r.replies[0]!, /Chicken Pulao with Mirchi Ka Salan and Raitha/);
  assert.equal(t.store.getDraft("+15195550101")!.stage, "collecting");
});

test("a weekend combo that is switched off cannot be ordered", async () => {
  const t = setup();
  const menu = t.store.getMenu();
  menu.find((m) => m.id === "kheema_fry")!.live = false;
  t.store.putMenu(menu);
  t.llm.push(modelReply({ reply: "Sure!", items: [KHEEMA_BOGO], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
  const r = await t.say("2 kheema fry combos friday 6pm");
  assert.match(r.replies[0]!, /Chicken Kheema Fry combo isn't running right now/);
  assert.equal(t.store.getDraft("+15195550101")!.items.length, 0);
  assert.equal(t.store.listAlerts(true).length, 1);
});

test("a combo switched off between read-back and yes is not placed", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  const menu = t.store.getMenu();
  menu.find((m) => m.id === "kheema_fry")!.live = false;
  t.store.putMenu(menu);
  const r = await t.say("yes");
  assert.equal(t.store.listOrders().length, 0);
  assert.match(r.replies[0]!, /isn't running right now/);
  assert.match(r.route, /menu_changed/);
});

test("a price changed between read-back and yes is re-confirmed, never charged silently", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t); // shown $56
  const menu = t.store.getMenu();
  menu.find((m) => m.id === "kheema_fry")!.bogo = 30;
  t.store.putMenu(menu);
  const r = await t.say("yes");
  assert.equal(t.store.listOrders().length, 0);
  assert.match(r.replies[0]!, /price was just updated/);
  assert.match(r.replies[0]!, /Total: \$60/);
  const r2 = await t.say("yes");
  assert.equal(t.store.listOrders()[0]!.items[0]!.amt, 60);
  assert.match(r2.replies[0]!, /Total: \$60/);
});

test("regression: customer names Friday, model produced Thursday -> pickup cleared and customer asked", async () => {
  const t = setup();
  t.llm.push(modelReply({ reply: "Great, Thursday 6pm!", items: [KHEEMA_BOGO], pickup: "2026-09-24T18:00", stage: "awaiting_confirmation" }));
  const r = await t.say("2 kheema fry combos, pickup friday 6pm");
  assert.deepEqual(r.issues, ["weekday_mismatch"]);
  assert.match(r.replies[0]!, /did you mean Friday, September 25\?/);
  const d = t.store.getDraft("+15195550101")!;
  assert.equal(d.pickup_local, null);
  assert.equal(d.stage, "collecting");
  assert.equal(d.readback_hash, null);
});

test("edits after the read-back produce a fresh read-back, and the yes applies to the new one", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  t.llm.push(modelReply({ items: [{ ...KHEEMA_BOGO, qty: 3 }], pickup: FRI_6PM, name: "Asha", stage: "awaiting_confirmation" }));
  const r = await t.say("make it 3");
  assert.match(r.replies[0]!, /3 x Chicken Kheema Fry combo \(Buy 1 Get 1\): \$84/);
  await t.say("yes");
  const o = t.store.listOrders();
  assert.equal(o.length, 1);
  assert.deepEqual([o[0]!.items[0]!.qty, o[0]!.items[0]!.amt], [3, 84]);
});

test("a yes that is only probably a yes gets a plain question, not an order", async () => {
  const t = setup({ judge: (c) => (c.awaitingConfirmation ? { agrees: 0.7 } : {}) });
  await orderAndReadBack(t);
  const r = await t.say("hmm ok");
  assert.equal(r.route, "confirm_ask");
  assert.match(r.replies[0]!, /shall I place this order\? Reply YES/);
  assert.equal(t.store.listOrders().length, 0);
  assert.equal(t.llm.prompts.length, 1);
});

test("short notice puts the order on hold, and the read-back says so before the yes", async () => {
  const t = setup({ judge: yesJudge, now: localToEpoch("2026-09-25T12:00", TZ) }); // a Friday, combos can be picked up
  const r = await orderAndReadBack(t, [KHEEMA_BOGO], "2026-09-25T13:00", "2 kheema fry combos today at 1pm"); // 1h from noon
  assert.match(r.replies[0]!, /needs to confirm this order first \(under 2h notice\)/);
  await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.deepEqual([o.status, o.flags], ["hold", ["Under 2h notice"]]);
});

test("a non-pickup day puts the order on hold", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t, [KHEEMA_BOGO], "2026-09-28T12:00", "2 kheema fry combos monday at noon"); // Monday, not a combo day
  await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.deepEqual([o.status, o.flags], ["hold", ["Monday is not a pickup day for Chicken Kheema Fry combo"]]);
});

test("weekend combos can be picked up on Saturday and Sunday, no hold", async () => {
  const t = setup({ judge: yesJudge });
  const r = await orderAndReadBack(t, [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "chicken kheema fry" }], "2026-09-26T12:00", "1 chicken kheema fry saturday at noon");
  assert.doesNotMatch(r.replies[0]!, /needs to confirm/);
  await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.deepEqual([o.status, o.flags], ["cook", []]);
  assert.match(t.llm.prompts[0]!, /never say it is impossible/);
  assert.match(t.llm.prompts[0]!, /"pickup_days":\["Friday","Saturday","Sunday"\]/);
});

test("cancel of a placed order: alert with the order id, the order stays, nothing is claimed as cancelled, no model call", async () => {
  const t = setup({ judge: (c) => (/cancel/i.test(c.message) ? { cancelPlaced: 0.95 } : yesJudge(c)) });
  await orderAndReadBack(t);
  await t.say("yes");
  const calls = t.llm.prompts.length;
  const r = await t.say("please cancel my order");
  assert.equal(r.route, "cancel_placed");
  assert.equal(t.llm.prompts.length, calls);
  assert.match(r.replies[0]!, /passed this to Annapurna Home Foods/);
  assert.doesNotMatch(r.replies[0]!, /(is|been|now) cancel+ed/i);
  const a = t.store.listAlerts(true);
  assert.equal(a.length, 1);
  assert.equal(a[0]!.orderId, 1);
  assert.match(a[0]!.note, /cancel or change order #1/);
  assert.equal(t.store.getOrder(1)!.status, "cook");
  assert.match(t.notifier.sent.at(-1)!.text, /order #1/);
});

test("saying cancel with nothing placed is just chat: the model handles it", async () => {
  const t = setup({ judge: () => ({ cancelPlaced: 0.95 }) });
  t.llm.push(modelReply({ reply: "No problem, I've cleared that.", stage: "browsing" }));
  const r = await t.say("cancel that");
  assert.equal(r.route, "normal");
  assert.equal(t.store.listAlerts(true).length, 0);
});

test("owner topics (payment, delivery, allergy) alert Maddy even if the model forgets to", async () => {
  const t = setup({ judge: () => ({ intent: { label: "owner_topic" as const, prob: 0.9, confidence: 0.8 } }) });
  t.llm.push(modelReply({ reply: "Maddy will confirm delivery and get back to you.", needs_owner: false }));
  const r = await t.say("Do you deliver to Waterloo?");
  assert.equal(r.route, "owner_topic");
  assert.match(t.llm.prompts[0]!, /topic only Maddy can settle/);
  assert.equal(t.store.listAlerts(true).length, 1);
  assert.match(r.replies[0]!, /Maddy will confirm/);
});

test("identical alerts are not raised twice while the first is still open", async () => {
  const t = setup({ judge: () => ({ intent: { label: "owner_topic" as const, prob: 0.9, confidence: 0.8 } }) });
  t.llm.push(modelReply({ reply: "ok", needs_owner: true, owner_note: "Wants delivery" }), modelReply({ reply: "ok", needs_owner: true, owner_note: "Wants delivery" }));
  await t.say("delivery?");
  await t.say("delivery??");
  assert.equal(t.store.listAlerts(true).length, 1);
});

test("unclear turns: the draft is frozen, and Maddy is pulled in after a streak", async () => {
  let unclear = false;
  const t = setup({ judge: () => (unclear ? { intent: { label: "other" as const, prob: 0.9, confidence: 0.8 } } : {}) });
  t.llm.push(modelReply({ items: [KHEEMA_BOGO], pickup: FRI_6PM, stage: "collecting" }));
  await t.say("2 kheema fry combos friday 6pm");
  const before = JSON.stringify(t.store.getDraft("+15195550101"));

  unclear = true;
  // the model tries to wipe the draft on an unclear turn; code ignores that
  t.llm.push(modelReply({ reply: "Sorry, what do you mean?", items: [], pickup: null }));
  const r1 = await t.say("hmm the thing");
  assert.equal(r1.route, "clarify");
  assert.equal(JSON.stringify(t.store.getDraft("+15195550101")), before);
  assert.equal(t.store.listAlerts(true).length, 0);

  t.llm.push(modelReply({ reply: "Could you tell me a bit more?" }));
  const r2 = await t.say("that other one");
  assert.equal(t.store.listAlerts(true).length, 1);
  assert.match(r2.replies[0]!, /asked Annapurna Home Foods to help you/);

  unclear = false; // a normal turn resets the streak
  t.llm.push(modelReply({ items: [KHEEMA_BOGO], pickup: FRI_6PM }));
  await t.say("ok 2 kheema fry");
  assert.equal(t.store.getCustomer("+15195550101")!.uncertainStreak, 0);
});

test("if the judge itself throws, the rules take over and the customer still gets a reply", async () => {
  const t = setup({
    judge: () => {
      throw new Error("judge down");
    },
  });
  t.llm.push(modelReply({ reply: "We have combos and plans!" }));
  const r = await t.say("what's on the menu?");
  assert.equal(r.judgment!.source, "heuristic");
  assert.equal(r.replies[0], "We have combos and plans!");
});

test("model errors give a safe apology and change nothing; the next message works", async () => {
  const t = setup();
  t.llm.push(new Error("boom"));
  const r = await t.say("hi there");
  assert.match(r.route, /model_error/);
  assert.match(r.replies[0]!, /couldn't process that just now/);
  assert.equal(t.store.getDraft("+15195550101"), null);
  assert.match(t.store.listAlerts(true)[0]!.note, /model error/);
  t.llm.push(modelReply({ reply: "Namaste!" }));
  assert.equal((await t.say("hello")).replies[0], "Namaste!");
});

test("malformed model output cannot crash the agent or corrupt the draft", async () => {
  const t = setup();
  t.llm.push({ reply: "ok", draft: { items: "lots", pickup_local: 12345, customer_name: { x: 1 }, notes: 7 }, stage: 99 });
  const r = await t.say("hello");
  assert.equal(r.replies[0], "ok");
  assert.equal(t.store.getDraft("+15195550101"), null);
  t.llm.push(["not", "an", "object"]);
  const r2 = await t.say("hello again");
  assert.match(r2.route, /model_error/);
  t.llm.push({ draft: {} }); // no reply text
  assert.match((await t.say("third")).replies[0]!, /say that again/);
});

test("duplicate provider message ids are ignored (webhook retries)", async () => {
  const t = setup();
  t.llm.push(modelReply({ reply: "hello" }));
  const a = await t.say("hi", "+1519", { messageId: "wamid.1" });
  const b = await t.say("hi", "+1519", { messageId: "wamid.1" });
  assert.equal(a.replies.length, 1);
  assert.deepEqual([b.route, b.replies.length], ["duplicate", 0]);
  assert.equal(t.llm.prompts.length, 1);
});

test("messages from one customer are handled strictly in order", async () => {
  const t = setup();
  t.llm.delayMs = 15;
  t.llm.push(modelReply({ reply: "Reply one" }), modelReply({ reply: "Reply two" }));
  const [a, b] = await Promise.all([t.say("first message"), t.say("second message")]);
  assert.equal(a.replies[0], "Reply one");
  assert.equal(b.replies[0], "Reply two");
  assert.match(t.llm.prompts[1]!, /You: Reply one/, "the second turn must see the first turn's reply");
});

test("customers are isolated from each other", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t); // customer A reads back
  t.llm.push(modelReply({ reply: "Hi B" }));
  await t.say("yes", "+1416B"); // B saying yes must not confirm A's draft
  assert.equal(t.store.listOrders().length, 0);
  assert.ok(t.store.getDraft("+15195550101"));
  assert.equal(t.store.getDraft("+1416B"), null);
  assert.doesNotMatch(t.llm.prompts[1]!, /Asha|kheema_fry","qty":2/);
});

test("empty and oversized messages", async () => {
  const t = setup();
  assert.equal((await t.say("   ")).route, "empty");
  t.llm.push(modelReply({ reply: "ok" }));
  await t.say("x".repeat(5000));
  assert.equal(t.store.getMessages("+15195550101")[0]!.text.length, 1000);
});

test("the prompt carries the calendar, the switches and the rules the guards enforce", async () => {
  const t = setup();
  const menu = t.store.getMenu();
  menu.find((m) => m.id === "fry_piece_pulao")!.live = false;
  t.store.putMenu(menu);
  t.llm.push(modelReply());
  await t.say("hi", "+1519", { name: "Asha" });
  const p = t.llm.prompts[0]!;
  assert.match(p, /today Wednesday September 23 = 2026-09-23/);
  assert.match(p, /Friday September 25 = 2026-09-25/);
  assert.match(p, /"id":"fry_piece_pulao"[^}]*"available_now":false/);
  assert.match(p, /do not write the read-back/);
  assert.match(p, /CUSTOMER NAME ON FILE: Asha/);
});

test("placed orders are shown to the model so it never claims to change them", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await t.say("yes");
  t.llm.push(modelReply({ reply: "Sure" }));
  await t.say("what is my order status?");
  assert.match(t.llm.prompts.at(-1)!, /ORDERS ALREADY PLACED BY THIS CUSTOMER: #1 \(cook\) 2 x Chicken Kheema Fry combo \(Buy 1 Get 1\)/);
});

test("judgment helper defaults are sane", () => {
  assert.equal(judgment().agrees, null);
});

test("a customer who only asks a question never gets an order started, even if the model proposes one", async () => {
  const t = setup({ judge: (c) => (c.message.includes("see") ? { intent: { label: "question", prob: 0.9, confidence: 0.8 } } : {}) });
  // The real bug: "I want to see the Full meal plan..." made the model draft a $90 order and ask for YES.
  t.llm.push(modelReply({ reply: "Mon: 4 idli...\nTue: 3 dosa...", items: [{ id: "plan_full", qty: 1, pack: "plan", asked_for: "full meal plan" }], pickup: "2026-09-28T11:00", stage: "awaiting_confirmation" }));
  const r = await t.say("I want to see the full meal plan, what is on Monday and Tuesday");
  assert.equal(r.route, "normal");
  assert.equal(t.store.getDraft("+15195550101"), null, "no draft from a question");
  assert.doesNotMatch(r.replies[0]!, /Please check your order|Reply YES/);
  assert.match(r.replies[0]!, /Mon: 4 idli/);
  assert.match(t.llm.prompts[0]!, /only asking a question/);
});

test("a question in the middle of an order leaves the read-back valid", async () => {
  const t = setup({ judge: (c) => (c.message.startsWith("what") ? { intent: { label: "question", prob: 0.9, confidence: 0.8 }, agrees: 0.05 } : yesJudge(c)) });
  await orderAndReadBack(t);
  const before = t.store.getDraft("+15195550101")!;
  t.llm.push(modelReply({ reply: "We are at 1425B Blockline Rd.", items: [], pickup: null, stage: "browsing" }));
  const q = await t.say("what is the pickup address?");
  assert.equal(q.replies[0], "We are at 1425B Blockline Rd.");
  assert.deepEqual(t.store.getDraft("+15195550101"), before, "draft and read-back hash untouched");
  const y = await t.say("yes");
  assert.equal(y.route, "confirm_order");
  assert.equal(t.store.listOrders().length, 1);
});

test("after an order is placed, the same order is never read back again (no duplicate on a stray yes)", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await t.say("yes");
  assert.equal(t.store.listOrders().length, 1);
  // The real bug: "Ok great" / "I have already confirmed my order" made the model re-propose order #1.
  for (const said of ["Ok great", "I have already confirmed my order"]) {
    t.llm.push(modelReply({ reply: "Great!", items: [KHEEMA_BOGO], pickup: FRI_6PM, name: "Asha", stage: "awaiting_confirmation", notes: "Order #1 already confirmed." }));
    const r = await t.say(said);
    assert.match(r.replies[0]!, /Order #1 is already confirmed/, said);
    assert.doesNotMatch(r.replies[0]!, /Reply YES|Please check your order/, said);
    const d = t.store.getDraft("+15195550101");
    assert.ok(!d || (d.items.length === 0 && d.stage !== "awaiting_confirmation" && d.readback_hash === null), "nothing is left waiting for a yes");
    assert.ok(r.issues.includes("duplicate_order"));
  }
  const stray = await t.say("yes");
  assert.notEqual(stray.route, "confirm_order");
  assert.equal(t.store.listOrders().length, 1, "still exactly one order");
});

test("asking for another one after an order still works", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await t.say("yes");
  t.llm.push(modelReply({ items: [KHEEMA_BOGO], pickup: FRI_6PM, stage: "awaiting_confirmation" }));
  const r = await t.say("I want another one, same again");
  assert.match(r.replies[0]!, /Please check your order/);
  await t.say("yes");
  assert.equal(t.store.listOrders().length, 2);
});

test("a different pickup time or different items is a new order, not a duplicate", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await t.say("yes");
  t.llm.push(modelReply({ items: [KHEEMA_BOGO], pickup: "2026-09-25T19:00", stage: "awaiting_confirmation" }));
  const r = await t.say("2 kheema fry combos for friday 7pm");
  assert.match(r.replies[0]!, /Please check your order/);
});

test("spice level: the assistant asks once, the answer goes on the order as a note, no owner alert", async () => {
  const t = setup({ judge: yesJudge });
  t.llm.push(modelReply({ reply: "Would you like regular, medium or less spicy? Any other request?", items: [KHEEMA_BOGO], pickup: FRI_6PM, name: "Asha", stage: "collecting" }));
  const r1 = await t.say("2 chicken kheema fry combos buy 1 get 1, friday 6pm");
  assert.match(r1.replies[0]!, /regular, medium or less spicy/i);
  assert.equal(t.store.getDraft("+15195550101")!.stage, "collecting");
  t.llm.push(modelReply({ reply: "Noted!", items: [KHEEMA_BOGO], pickup: FRI_6PM, name: "Asha", notes: "Medium spice", stage: "awaiting_confirmation" }));
  const r2 = await t.say("medium spice");
  assert.match(r2.replies[0]!, /Note: Medium spice/);
  assert.equal(t.notifier.sent.length, 0, "a spice choice is not something the owner has to act on");
  await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.equal(o.notes, "Medium spice");
  assert.equal(o.status, "cook");
});

test("customer-facing wording never names Maddy", async () => {
  const t = setup({ judge: yesJudge });
  const menu = t.store.getMenu();
  menu.find((m) => m.id === "kheema_fry")!.single = null;
  t.store.putMenu(menu);
  const r = await orderAndReadBack(t, [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }]);
  const r2 = await t.say("yes");
  for (const text of [...r.replies, ...r2.replies]) assert.doesNotMatch(text, /Maddy/);
  assert.match(t.llm.prompts[0]!, /never see the name Maddy/);
});

/* ---------- duplicate orders after a confirmation ---------- */

test("after an order is confirmed, thank you and a stray yes do not start or place another order", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await t.say("yes");
  assert.equal(t.store.listOrders().length, 1);
  const calls = t.llm.prompts.length;
  // the model would happily re-propose the same order on these turns; the code must not let it
  t.llm.push(modelReply({ reply: "You're welcome!", items: [KHEEMA_BOGO], pickup: FRI_6PM, name: "Asha", stage: "awaiting_confirmation" }));
  const r1 = await t.say("Thank you");
  assert.doesNotMatch(r1.replies[0]!, /Please check your order|Reply YES/);
  assert.equal(t.store.getDraft("+15195550101"), null);
  t.llm.push(modelReply({ reply: "Anything else?", items: [KHEEMA_BOGO], pickup: FRI_6PM, name: "Asha", stage: "awaiting_confirmation" }));
  const r2 = await t.say("yes");
  assert.doesNotMatch(r2.replies[0]!, /Please check your order|Reply YES/);
  await t.say("yes");
  assert.equal(t.store.listOrders().length, 1, "still exactly one order");
  assert.ok(t.llm.prompts.length >= calls);
});

test("a double tap on yes places one order, and a second read-back of the same order cannot place another", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await Promise.all([t.say("yes"), t.say("yes")]);
  assert.equal(t.store.listOrders().length, 1);
  // force the worst case: a draft that matches the placed order and is awaiting a yes
  const d = { items: t.store.listOrders()[0]!.items, pickup_local: FRI_6PM, customer_name: "Asha", notes: "", readback_hash: null as string | null, stage: "awaiting_confirmation" as const };
  const { draftHash } = await import("../src/guards.js");
  d.readback_hash = draftHash(d);
  t.store.putDraft("+15195550101", d);
  const r = await t.say("yes");
  assert.equal(t.store.listOrders().length, 1);
  assert.match(r.replies[0]!, /already confirmed/);
  assert.equal(t.store.getDraft("+15195550101"), null);
});

test("asking for another order still works", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t);
  await t.say("yes");
  t.llm.push(modelReply({ reply: "Sure", items: [KHEEMA_BOGO], pickup: FRI_6PM, name: "Asha", stage: "awaiting_confirmation" }));
  const r = await t.say("I want another one, same again please");
  assert.match(r.replies[0]!, /Please check your order/);
  await t.say("yes");
  assert.equal(t.store.listOrders().length, 2);
});

/* ---------- talk to a person ---------- */

test("asking for a real person gives a clear status, the Instagram page, and one owner alert", async () => {
  const t = setup();
  const r = await t.say("can I talk to a real person? give me your phone number or instagram");
  assert.equal(r.route, "handoff");
  assert.match(r.replies[0]!, /sent your request to Annapurna Home Foods at \d{1,2}:\d{2}/);
  assert.match(r.replies[0]!, /instagram\.com\/annapurna_hometaste/);
  assert.doesNotMatch(r.replies[0]!, /Maddy/);
  assert.equal(t.llm.prompts.length, 0, "answered by code, no model call");
  assert.equal(t.store.listAlerts(true).length, 1);
  assert.match(t.notifier.sent.at(-1)!.title, /wants to talk to you/);
  const again = await t.say("hello? anyone there, I need a human");
  assert.match(again.replies[0]!, /already with Annapurna Home Foods/);
  assert.equal(t.store.listAlerts(true).length, 1, "no second alert");
  // the owner replying closes the request
  t.store.closeHandoffs("+15195550101");
  assert.equal(t.store.openHandoff("+15195550101"), undefined);
});

test("a phone number in settings is shared with the customer", async () => {
  const t = setup();
  t.store.putSettings({ ...t.store.getSettings(), contactPhone: "519-555-0100" });
  const r = await t.say("what is your phone number");
  assert.match(r.replies[0]!, /Phone: 519-555-0100/);
});

test("a normal order message does not trigger the handoff", async () => {
  const t = setup({ judge: yesJudge });
  const r = await orderAndReadBack(t);
  assert.notEqual(r.route, "handoff");
});

test("'option 2' is looked up by code and handed to the model as the exact dish, even when the judge is unsure", async () => {
  const t = setup({ judge: () => ({ intent: { label: "other", prob: 0.4, confidence: 0.3 } }) });
  t.llm.push(modelReply({ reply: "Great pick! Single or Buy 1 Get 1, when is pickup, and how spicy: less spicy, medium or spicy?", items: [], pickup: null, name: "Asha", stage: "collecting" }));
  const r = await t.say("I want to go with option 2");
  assert.equal(r.route, "normal", "a picked option is an order step, not an unclear message");
  assert.match(t.llm.prompts[0]!, /option 2: Gongura Chicken Kheema Pulao \(id gongura_kheema_pulao\)/);
  assert.match(t.llm.prompts[0]!, /"option_no":2,"id":"gongura_kheema_pulao"/);
  assert.match(t.llm.prompts[0]!, /less spicy, medium or spicy/);
});

test("an option number that is not on the menu is not guessed", async () => {
  const t = setup();
  t.llm.push(modelReply({ reply: "We don't have an option 40. Which dish did you mean?", items: [], pickup: null, name: "Asha", stage: "browsing" }));
  await t.say("option 40");
  assert.match(t.llm.prompts[0]!, /There is no option 40 on the menu/);
});

test("the 'Yes, place order' button places the order even with the offline judge", async () => {
  const { HeuristicJudge } = await import("../src/judge.js");
  const t = setup();
  (t.agent as unknown as { d: { judge: unknown } }).d.judge = new HeuristicJudge();
  await orderAndReadBack(t);
  const r = await t.say("Yes, confirm");
  assert.equal(r.route, "confirm_order");
  assert.match(r.replies[0]!, /Order #1 is confirmed/);
  assert.equal(t.store.listOrders().length, 1);
});

test("the button text counts as yes even if the judge doubts it", async () => {
  const t = setup({ judge: () => ({ agrees: 0.2 }) });
  await orderAndReadBack(t);
  const r = await t.say("Yes, confirm");
  assert.equal(r.route, "confirm_order");
  assert.equal(t.store.listOrders().length, 1);
});
