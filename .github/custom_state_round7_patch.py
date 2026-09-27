from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"already fixed: {label}")
        return text
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    print(f"fixed: {label}")
    return text.replace(old, new, 1)

# ---------- src/types.ts ----------
p = Path("src/types.ts")
s = p.read_text()
s = replace_once(
    s,
    "  /** Owner has supplied/finalized custom terms. A quoted price sets this true. */\n  approved: boolean;",
    "  /** Owner has supplied/finalized custom terms. A quoted price sets this true. */\n  approved: boolean;\n  /** Exact custom terms the owner priced. Confirmation is blocked if those terms later change. */\n  quote_key?: string | null;",
    "custom quote key type",
)
p.write_text(s)

# ---------- src/custom.ts ----------
p = Path("src/custom.ts")
custom_src = '''import type { Draft } from "./types.js";\n\nfunction clean(s: string): string {\n  return s.trim().replace(/\\s+/g, " ");\n}\n\n/** Identity of the custom food terms the owner priced. Pickup is intentionally excluded. */\nexport function customTermsKey(draft: Draft): string {\n  const request = clean(draft.custom?.request ?? "");\n  const items = draft.items.map((it) => `${it.id}:${it.pack}:${it.qty}`).sort();\n  return JSON.stringify({ request, items, notes: clean(draft.notes) });\n}\n\n/** A custom price is usable only when it was quoted for the exact current custom terms. */\nexport function customQuoteIsCurrent(draft: Draft): boolean {\n  const custom = draft.custom;\n  return !!custom && custom.price != null && !!custom.quote_key && custom.quote_key === customTermsKey(draft);\n}\n\nexport function clearCustomQuote(draft: Draft): Draft {\n  if (!draft.custom) return draft;\n  return { ...draft, custom: { ...draft.custom, price: null, approved: false, quote_key: null } };\n}\n'''
if not p.exists():
    p.write_text(custom_src)
    print("fixed: custom quote identity helper")
elif p.read_text() != custom_src:
    raise SystemExit("src/custom.ts already exists with unexpected content")
else:
    print("already fixed: custom quote identity helper")

# ---------- src/agent.ts ----------
p = Path("src/agent.ts")
s = p.read_text()
s = replace_once(
    s,
    'import type { Config } from "./config.js";\n',
    'import type { Config } from "./config.js";\nimport { clearCustomQuote, customQuoteIsCurrent, customTermsKey } from "./custom.js";\n',
    "agent custom helper import",
)
s = replace_once(
    s,
    'const CUSTOM_CONFIRM = /(?:^yes\\b|^go\\s+ahead\\b|\\bconfirm(?:ing|ed)?\\s+(?:(?:the|my)\\s+)?order\\b|\\bplace\\s+(?:(?:the|my)\\s+)?order\\b)/i;\n',
    'const CUSTOM_CONFIRM = /(?:^yes\\b|^go\\s+ahead\\b|\\bconfirm(?:ing|ed)?\\s+(?:(?:the|my)\\s+)?order\\b|\\bplace\\s+(?:(?:the|my)\\s+)?order\\b)/i;\n/** Explicitly abandoning an unplaced custom/bulk request must destroy every bit of its draft state. */\nconst CUSTOM_ABANDON = /(?:\\bnever\\s*mind\\b|\\bnevermind\\b|\\bforget\\s+(?:it|that|the\\s+(?:bulk|custom|catering|tray)(?:\\s+(?:one|order|request))?)\\b|\\b(?:cancel|drop|skip)\\s+(?:the\\s+)?(?:bulk|custom|catering|tray)(?:\\s+(?:one|order|request))?\\b|\\b(?:don\\'?t|do not|no longer)\\s+want\\s+(?:the\\s+)?(?:bulk|custom|catering|tray)\\b)/i;\n',
    "custom abandonment intent",
)
anchor = '''    // Important: only the active draft decides whether an order is custom.\n    // Do not infer custom/catering state from older chat history: customers often place a normal\n    // menu order after a catering order in the same conversation.\n\n'''
insert = anchor + '''    // A pending custom request is not a placed order. If the customer abandons it, clear the\n    // entire draft immediately so its item, quantity and owner quote cannot contaminate a later order.\n    if (draft?.custom && CUSTOM_ABANDON.test(text)) {\n      const hadQuote = draft.custom.price != null;\n      store.clearDraft(msg.from);\n      for (const a of store.listAlerts(true)) {\n        if (a.waId === msg.from && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);\n      }\n      out.route = "custom_abandoned";\n      out.replies.push(\n        `No problem — I cleared that pending custom/bulk request${hadQuote ? " and its old quoted price" : ""}. ` +\n        `Nothing from it will carry into your next order. Any already-confirmed orders are unchanged.`\n      );\n      await this.d.notifier.notify(\n        "Custom/bulk request withdrawn",\n        `${customer.name || msg.name || "Customer"} withdrew the pending custom/bulk request. Do not prepare or price that request.`,\n      );\n      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());\n      return out;\n    }\n\n'''
if insert not in s:
    if anchor not in s:
        raise SystemExit("missing target: custom abandonment clear block")
    s = s.replace(anchor, insert, 1)
    print("fixed: custom abandonment clear block")
