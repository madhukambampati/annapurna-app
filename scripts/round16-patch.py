from pathlib import Path

p = Path('src/agent.ts')
s = p.read_text()

old = 'import type { Llm } from "./llm.js";\n'
new = 'import { LlmError, type Llm } from "./llm.js";\n'
if old not in s:
    raise SystemExit('llm import marker not found')
s = s.replace(old, new, 1)

marker = 'function deterministicCustomItems(text: string, menu: MenuItem[]): Draft["items"] {'
helper = r'''function deterministicFreshMenuItem(text: string, menu: MenuItem[]): MenuItem | null {
  const said = tokens(text);
  if (!said.size) return null;
  const matches: Array<{ item: MenuItem; specificity: number }> = [];
  for (const item of menu) {
    if (item.kind === "addon" || (item.kind === "combo" && !item.live)) continue;
    let best = 0;
    for (const label of [item.name, ...item.aliases]) {
      const want = tokens(label.replace(/\s+combo$/i, ""));
      if (want.size < 2 || ![...want].every((t) => said.has(t))) continue;
      best = Math.max(best, want.size);
    }
    if (best) matches.push({ item, specificity: best });
  }
  matches.sort((a, b) => b.specificity - a.specificity || b.item.name.length - a.item.name.length);
  if (!matches.length) return null;
  if (matches[1] && matches[1].specificity === matches[0]!.specificity) return null;
  return matches[0]!.item;
}

function deterministicFreshQuantity(text: string, item: MenuItem): number | null {
  if (item.kind === "plan") {
    const people = customHeadcount(text);
    if (people != null && people < 100) return people;
  }
  const direct = /^\s*(\d{1,2})\b/.exec(text)
    ?? /\b(?:order|want|need|would\s+like|get\s+me|give\s+me|take)\s+(\d{1,2})\b/i.exec(text);
  const qty = direct ? Number(direct[1]) : 1;
  return qty > 0 && qty < 100 ? qty : null;
}

function deterministicFreshDraft(text: string, menu: MenuItem[], now: number, settings: Settings, customerName: string | null): Draft | null {
  if (looksCustom(text, menu)) return null;
  const item = deterministicFreshMenuItem(text, menu);
  if (!item) return null;
  const qty = deterministicFreshQuantity(text, item);
  const pickup = simpleCustomPickup(text, now, settings.tz);
  if (!qty || !pickup) return null;
  const wantsBogo = /\b(?:bogo|buy\s*1\s*get\s*1|buy\s+one\s+get\s+one)\b/i.test(text);
  const pack = item.kind === "plan" ? "plan" : item.kind === "combo" && wantsBogo ? "bogo" : "single";
  if (pack === "bogo" && item.bogo == null) return null;
  const orderItem = { id: item.id, name: item.name, qty, pack, amt: lineAmt(menu, { id: item.id, qty, pack }) } as Draft["items"][number];
  const draft: Draft = {
    items: [orderItem],
    pickup_local: pickup,
    customer_name: customerName,
    notes: "",
    readback_hash: null,
    stage: "awaiting_confirmation",
  };
  draft.readback_hash = draftHash(draft);
  return draft;
}

'''
if helper not in s:
    if marker not in s:
        raise SystemExit('fresh helper insertion marker not found')
    s = s.replace(marker, helper + marker, 1)

old = '    let draft = store.getDraft(msg.from);\n    const open = store.openOrdersFor(msg.from);\n'
new = '    let draft = store.getDraft(msg.from);\n    const open = store.openOrdersFor(msg.from);\n    let freshResetContext = false;\n'
if old not in s:
    raise SystemExit('fresh context declaration marker not found')
s = s.replace(old, new, 1)

old = '      const remainder = resetRemainder(text);\n      store.clearDraft(msg.from);\n'
new = '      const remainder = resetRemainder(text);\n      freshResetContext = resettingDraft && !!remainder;\n      store.clearDraft(msg.from);\n'
if old not in s:
    raise SystemExit('reset remainder marker not found')
s = s.replace(old, new, 1)

marker = '    // After a stale custom quote has been refused, a clearly unrelated normal menu order starts cleanly.\n'
block = '''    // For an explicit fresh-order reset, exact one-item menu orders with a clear pickup
    // are rebuilt entirely in code. This path must never wait on Claude just to forget old draft state.
    if (freshResetContext) {
      const rebuilt = deterministicFreshDraft(text, menu, now, settings, customer.name || msg.name || null);
      if (rebuilt) {
        store.putDraft(msg.from, rebuilt);
        out.route = "fresh_order";
        out.replies.push(this.readBack(rebuilt, settings, now, open));
        for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
        return out;
      }
    }

'''
if block not in s:
    if marker not in s:
        raise SystemExit('fresh deterministic block marker not found')
    s = s.replace(marker, block + marker, 1)

old = '    const ctx = { lastShopMessage: lastShop, message: text, awaitingConfirmation: awaiting && readbackCurrent, hasPlacedOrder: open.length > 0 };\n'
new = '    const ctx = { lastShopMessage: freshResetContext ? null : lastShop, message: text, awaitingConfirmation: awaiting && readbackCurrent, hasPlacedOrder: open.length > 0 };\n'
if old not in s:
    raise SystemExit('judge context marker not found')
s = s.replace(old, new, 1)

old = '        await this.modelTurn(msg, text, r, draft, open, customer, settings, out, streak, pickHint);\n'
new = '        await this.modelTurn(msg, text, r, draft, open, customer, settings, out, streak, pickHint, freshResetContext);\n'
if old not in s:
    raise SystemExit('modelTurn call marker not found')
