from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"already fixed: {label}")
        return text
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    print(f"fixed: {label}")
    return text.replace(old, new, 1)

# ---------- src/agent.ts ----------
p = Path("src/agent.ts")
s = p.read_text()

s = replace_once(
    s,
    'const CUSTOM_ABANDON = /(?:\\bnever\\s*mind\\b|\\bnevermind\\b|\\bforget\\s+(?:it|that|the\\s+(?:bulk|custom|catering|tray)(?:\\s+(?:one|order|request))?)\\b|\\b(?:cancel|drop|skip)\\s+(?:the\\s+)?(?:bulk|custom|catering|tray)(?:\\s+(?:one|order|request))?\\b|\\b(?:don\\\'?t|do not|no longer)\\s+want\\s+(?:the\\s+)?(?:bulk|custom|catering|tray)\\b)/i;\n',
    'const CUSTOM_ABANDON = /(?:\\bnever\\s*mind\\b|\\bnevermind\\b|\\bforget\\s+(?:it|that|the\\s+(?:bulk|custom|catering|tray)(?:\\s+(?:one|order|request))?)\\b|\\b(?:cancel|drop|skip)\\s+(?:the\\s+)?(?:bulk|custom|catering|tray)(?:\\s+(?:one|order|request))?\\b|\\b(?:don\\\'?t|do not|no longer)\\s+want\\s+(?:the\\s+)?(?:bulk|custom|catering|tray)\\b)/i;\n/** Explicit reset of the current unplaced draft. Placed orders are never touched. */\nconst DRAFT_RESET = /\\b(?:forget\\s+everything\\s+before\\s+this|start\\s+over|reset\\s+(?:this|the|my)?\\s*order|fresh\\s+order)\\b/i;\n',
    "draft reset intent",
)

s = replace_once(
    s,
    '    const m = new RegExp(`\\\\b(\\\\d{1,3})\\\\s+(?:x\\\\s+)?${words}\\\\b`, "i").exec(text);\n',
    '    // Do not read a menu price such as "$17 Gongura ..." as quantity 17.\n    // A bulk quantity must start the string or be preceded by a non-word, non-currency character.\n    const m = new RegExp(`(?:^|[^\\\\w$])(\\\\d{1,3})\\\\s+(?:x\\\\s+)?${words}\\\\b`, "i").exec(text);\n',
    "currency is not a bulk quantity",
)

anchor = '''function deterministicCustomItems(text: string, menu: MenuItem[]): Draft["items"] {\n  const tt = tokens(text);\n  const qty = customHeadcount(text) ?? bulkMenuQuantity(text, menu) ?? 1;\n  const matches = menu.filter((it) => {\n    const mt = tokens(it.name.replace(/\\s+combo$/i, ""));\n    return mt.size > 0 && [...mt].every((t) => tt.has(t));\n  }).sort((a, b) => b.name.length - a.name.length);\n  const m = matches[0];\n  return m ? [{ id: m.id, name: m.name, qty, pack: "single", amt: null }] : [];\n}\n\n'''
insert = anchor + '''/** If a reset message also contains a replacement order, return only that fresh-order part. */\nfunction resetRemainder(text: string): string {\n  const fresh = /\\bfresh\\s+order\\s*:\\s*(.+)$/i.exec(text);\n  if (fresh?.[1]?.trim()) return fresh[1].trim();\n  const swap = /\\b(?:instead|just)\\b[\\s,:-]*(.+)$/i.exec(text);\n  if (swap?.[1]?.trim()) return swap[1].trim();\n  const sentence = /^[^.!?]*[.!?]+\\s*(.+)$/.exec(text);\n  return sentence?.[1]?.trim() ?? "";\n}\n\n'''
if insert not in s:
    if anchor not in s:
        raise SystemExit("missing target: reset remainder helper")
    s = s.replace(anchor, insert, 1)
    print("fixed: reset remainder helper")
else:
    print("already fixed: reset remainder helper")

old = '''  const p = zonedParts(now, tz);\n  const rel = /\\b(today|tomorrow)\\b/i.exec(text);\n  let d: Date;\n  if (rel) {\n'''
new = '''  const p = zonedParts(now, tz);\n  // An explicit calendar date wins over a weekday. This prevents "Saturday Oct 3" from\n  // being collapsed to the nearest Saturday (for example Sep 26).\n  const md = /\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b/i.exec(text);\n  if (md) {\n    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };\n    const key = md[1]!.toLowerCase().slice(0, md[1]!.toLowerCase().startsWith("sept") ? 4 : 3);\n    const mo = months[key]!;\n    const day = Number(md[2]);\n    let y = md[3] ? Number(md[3]) : p.y;\n    if (!md[3] && (mo < p.m || (mo === p.m && day < p.d))) y += 1;\n    const check = new Date(Date.UTC(y, mo - 1, day));\n    if (check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === day) {\n      return `${y}-${pad(mo)}-${pad(day)}T${pad(clock.h)}:${pad(clock.mi)}`;\n    }\n  }\n  const rel = /\\b(today|tomorrow)\\b/i.exec(text);\n  let d: Date;\n  if (rel) {\n'''
s = replace_once(s, old, new, "explicit custom calendar date")