else:
    print("already fixed: custom abandonment clear block")
old = '''    if (draft?.custom && CUSTOM_CONFIRM.test(text)) {\n      if (draft.custom.price != null && draft.pickup_local) {\n        out.route = "confirm_custom_order";\n        await this.placeCustomOrder(msg.from, draft, settings, out);\n      } else {\n        const missing = [\n          draft.custom.price == null ? "the final price" : "",\n          !draft.pickup_local ? "the pickup day and time" : "",\n        ].filter(Boolean);\n        out.route = "confirm_custom_order+waiting";\n        out.replies.push(`Your custom order is saved, but I still need ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} before I can place it. Annapurna Home Foods will finalize that here in this chat.`);\n      }\n      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());\n      return out;\n    }\n'''
new = '''    if (draft?.custom && CUSTOM_CONFIRM.test(text)) {\n      const staleQuote = draft.custom.price != null && !customQuoteIsCurrent(draft);\n      if (staleQuote) {\n        draft = clearCustomQuote(draft);\n        store.putDraft(msg.from, draft);\n      }\n      if (draft.custom.price != null && draft.pickup_local && customQuoteIsCurrent(draft)) {\n        out.route = "confirm_custom_order";\n        await this.placeCustomOrder(msg.from, draft, settings, out);\n      } else if (staleQuote) {\n        out.route = "confirm_custom_order+stale_quote";\n        out.replies.push("I won't place that custom order with an old quote. The requested items changed after that price was given, so Annapurna Home Foods needs to quote the current request again. No order was placed.");\n      } else {\n        const missing = [\n          draft.custom.price == null ? "the final price" : "",\n          !draft.pickup_local ? "the pickup day and time" : "",\n        ].filter(Boolean);\n        out.route = "confirm_custom_order+waiting";\n        out.replies.push(`Your custom order is saved, but I still need ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} before I can place it. Annapurna Home Foods will finalize that here in this chat.`);\n      }\n      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());\n      return out;\n    }\n'''
s = replace_once(s, old, new, "custom confirmation quote binding")
s = replace_once(
    s,
    '      const ready = draft.custom.price != null && !!draft.pickup_local;\n',
    '      const ready = customQuoteIsCurrent(draft) && !!draft.pickup_local;\n',
    "custom acknowledgement only for current quote",
)
old = '''    }\n    out.issues.push(...issues.map((i) => i.kind));\n\n    // Deterministic replies win over the model when code found a problem.\n    const fixes: string[] = [];\n'''
new = '''    }\n\n    // An owner quote belongs to the exact custom food terms that existed when it was sent. If the\n    // customer changes the dish, quantity, pack or custom notes, invalidate that quote immediately.\n    // Pickup can change without invalidating price because it is intentionally excluded from the key.\n    let staleCustomQuote = false;\n    if (!frozen && custom?.price != null) {\n      const candidate: Draft = {\n        items, pickup_local: pickup, customer_name: custName, notes, readback_hash: null, stage: "collecting", custom,\n      };\n      if (!custom.quote_key || custom.quote_key !== customTermsKey(candidate)) {\n        custom = { ...custom, price: null, approved: false, quote_key: null };\n        staleCustomQuote = true;\n      }\n    }\n    out.issues.push(...issues.map((i) => i.kind));\n\n    // Deterministic replies win over the model when code found a problem.\n    const fixes: string[] = [];\n    if (staleCustomQuote) {\n      fixes.push("The custom request changed, so I cleared the old quoted price. No order is placed. Annapurna Home Foods needs to quote the updated request before you can confirm it.");\n      out.issues.push("stale_custom_quote");\n    }\n'''
s = replace_once(s, old, new, "invalidate custom quote when terms change")
s = replace_once(
    s,
    '''    const custom = draft.custom;\n    if (!custom || custom.price == null || !draft.pickup_local) return;\n\n    const already = store.openOrdersFor(waId).find((o) =>\n''',
    '''    const custom = draft.custom;\n    if (!custom || custom.price == null || !draft.pickup_local) return;\n    // Last line of defence: even a stale/corrupt draft cannot create a custom order using a quote\n    // that was issued for different items or quantities.\n    if (!customQuoteIsCurrent(draft)) {\n      store.putDraft(waId, clearCustomQuote(draft));\n      out.route = "confirm_custom_order+stale_quote";\n      out.issues.push("stale_custom_quote");\n      out.replies.push("I won't place that custom order with an old quote. Annapurna Home Foods needs to quote the current request again. No order was placed.");\n      return;\n    }\n\n    const already = store.openOrdersFor(waId).find((o) =>\n''',
    "custom placement stale quote guard",
)
p.write_text(s)

