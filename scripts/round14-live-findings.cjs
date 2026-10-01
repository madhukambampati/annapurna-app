const fs = require('fs');

function replaceOnce(file, oldText, newText) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`Expected block not found in ${file}: ${oldText.slice(0, 180)}`);
  s = s.replace(oldText, newText);
  fs.writeFileSync(file, s);
}

function appendBefore(file, marker, text) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(marker)) throw new Error(`Marker not found in ${file}`);
  s = s.replace(marker, `${text}\n${marker}`);
  fs.writeFileSync(file, s);
}

// B1: a clear fresh menu order must win over an over-eager placed-order change score.
replaceOnce('src/agent.ts',
`    // The "Yes, place order" button sends exactly this text. It is a yes, whatever the judge thinks.\n    if (ctx.awaitingConfirmation && CONFIRM_BUTTON.test(text) && judgment.cancelPlaced < 0.5) judgment = { ...judgment, agrees: Math.max(judgment.agrees ?? 0, 0.99) };\n    out.judgment = judgment;`,
`    // The "Yes, place order" button sends exactly this text. It is a yes, whatever the judge thinks.\n    if (ctx.awaitingConfirmation && CONFIRM_BUTTON.test(text) && judgment.cancelPlaced < 0.5) judgment = { ...judgment, agrees: Math.max(judgment.agrees ?? 0, 0.99) };\n\n    // A clearly phrased fresh menu order must not be mistaken for a change/cancel request merely\n    // because this customer already has another live order. TypeSafe can occasionally over-score\n    // cancels_placed_order when hasPlacedOrder=true, so code gives a deterministic fresh-order\n    // sentence priority unless the customer actually uses change/cancel language or targets an\n    // existing order. Phrases such as "instead" remain ambiguous and are deliberately not forced.\n    const clearFreshMenuOrder = open.length > 0\n      && clearlyNormalMenuOrder(text, menu)\n      && !PLACED_ORDER_CHANGE.test(text)\n      && !EXPLICIT_PLACED_ORDER_TARGET.test(text)\n      && !/\\b(?:instead|rather\\s+than|swap|remove)\\b/i.test(text);\n    if (clearFreshMenuOrder && judgment.cancelPlaced >= cfg.thresholds.cancelMaybe) {\n      judgment = {\n        ...judgment,\n        cancelPlaced: 0.05,\n        intent: {\n          label: "order",\n          prob: Math.max(judgment.intent.prob, 0.95),\n          confidence: Math.max(judgment.intent.confidence, 0.9),\n        },\n      };\n    }\n    out.judgment = judgment;`);

// B2: a clear owner decision on a cancellation request should resolve that alert even when the
// owner declines the cancellation and the order remains active.
replaceOnce('src/server.ts',
`function lowValueOwnerReply(text: string): boolean {\n  return /^(?:ok(?:ay)?|yes|no|sure|thanks|thank you|no thank you|yes please|got it|fine|alright|order\\s+confirm(?:ed|ing)|confirm(?:ed|ing)\\s+ord\\w*)[\\s.!?]*$/i.test(text.trim());\n}`,
`function lowValueOwnerReply(text: string): boolean {\n  return /^(?:ok(?:ay)?|yes|no|sure|thanks|thank you|no thank you|yes please|got it|fine|alright|order\\s+confirm(?:ed|ing)|confirm(?:ed|ing)\\s+ord\\w*)[\\s.!?]*$/i.test(text.trim());\n}\n\n/** A customer cancellation request is resolved when the owner clearly accepts or declines it. */\nfunction ownerResolvedCancellation(text: string): number | 0 | null {\n  if (!/\\b(?:cancel|cancellation)\\b/i.test(text)) return null;\n  if (!/\\b(?:cancelled|canceled|approv(?:e|ed)|accept(?:ed)?|declin(?:e|ed)|cannot|can(?:not|'t)|unable|not\\s+able|not\\s+possible|won't|will\\s+not|remains?\\s+active|keep(?:ing)?)\\b/i.test(text)) return null;\n  const m = /\\border\\s*#?\\s*(\\d+)\\b/i.exec(text);\n  return m ? Number(m[1]) : 0;\n}`);