s = replace_once(
    s,
    '    const text = msg.text.trim().slice(0, MAX_TEXT);\n',
    '    let text = msg.text.trim().slice(0, MAX_TEXT);\n',
    "effective turn text can be reset",
)

old = '''    // A pending custom request is not a placed order. If the customer abandons it, clear the\n    // entire draft immediately so its item, quantity and owner quote cannot contaminate a later order.\n    if (draft?.custom && CUSTOM_ABANDON.test(text)) {\n      const hadQuote = draft.custom.price != null;\n      store.clearDraft(msg.from);\n      for (const a of store.listAlerts(true)) {\n        if (a.waId === msg.from && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);\n      }\n      out.route = "custom_abandoned";\n      out.replies.push(\n        `No problem — I cleared that pending custom/bulk request${hadQuote ? " and its old quoted price" : ""}. ` +\n        `Nothing from it will carry into your next order. Any already-confirmed orders are unchanged.`\n      );\n      await this.d.notifier.notify(\n        "Custom/bulk request withdrawn",\n        `${customer.name || msg.name || "Customer"} withdrew the pending custom/bulk request. Do not prepare or price that request.`,\n      );\n      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());\n      return out;\n    }\n'''
new = '''    // A pending draft can be reset without deleting the whole chat. If the same message also\n    // contains a replacement order, continue processing only that fresh-order part in this turn.\n    const abandoningCustom = !!draft?.custom && CUSTOM_ABANDON.test(text);\n    const resettingDraft = !!draft && DRAFT_RESET.test(text);\n    if (abandoningCustom || resettingDraft) {\n      const wasCustom = !!draft?.custom;\n      const hadQuote = draft?.custom?.price != null;\n      const remainder = resetRemainder(text);\n      store.clearDraft(msg.from);\n      if (wasCustom) {\n        for (const a of store.listAlerts(true)) {\n          if (a.waId === msg.from && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);\n        }\n        await this.d.notifier.notify(\n          "Custom/bulk request withdrawn",\n          `${customer.name || msg.name || "Customer"} withdrew the pending custom/bulk request. Do not prepare or price that request.`,\n        );\n      }\n      out.replies.push(wasCustom\n        ? `No problem — I cleared that pending custom/bulk request${hadQuote ? " and its old quoted price" : ""}. Nothing from it will carry into your next order. Any already-confirmed orders are unchanged.`\n        : "No problem — I cleared the current unplaced order. Any already-confirmed orders are unchanged.");\n      draft = null;\n      if (!remainder) {\n        out.route = wasCustom ? "custom_abandoned" : "draft_reset";\n        for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());\n        return out;\n      }\n      text = remainder;\n    }\n'''
s = replace_once(s, old, new, "reset and continue with replacement order")

old = '''    const prompt = buildPrompt({\n      now, settings, menu, customer: { waId: msg.from, name: customer.name, contact: "", profile: customer.profile, uncertainStreak: streak },\n      draft, history: store.getMessages(msg.from, 40), hint: [pickHint, hint].filter(Boolean).join(" ") || undefined,\n      placed: open.map((o) => `#${o.id} (${o.status}) ${o.items.map(itemLabel).join(", ")}, pickup ${formatWhen(o.pickup)}`),\n    });\n'''
new = '''    const promptHistory = store.getMessages(msg.from, 40);\n    // When a reset message contains a replacement order, the stored transcript keeps the customer's\n    // full wording for audit, but Claude sees only the fresh-order remainder as the newest turn.\n    const newest = promptHistory.at(-1);\n    if (newest?.who === "cust" && newest.text !== text) promptHistory[promptHistory.length - 1] = { ...newest, text };\n    const prompt = buildPrompt({\n      now, settings, menu, customer: { waId: msg.from, name: customer.name, contact: "", profile: customer.profile, uncertainStreak: streak },\n      draft, history: promptHistory, hint: [pickHint, hint].filter(Boolean).join(" ") || undefined,\n      placed: open.map((o) => `#${o.id} (${o.status}) ${o.items.map(itemLabel).join(", ")}, pickup ${formatWhen(o.pickup)}`),\n    });\n'''
s = replace_once(s, old, new, "sanitise reset turn for model")
p.write_text(s)

