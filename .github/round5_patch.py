from pathlib import Path

def rep(path, old, new, label):
    p = Path(path); s = p.read_text()
    if new in s:
        print("already:", label); return
    if old not in s:
        raise SystemExit("missing: " + label)
    p.write_text(s.replace(old, new, 1))
    print("fixed:", label)

rep("src/agent.ts",
'import { checkFlags, checkWeekday, draftHash, extrasOnly, friendlyName, mainOrderFor, sanitizeItems, type Issue } from "./guards.js";',
'import { checkFlags, checkWeekday, draftHash, extrasOnly, friendlyName, mainOrderFor, sanitizeItems, tokens, type Issue } from "./guards.js";',
"tokens import")
rep("src/agent.ts",
'import { dayLabel, formatWhen, isLocalIso, pad, zonedParts } from "./time.js";',
'import { dayLabel, formatWhen, isLocalIso, nextDateForDow, pad, zonedParts } from "./time.js";',
"date helper import")
rep("src/agent.ts",
'import type { Alert, Draft, Order, Settings, Stage } from "./types.js";',
'import type { Alert, Draft, MenuItem, Order, Settings, Stage } from "./types.js";',
"menu type import")

old = r'''/** Owner-managed catering/bulk orders. A headcount alone counts as custom only at 8+ people. */
const CUSTOM_WORDS = /\b(cater(?:ing)?|bulk|party order|large order|full tray|half tray|medium tray|large tray)\b/i;
const CUSTOM_HEADCOUNT = /\b(\d{1,3})\s*(?:people|persons|pax|members|guests)\b/i;
const CUSTOM_CONFIRM = /(?:^yes\b|^go\s+ahead\b|\bconfirm(?:ing|ed)?\s+(?:(?:the|my)\s+)?order\b|\bplace\s+(?:(?:the|my)\s+)?order\b)/i;

function looksCustom(text: string): boolean {
  if (CUSTOM_WORDS.test(text)) return true;
  const m = CUSTOM_HEADCOUNT.exec(text);
  return !!m && Number(m[1]) >= 8;
}

function customHeadcount(text: string): number | null {
  const m = CUSTOM_HEADCOUNT.exec(text);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n < 500 ? n : null;
}

/** Common catering pickup replies should not depend on an LLM call. */
function simpleCustomPickup(text: string, now: number, tz: string): string | null {
  const m = /\b(today|tomorrow)\b[^\d]{0,24}(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (!m) return null;
  let h = Number(m[2]);
  const mi = Number(m[3] ?? "0");
  if (h < 1 || h > 12 || mi < 0 || mi > 59) return null;
  const ap = m[4]!.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const p = zonedParts(now, tz);
  const add = m[1]!.toLowerCase() === "tomorrow" ? 1 : 0;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + add));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(h)}:${pad(mi)}`;
}
'''
new = r'''/** Owner-managed catering/bulk orders. A headcount alone counts as custom only at 8+ people. */
const CUSTOM_RECIPE_WORDS = /\b(custom recipe|customi[sz](?:e|ed|ation)|modified recipe)\b/i;
const CUSTOM_WORDS = /\b(cater(?:ing)?|bulk|party order|large order|full tray|half tray|medium tray|large tray|custom recipe|customi[sz](?:e|ed|ation)|modified recipe)\b/i;
const CUSTOM_HEADCOUNT = /\b(\d{1,3})\s*(?:people|persons|pax|members|guests)\b/i;
const CUSTOM_CONFIRM = /(?:^yes\b|^go\s+ahead\b|\bconfirm(?:ing|ed)?\s+(?:(?:the|my)\s+)?order\b|\bplace\s+(?:(?:the|my)\s+)?order\b)/i;
const CUSTOMER_CUSTOM_PRICE = /(?:\$\s*\d{1,5}(?:\.\d{1,2})?|\b\d{1,5}(?:\.\d{1,2})?\s*(?:\$|cad)\b)/i;
const PLACEMENT_CLAIM = /\b(?:order\s+(?:is\s+|has\s+been\s+)?(?:confirmed|placed|booked)|(?:confirmed|placed|booked)\s+(?:the\s+|your\s+)?order|lock(?:ing|ed)?\s+(?:this|it|the order)\s+in)\b/i;

function customHeadcount(text: string): number | null {
  const m = CUSTOM_HEADCOUNT.exec(text);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n < 500 ? n : null;
}

function bulkMenuQuantity(text: string, menu: MenuItem[]): number | null {
  const m = /\b(\d{1,3})\s*(?=[A-Za-z])/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 8 || n >= 500) return null;
  const tt = tokens(text);
  return menu.some((it) => {
    const mt = tokens(it.name.replace(/\s+combo$/i, ""));
    return mt.size > 0 && [...mt].every((t) => tt.has(t));
  }) ? n : null;
}

function looksCustom(text: string, menu: MenuItem[] = []): boolean {
  if (CUSTOM_WORDS.test(text)) return true;
  const m = CUSTOM_HEADCOUNT.exec(text);
  if (m && Number(m[1]) >= 8) return true;
  return !!bulkMenuQuantity(text, menu);
}

/** Only the failure-prone forms bypass Claude: large explicit menu quantities and recipe modifications. */
function deterministicCustomStart(text: string, menu: MenuItem[]): boolean {
  return CUSTOM_RECIPE_WORDS.test(text) || bulkMenuQuantity(text, menu) != null;
}

function deterministicCustomItems(text: string, menu: MenuItem[]): Draft["items"] {
  const tt = tokens(text);
  const qty = customHeadcount(text) ?? bulkMenuQuantity(text, menu) ?? 1;
  const matches = menu.filter((it) => {
    const mt = tokens(it.name.replace(/\s+combo$/i, ""));
    return mt.size > 0 && [...mt].every((t) => tt.has(t));
  }).sort((a, b) => b.name.length - a.name.length);
  const m = matches[0];
  return m ? [{ id: m.id, name: m.name, qty, pack: "single", amt: null }] : [];
}

function parseClock(text: string): { h: number; mi: number } | null {
  const special = /\b(noon|midnight)\b/i.exec(text);
  if (special) return { h: special[1]!.toLowerCase() === "noon" ? 12 : 0, mi: 0 };
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? "0");
  if (h < 1 || h > 12 || mi < 0 || mi > 59) return null;
  const ap = m[3]!.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { h, mi };
}

/** Common custom pickup replies should not depend on an LLM call, including weekday noon/midnight. */
function simpleCustomPickup(text: string, now: number, tz: string): string | null {
  const clock = parseClock(text);
  if (!clock) return null;
  const p = zonedParts(now, tz);
  const rel = /\b(today|tomorrow)\b/i.exec(text);
  let d: Date;
  if (rel) {
    const add = rel[1]!.toLowerCase() === "tomorrow" ? 1 : 0;
    d = new Date(Date.UTC(p.y, p.m - 1, p.d + add));
  } else {
    const wk = /\b(?:(this|next)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.exec(text);
    if (!wk) return null;
    const days: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const iso = nextDateForDow(now, tz, days[wk[2]!.slice(0, 3).toLowerCase()]!);
    d = new Date(`${iso}T00:00:00Z`);
    if (wk[1]?.toLowerCase() === "next") d.setUTCDate(d.getUTCDate() + 7);
  }
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(clock.h)}:${pad(clock.mi)}`;
}
'''
rep("src/agent.ts", old, new, "custom/bulk detection and pickup parsing")