replaceOnce('src/server.ts',
`            store.closeHandoffs(waId);\n            return send(req, res, 200, { message: { id, who: "owner", text: customerText, ts: now() } });`,
`            store.closeHandoffs(waId);\n            const resolvedCancellation = ownerResolvedCancellation(customerText);\n            if (resolvedCancellation !== null) {\n              const pending = store.listAlerts(true).filter((a) =>\n                a.waId === waId && a.orderId != null && a.note.startsWith("Cancellation requested")\n              );\n              const targets = resolvedCancellation > 0\n                ? pending.filter((a) => a.orderId === resolvedCancellation)\n                : pending.length === 1 ? pending : [];\n              for (const a of targets) store.markAlertDone(a.id);\n            }\n            return send(req, res, 200, { message: { id, who: "owner", text: customerText, ts: now() } });`);

// B3: deletion confirmation is transient and cannot linger on an otherwise fresh signup screen.
replaceOnce('public/app.js',
`      show("onboard");\n      $("startErr").textContent = "Your chat was deleted.";\n      window.scrollTo({ top: 0, behavior: "smooth" });`,
`      show("onboard");\n      var deletedNotice = $("startErr");\n      deletedNotice.textContent = "Your chat was deleted.";\n      setTimeout(function () {\n        if (deletedNotice.textContent === "Your chat was deleted.") deletedNotice.textContent = "";\n      }, 3500);\n      window.scrollTo({ top: 0, behavior: "smooth" });`);

// Regression: reproduce B1 with an intentionally over-eager cancel/change judgment.
appendBefore('test/agent.test.ts', '\ntest("extractJson handles plain, fenced, wrapped and brace-in-string replies"', `\ntest("Round 14: a clear fresh menu order after an existing order is not mistaken for a change request", async () => {\n  const t = setup({ judge: (ctx) => ctx.hasPlacedOrder\n    ? { cancelPlaced: 0.99, intent: { label: "order", prob: 0.99, confidence: 0.98 } }\n    : {} });\n  const waId = "+15198043658";\n  t.store.upsertCustomer(waId, "Maxy", "maxy@example.com");\n  t.store.insertOrder({\n    waId,\n    name: "Maxy",\n    items: [{ id: "kheema_fry", name: "Chicken Kheema Fry combo", qty: 1, pack: "single", amt: 15 }],\n    pickup: FRI_6PM,\n    flags: [],\n    status: "cook",\n    notes: "",\n    createdAt: 1,\n  });\n  t.llm.push(modelReply({\n    items: [{ id: "bagara_chicken_fry", qty: 2, pack: "single", asked_for: "Bagara Rice and Chicken Fry combo" }],\n    pickup: "2026-09-25T17:00",\n    name: "Maxy",\n    stage: "awaiting_confirmation",\n  }));\n\n  const r = await t.say("I want 2 Bagara Rice and Chicken Fry combo, pickup Friday 5pm", waId, { name: "Maxy" });\n  assert.equal(r.route, "normal");\n  assert.match(r.replies[0]!, /Bagara Rice and Chicken Fry combo/);\n  assert.equal(t.store.listAlerts(true).some((a) => /cancel or change order/i.test(a.note)), false);\n  assert.equal(r.judgment?.cancelPlaced, 0.05);\n});\n`);

// Regression: a clear owner decline resolves the pending cancellation request while leaving the order active.
appendBefore('test/web.test.ts', '\n  test("ready and picked-up transitions require explicit owner confirmation"', `\n  test("Round 14: an owner cancellation decision closes the pending cancellation alert", () =>\n    withRig(async ({ t, start, say, call }) => {\n      const token = await start("Asha", "5198043658");\n      t.llm.push(modelReply({ items: [{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "kheema fry" }], pickup: FRI_6PM, stage: "awaiting_confirmation" }));\n      await say(token, "1 kheema fry friday 6pm");\n      const id = (await say(token, "yes")).json.orderId;\n      await call("POST", \`/web/orders/\${id}/cancel-request\`, { token });\n      assert.equal(t.store.listAlerts(true).some((a) => a.orderId === id && /Cancellation requested/.test(a.note)), true);\n\n      const waId = t.store.listCustomers()[0]!.waId;\n      const reply = await call("POST", \`/api/customers/\${encodeURIComponent(waId)}/reply\`, {\n        token: "secret",\n        body: { text: \`Sorry, we can't cancel order #\${id} because it is already being prepared.\` },\n      });\n      assert.equal(reply.status, 200);\n      assert.equal(t.store.getOrder(id)!.status, "hold");\n      assert.equal(t.store.listAlerts(true).some((a) => a.orderId === id && /Cancellation requested/.test(a.note)), false);\n    }));\n`);

console.log('Round 14 live findings patch applied.');