# ---------- src/server.ts ----------
p = Path("src/server.ts")
s = p.read_text()

anchor = '''function ownerQuotedPrice(text: string): number | null {\n  const m = /(?:\\$\\s*(\\d{1,5}(?:\\.\\d{1,2})?)|(\\d{1,5}(?:\\.\\d{1,2})?)\\s*(?:\\$|cad\\b))/i.exec(text);\n  if (!m) return null;\n  const n = Number(m[1] ?? m[2]);\n  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) / 100 : null;\n}\n\n'''
insert = anchor + '''function bareOwnerPrice(text: string): boolean {\n  return /^(?:\\$\\s*\\d{1,5}(?:\\.\\d{1,2})?|\\d{1,5}(?:\\.\\d{1,2})?\\s*(?:\\$|cad))$/i.test(text.trim());\n}\n\n'''
if insert not in s:
    if anchor not in s:
        raise SystemExit("missing target: bare owner price helper")
    s = s.replace(anchor, insert, 1)
    print("fixed: bare owner price helper")
else:
    print("already fixed: bare owner price helper")

old = '''          if (m === "POST" && mt[2] === "reply") {\n            const text = cleanText((await readJson(req)).text, MAX_TEXT);\n            if (!text) throw new HttpError(400, "Reply is empty");\n            if (lowValueOwnerReply(text) && ownerQuotedPrice(text) == null) {\n              throw new HttpError(400, "Please send a more complete reply so the customer has enough context.");\n            }\n            const id = store.addMessage(waId, "owner", text, now());\n\n            // Custom/catering orders keep the owner's quoted total in the draft.\n            // A quoted price finalizes the owner's terms; the customer's later confirmation creates the real order.\n            const draft = store.getDraft(waId);\n            if (draft?.custom) {\n              const quoted = ownerQuotedPrice(text);\n              const approved = ownerApprovesCustom(text);\n              if (quoted != null || approved) {\n'''
new = '''          if (m === "POST" && mt[2] === "reply") {\n            const text = cleanText((await readJson(req)).text, MAX_TEXT);\n            if (!text) throw new HttpError(400, "Reply is empty");\n            const draft = store.getDraft(waId);\n            const quoted = ownerQuotedPrice(text);\n            const approved = ownerApprovesCustom(text);\n            if (lowValueOwnerReply(text) && quoted == null) {\n              throw new HttpError(400, "Please send a more complete reply so the customer has enough context.");\n            }\n            // A stale owner screen must not leak a bare price from an abandoned custom request into\n            // the customer's chat. Bare quotes are meaningful only while a custom draft is active.\n            if (quoted != null && bareOwnerPrice(text) && !draft?.custom) {\n              throw new HttpError(409, "There is no active custom/bulk request for this customer. Refresh the chat before quoting a price.");\n            }\n            const id = store.addMessage(waId, "owner", text, now());\n\n            // Custom/catering orders keep the owner's quoted total in the draft.\n            // A quoted price finalizes the owner's terms; the customer's later confirmation creates the real order.\n            if (draft?.custom) {\n              if (quoted != null || approved) {\n'''
s = replace_once(s, old, new, "reject stale bare custom quote")
p.write_text(s)

# ---------- src/store.ts ----------
p = Path("src/store.ts")
s = p.read_text()
s = replace_once(
    s,
    '''    this.db.prepare("DELETE FROM web_sessions WHERE wa_id = ?").run(waId);\n    this.db.prepare("UPDATE customers SET profile = '', uncertain_streak = 0 WHERE wa_id = ?").run(waId);\n''',
    '''    this.db.prepare("DELETE FROM web_sessions WHERE wa_id = ?").run(waId);\n    // Non-order alerts depend on chat context. Once the customer deletes the chat they must not\n    // remain as orphaned "Open chat" tasks for the owner. Order-linked alerts stay for kitchen safety.\n    this.db.prepare("UPDATE alerts SET done = 1 WHERE wa_id = ? AND order_id IS NULL").run(waId);\n    this.db.prepare("UPDATE customers SET profile = '', uncertain_streak = 0 WHERE wa_id = ?").run(waId);\n''',
    "close orphaned alerts when chat deleted",
)
p.write_text(s)