old = r'''    // For an active custom order, parse common pickup replies in code so a transient model failure
    // cannot lose "tomorrow 6 PM". The kitchen timezone remains the source of truth.
    if (draft?.custom) {
'''
new = r'''    // Large explicit quantities and custom-recipe requests are captured before Claude. These are the
    // failure-prone forms from QA; ordinary catering/headcount flows keep their existing behavior.
    if (!draft?.custom && deterministicCustomStart(text, menu)) {
      const parsedPickup = simpleCustomPickup(text, now, settings.tz);
      const next: Draft = {
        items: deterministicCustomItems(text, menu),
        pickup_local: parsedPickup,
        customer_name: customer.name || msg.name || null,
        notes: "",
        readback_hash: null,
        stage: "collecting",
        custom: { request: text.slice(0, 300), price: null, approved: false },
      };
      store.putDraft(msg.from, next);
      out.route = "custom_request";
      out.replies.push(
        `I've sent this custom/bulk request to Annapurna Home Foods. No order is placed yet. ` +
        `${parsedPickup ? `Pickup noted for ${formatWhen(parsedPickup)}. ` : ""}` +
        `Annapurna Home Foods will confirm the final price${parsedPickup ? "" : " and pickup time"} here before you can place it.`
      );
      await this.raise(msg.from, customer.name || msg.name || "Customer", `Custom/bulk request: "${text.slice(0, 220)}"`, null, out);
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // For an active custom order, parse common pickup replies in code so a transient model failure
    // cannot lose "tomorrow 6 PM" or "Sunday noon". The kitchen timezone remains the source of truth.
    if (draft?.custom) {
'''
rep("src/agent.ts", old, new, "pre-model bulk/custom-recipe interception")