# ---------- src/server.ts ----------
p = Path("src/server.ts")
s = p.read_text()
s = replace_once(
    s,
    'import type { Config } from "./config.js";\n',
    'import type { Config } from "./config.js";\nimport { customTermsKey } from "./custom.js";\n',
    "server custom helper import",
)
old = '''              if (quoted != null || approved) {\n                store.putDraft(waId, {\n                  ...draft,\n                  custom: {\n                    ...draft.custom,\n                    ...(quoted != null ? { price: quoted, approved: true } : {}),\n                    ...(approved ? { approved: true } : {}),\n                  },\n                });\n              }\n'''
new = '''              if (quoted != null || approved) {\n                const next = {\n                  ...draft,\n                  custom: {\n                    ...draft.custom,\n                    ...(quoted != null ? { price: quoted, approved: true } : {}),\n                    ...(approved ? { approved: true } : {}),\n                  },\n                };\n                // Bind the authenticated owner's price to these exact custom terms. A later item/qty\n                // change makes this key mismatch and the customer must receive a fresh owner quote.\n                if (quoted != null) next.custom.quote_key = customTermsKey(next);\n                store.putDraft(waId, next);\n              }\n'''
s = replace_once(s, old, new, "bind owner quote to custom terms")
p.write_text(s)

# ---------- test/web.test.ts ----------
p = Path("test/web.test.ts")
s = p.read_text()
anchor = '''  test("Round 5: custom recipe bypasses model; Sunday noon parses; customer price is ignored", () =>\n'''
new_tests = r'''  test("Round 7: abandoning a quoted bulk request cannot contaminate the next normal order", () =>
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

'''
if new_tests not in s:
    if anchor not in s:
        raise SystemExit("missing target: Round 7 web regression tests")
    s = s.replace(anchor, new_tests + anchor, 1)
    print("fixed: Round 7 contamination regression tests")
else:
    print("already fixed: Round 7 contamination regression tests")
p.write_text(s)

print("Round 7 custom state safety patch prepared.")