s = s.replace(old, new, 1)

old = '    customer: { name: string; profile: string }, settings: Settings, out: Outcome, streak: number, pickHint?: string,\n'
new = '    customer: { name: string; profile: string }, settings: Settings, out: Outcome, streak: number, pickHint?: string, freshContext = false,\n'
if old not in s:
    raise SystemExit('modelTurn signature marker not found')
s = s.replace(old, new, 1)

old = '''    const promptHistory = store.getMessages(msg.from, 40);
    // When a reset message contains a replacement order, the stored transcript keeps the customer's
    // full wording for audit, but Claude sees only the fresh-order remainder as the newest turn.
    const newest = promptHistory.at(-1);
    if (newest?.who === "cust" && newest.text !== text) promptHistory[promptHistory.length - 1] = { ...newest, text };
'''
new = '''    const promptHistory = store.getMessages(msg.from, 40);
    // A real reset means "forget everything before this" for model context too. Keep the complete
    // transcript in storage for the customer/owner, but never send pre-reset chat back to Claude.
    const newest = promptHistory.at(-1);
    if (newest?.who === "cust" && newest.text !== text) promptHistory[promptHistory.length - 1] = { ...newest, text };
    if (freshContext && promptHistory.length) promptHistory.splice(0, promptHistory.length - 1);
'''
if old not in s:
    raise SystemExit('prompt history block marker not found')
s = s.replace(old, new, 1)

old = '''      console.error("model turn failed", e);
      out.route += "+model_error";
      out.replies.push("Sorry, I couldn't process that just now. Please send it once more, or Annapurna Home Foods will help you here.");
      await this.raise(msg.from, customer.name || msg.name || "Customer", `The assistant could not answer this customer (model error). Check the Claude key and credits, or reply yourself. Their message: "${text.slice(0, 100)}"`, null, out);
      return;
'''
new = '''      console.error("model turn failed", e);
      out.route += "+model_error";
      out.replies.push("Sorry, I couldn't process that just now. Please send it once more, or Annapurna Home Foods will help you here.");
      const detail = e instanceof LlmError
        ? e.code === "timeout"
          ? "Claude timed out before replying"
          : e.code === "http"
            ? `Claude returned an HTTP error (${e.message})`
            : `Claude returned an unusable response (${e.code})`
        : "The Claude request failed unexpectedly";
      await this.raise(msg.from, customer.name || msg.name || "Customer", `The assistant could not answer this customer (model error). ${detail}. Reply yourself if needed. Their message: "${text.slice(0, 100)}"`, null, out);
      return;
'''
if old not in s:
    raise SystemExit('model error alert marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('test/agent.test.ts')
s = p.read_text()
old = '''test("reset wrapper with no active draft is stripped before the model call", async () => {
  const t = setup();
  t.llm.push(modelReply({
    reply: "Sure!",
    items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "chicken kheema fry combo" }],
    pickup: FRI_6PM,
    stage: "awaiting_confirmation",
  }));
  const r = await t.say("Forget everything before this. Fresh order: 1 chicken kheema fry combo, Friday 6pm");
  assert.equal(t.llm.prompts.length, 1);
  assert.doesNotMatch(t.llm.prompts[0]!, /forget everything before this/i);
  assert.match(t.llm.prompts[0]!, /1 chicken kheema fry combo, Friday 6pm/i);
  assert.doesNotMatch(r.route, /model_error/);
  assert.match(r.replies.at(-1)!, /Please check your order/);
});
'''
new = '''test("reset wrapper exact order is rebuilt without Claude, even when an old draft exists", async () => {
  const t = setup();
  t.llm.push(modelReply({ reply: "Old draft", items: [KHEEMA_BOGO], pickup: FRI_6PM, stage: "collecting" }));
  await t.say("2 chicken kheema fry combos buy 1 get 1, friday 6pm");
  const calls = t.llm.prompts.length;
  t.llm.push(new Error("Claude should not be called for deterministic fresh reset"));
  const r = await t.say("Forget everything before this. Fresh order: 1 chicken kheema fry combo, Friday 6pm");
  assert.equal(r.route, "fresh_order");
  assert.equal(t.llm.prompts.length, calls, "fresh reset should not call Claude for an exact one-item order");
  assert.match(r.replies.at(-1)!, /Please check your order/);
  assert.match(r.replies.at(-1)!, /1 x Chicken Kheema Fry combo: \\$18/);
  assert.doesNotMatch(r.route, /model_error/);
});

test("complex fresh reset gives Claude only the post-reset message, never old chat history", async () => {
  const t = setup();
  t.llm.push(modelReply({ reply: "Old response" }));
  await t.say("Tell me about the weekly plans");
  t.llm.push(modelReply({ reply: "Need details", stage: "collecting" }));
  const r = await t.say("Forget everything before this. Fresh order: I want chicken kheema fry and extra raita for Friday 6pm");
  assert.doesNotMatch(r.route, /model_error/);
  const prompt = t.llm.prompts.at(-1)!;
  assert.match(prompt, /I want chicken kheema fry and extra raita for Friday 6pm/i);
  assert.doesNotMatch(prompt, /Tell me about the weekly plans/i);
  assert.doesNotMatch(prompt, /Forget everything before this/i);
});
'''
if old not in s:
    raise SystemExit('old reset regression test not found')
s = s.replace(old, new, 1)
p.write_text(s)