old = r'''    // Custom/catering orders are different from menu orders: the owner sets the final price in chat,
    // then the customer confirms. Handle confirmation/acknowledgements deterministically so the model
    // can never invent a custom-order confirmation or lose the pending terms.
    if (draft?.custom && CUSTOM_CONFIRM.test(text)) {
'''
new = r'''    // Customer-entered prices never populate custom pricing. Only the authenticated owner endpoint
    // is allowed to set draft.custom.price.
    if (draft?.custom && draft.custom.price == null && CUSTOMER_CUSTOM_PRICE.test(text)) {
      out.route = "custom_customer_price_ignored";
      out.replies.push("Thanks — I've noted your message, but the final price must come from Annapurna Home Foods. No order is placed yet.");
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // Custom/catering orders are different from menu orders: the owner sets the final price in chat,
    // then the customer confirms. Handle confirmation/acknowledgements deterministically so the model
    // can never invent a custom-order confirmation or lose the pending terms.
    if (draft?.custom && CUSTOM_CONFIRM.test(text)) {
'''
rep("src/agent.ts", old, new, "customer price guard")

rep("src/agent.ts",
"      const startsCustom = !custom && looksCustom(text);",
"      const startsCustom = !custom && looksCustom(text, menu);",
"menu-aware custom detection")

old = r'''    if (custom && /(?:\bis\s+confirmed\b|\bhas\s+been\s+confirmed\b|\border\b[^.!?\n]{0,80}\bconfirmed\b)/i.test(reply)) {
      reply = custom.price != null && pickup
        ? "The custom order details are ready. Reply CONFIRM THE ORDER to place it."
        : "I've saved your custom order request. Annapurna Home Foods will confirm the final price and details here in this chat.";
    }
    out.replies.push(reply);
'''
new = r'''    if (custom && /(?:\bis\s+confirmed\b|\bhas\s+been\s+confirmed\b|\border\b[^.!?\n]{0,80}\bconfirmed\b)/i.test(reply)) {
      reply = custom.price != null && pickup
        ? "The custom order details are ready. Reply CONFIRM THE ORDER to place it."
        : "I've saved your custom order request. Annapurna Home Foods will confirm the final price and details here in this chat.";
    }
    // Model prose can never be the authority that an order was placed. Real placement confirmations
    // are generated by code and contain a real order number.
    if (!custom && PLACEMENT_CLAIM.test(reply)) {
      const hasRealOrderNumber = open.some((o) => new RegExp(`#${o.id}\\b`).test(reply));
      if (!hasRealOrderNumber) {
        reply = "I haven't placed an order from that message. Tell me what you'd like, and I'll show you a Check your order review before anything is placed.";
        out.issues.push("false_confirmation_blocked");
      }
    }
    out.replies.push(reply);
'''
rep("src/agent.ts", old, new, "false confirmation blocker")
rep("src/agent.ts",
"    const people = customHeadcount(custom.request);",
"    const people = customHeadcount(custom.request) ?? bulkMenuQuantity(custom.request, store.getMenu());",
"bulk qty on placed custom order")

rep("src/server.ts",
'          return send(req, res, 200, { messages: store.getMessagesAfter(waId, before), orderId: out.orderId ?? null });',
'          return send(req, res, 200, { messages: store.getMessagesAfter(waId, before), orderId: out.orderId ?? null, recoverableError: out.route.includes("+model_error") });',
"recoverable error API")