# ---------- public/desk.js ----------
p = Path("public/desk.js")
s = p.read_text()
old = '''    const messages = h("div", { class: "msgs", id: "thread", role: "log", "aria-live": "polite" },\n      chat.messages.map((m) => {\n        const who = m.who === "cust" ? "Customer" : m.who === "owner" ? "You" : "Annu";\n        return h("div", { class: "b " + m.who },\n          h("small", {}, who + " · " + timeOf(m.ts)),\n          h("span", { class: "chat-message-text" }, m.text));\n      }));\n'''
new = '''    const messages = h("div", { class: "msgs", id: "thread", role: "log", "aria-live": "polite" },\n      chat.messages.length ? chat.messages.map((m) => {\n        const who = m.who === "cust" ? "Customer" : m.who === "owner" ? "You" : "Annu";\n        return h("div", { class: "b " + m.who },\n          h("small", {}, who + " · " + timeOf(m.ts)),\n          h("span", { class: "chat-message-text" }, m.text));\n      }) : h("div", { class: "empty" }, "No chat messages are available. The customer may have deleted this chat or started a new session."));\n'''
s = replace_once(s, old, new, "owner empty chat state")
p.write_text(s)

# ---------- test/web.test.ts ----------
p = Path("test/web.test.ts")
s = p.read_text()

anchor = '''  test("Round 5: custom recipe bypasses model; Sunday noon parses; customer price is ignored", () =>\n'''
new_tests = r'''  test("Round 8: abandon plus a replacement order in the same message becomes a normal $17 order", () =>
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

'''
if new_tests not in s:
    if anchor not in s:
        raise SystemExit("missing target: Round 8 tests anchor")
    s = s.replace(anchor, new_tests + anchor, 1)
    print("fixed: Round 8 contamination regressions")
else:
    print("already fixed: Round 8 contamination regressions")

old = '''  test("terse owner filler replies are rejected and never reach customer history", () =>\n    withRig(async ({ t, start, call }) => {\n      const token = await start("Asha");\n      const waId = t.store.listCustomers()[0]!.waId;\n      const reply = (text: string) => call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text } });\n\n      for (const filler of ["Yes", "Ok", "No thank you", "Sure", "Thanks"]) {\n        const r = await reply(filler);\n        assert.equal(r.status, 400, filler);\n      }\n      assert.equal((await reply("$120")).status, 200, "a short quoted price is meaningful and remains allowed");\n      assert.equal((await reply("Yes, we can prepare that for tomorrow.")).status, 200);\n\n      const history = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "owner");\n      assert.deepEqual(history.map((m: any) => m.text), ["$120", "Yes, we can prepare that for tomorrow."]);\n    }));\n'''
new = '''  test("terse owner filler replies are rejected and bare prices require an active custom request", () =>\n    withRig(async ({ t, start, say, call }) => {\n      const token = await start("Asha");\n      const waId = t.store.listCustomers()[0]!.waId;\n      const reply = (text: string) => call("POST", `/api/customers/${encodeURIComponent(waId)}/reply`, { token: "secret", body: { text } });\n\n      for (const filler of ["Yes", "Ok", "No thank you", "Sure", "Thanks"]) {\n        const r = await reply(filler);\n        assert.equal(r.status, 400, filler);\n      }\n      assert.equal((await reply("$120")).status, 409, "a stale bare price cannot leak into an ordinary chat");\n      await say(token, "25 Chicken Kheema Fry combos");\n      assert.equal((await reply("$120")).status, 200, "a bare quoted price is allowed for an active custom request");\n      assert.equal((await reply("Yes, we can prepare that for tomorrow.")).status, 200);\n\n      const history = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "owner");\n      assert.deepEqual(history.map((m: any) => m.text), ["$120", "Yes, we can prepare that for tomorrow."]);\n    }));\n'''
s = replace_once(s, old, new, "owner stale quote regression")

old = '''      assert.equal((await call("DELETE", "/web/me", { token })).status, 200);\n      assert.equal(t.store.getMessages(wa, 50).length, 0);\n      assert.equal((await call("GET", "/web/history", { token })).status, 401);\n      assert.equal(t.store.listOrders().length, 1);\n'''
new = '''      // A chat-only alert would otherwise leave the owner with a stale Open chat card and a blank thread.\n      t.store.insertAlert({ waId: wa, cust: "Asha", note: "Custom/bulk request: old pending request", orderId: null, createdAt: Date.now() });\n      assert.ok(t.store.listAlerts(true).some((a) => a.waId === wa && a.orderId == null));\n      assert.equal((await call("DELETE", "/web/me", { token })).status, 200);\n      assert.equal(t.store.getMessages(wa, 50).length, 0);\n      assert.equal(t.store.listAlerts(true).some((a) => a.waId === wa && a.orderId == null), false);\n      assert.equal((await call("GET", "/web/history", { token })).status, 401);\n      assert.equal(t.store.listOrders().length, 1);\n'''
s = replace_once(s, old, new, "delete chat closes orphaned alerts")
p.write_text(s)

print("Round 8 patch prepared.")