rep("public/app.js",'  var pendingOrderText = "";\n','  var pendingOrderText = "";\n  var failedMessageText = "";\n',"failed message state")
rep("public/app.js",r'''  function send(text) {
    text = (text || "").trim();
''',r'''  function setProcessError(show, text) {
    var bar = $("processError");
    if (!bar) return;
    bar.hidden = !show;
    if (show && text) failedMessageText = text;
  }

  function send(text) {
    text = (text || "").trim();
''',"process error helper")
rep("public/app.js",r'''    api("POST", "/web/message", { text: text }).then(function (j) {
      pend.remove();
      addMessages(j.messages || []);
      if (j.orderId) loadOrders();
    }).catch(function (e) {
''',r'''    api("POST", "/web/message", { text: text }).then(function (j) {
      pend.remove();
      addMessages(j.messages || []);
      if (j.orderId) loadOrders();
      if (j.recoverableError) setProcessError(true, text);
      else setProcessError(false);
    }).catch(function (e) {
''',"process error response")
rep("public/app.js",'  $("composer").addEventListener("submit", function (e) { e.preventDefault(); send($("text").value); });\n',
'''  $("composer").addEventListener("submit", function (e) { e.preventDefault(); send($("text").value); });
  if ($("processRetry")) $("processRetry").addEventListener("click", function () { if (!busy && failedMessageText) send(failedMessageText); });
  if ($("processHelp")) $("processHelp").addEventListener("click", function () {
    if (busy) return;
    api("POST", "/web/handoff").then(function (j) {
      addMessages(j.messages || []);
      setHandoff(j.handoff || null);
      setProcessError(false);
    }).catch(function (e) { toast(errText(e)); });
  });
''',"process error buttons")

p=Path("public/index.html"); s=p.read_text()
if ".process-error{" not in s:
    s=s.replace("</style>",'''
    .process-error{margin:10px 14px 0;padding:12px 14px;border:1px solid #d7a23a;background:#fff7df;border-radius:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;box-shadow:0 8px 22px rgba(75,53,20,.08)}
    .process-error[hidden]{display:none}
    .process-error strong{display:block;color:#653d00}.process-error small{display:block;margin-top:2px;color:#765b30;line-height:1.35}
    .process-error .pe-actions{display:flex;gap:7px;flex-wrap:wrap}.process-error button{white-space:nowrap}
    @media(max-width:620px){.process-error{align-items:flex-start;flex-direction:column}.process-error .pe-actions{width:100%}.process-error .pe-actions button{flex:1}}
  </style>''',1)
if 'id="processError"' not in s:
    s=s.replace('  <section class="chat" id="chat" hidden>\n','''  <section class="chat" id="chat" hidden>
    <div class="process-error" id="processError" role="alert" hidden>
      <span><strong>We couldn't process your last message.</strong><small>No order was placed. Retry it, or ask Annapurna for help.</small></span>
      <span class="pe-actions"><button class="btn sm" id="processRetry" type="button">Retry</button><button class="btn ghost sm" id="processHelp" type="button">Ask Annapurna</button></span>
    </div>
''',1)
p.write_text(s); print("fixed: persistent error UI")

p=Path("test/web.test.ts"); s=p.read_text()
marker='  test("custom catering: owner price + approval then customer YES creates a real order and notification", () =>\n'
tests=r'''  test("Round 5: large explicit quantity bypasses the model and creates no phantom order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Bulk Buyer", "5195550130");
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

  test("Round 5: custom recipe bypasses model; Sunday noon parses; customer price is ignored", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Custom Buyer", "5195550131");
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
      const token = await start("Recovery Buyer", "5195550132");
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

'''
if "Round 5: large explicit quantity bypasses the model" not in s:
    if marker not in s: raise SystemExit("missing test marker")
    s=s.replace(marker,tests+marker,1)
oldtest='''      const r = await say(token, "hello");
      assert.equal(r.status, 200);
      assert.ok(r.json.messages.some((m: any) => m.who === "agent"));
'''
newtest='''      const r = await say(token, "hello");
      assert.equal(r.status, 200);
      assert.equal(r.json.recoverableError, true);
      assert.ok(r.json.messages.some((m: any) => m.who === "agent"));
'''
if newtest not in s:
    if oldtest not in s: raise SystemExit("missing model failure test")
    s=s.replace(oldtest,newtest,1)
p.write_text(s); print("fixed: Round 5 regression tests")
