from pathlib import Path
import subprocess

BASE_UI = "d3f8eacaaf60385777a995f9e79484f129c661c7"
subprocess.run(["git", "checkout", BASE_UI, "--", "public/index.html", "public/desk.html"], check=True)

p = Path("src/prompt.ts")
s = p.read_text()
old = """    `Pickup happens at ${s.address}. Weekly plans can be picked up on ${days}. Weekend combos can be picked up on ${comboDays}. An item that lists its own pickup_days uses those. A pickup is allowed only on a day that every ordered item allows. Saturday and Sunday pickup is fine for weekend combos, so never say it is impossible. If the day is not allowed, say which days that item can be picked up and flag it for Maddy.`,"""
new = """    `Pickup happens at ${s.address}. Weekly plans normally use ${days}. Weekend combos normally use ${comboDays}. An item that lists its own pickup_days uses those as its normal pickup days. If a customer requests a pickup outside the normal days, do NOT reject the request, do NOT say the pickup is impossible, and do NOT force them to choose another day. Keep the customer's requested pickup date/time in the draft, set needs_owner to true, and tell the customer Annapurna Home Foods needs to confirm that pickup. If the items and requested pickup time are complete, set stage to awaiting_confirmation so the system can show the read-back; after the customer confirms, code will create the order on hold for Annapurna Home Foods to approve. Saturday and Sunday remain normal pickup days for weekend combos when configured.`,"""
assert old in s, "pickup rule not found"
s = s.replace(old, new, 1)
p.write_text(s)

# Strengthen the existing regression tests so owner-approval behavior stays in the model prompt.
t = Path("test/agent.test.ts")
ts = t.read_text()
old_test = '''test("a non-pickup day puts the order on hold", async () => {\n  const t = setup({ judge: yesJudge });\n  await orderAndReadBack(t, [KHEEMA_BOGO], "2026-09-28T12:00", "2 kheema fry combos monday at noon"); // Monday, not a combo day\n  await t.say("yes");\n  const o = t.store.listOrders()[0]!;\n  assert.deepEqual([o.status, o.flags], ["hold", ["Monday is not a pickup day for Chicken Kheema Fry combo"]]);\n});'''
new_test = '''test("a non-pickup day is kept for owner approval and puts the order on hold", async () => {\n  const t = setup({ judge: yesJudge });\n  const r = await orderAndReadBack(t, [KHEEMA_BOGO], "2026-09-28T12:00", "2 kheema fry combos monday at noon"); // Monday, outside normal combo days\n  assert.match(t.llm.prompts[0]!, /do NOT reject the request/);\n  assert.match(t.llm.prompts[0]!, /set needs_owner to true/);\n  assert.match(r.replies[0]!, /Annapurna Home Foods needs to confirm this order first/);\n  await t.say("yes");\n  const o = t.store.listOrders()[0]!;\n  assert.deepEqual([o.status, o.flags], ["hold", ["Monday is not a pickup day for Chicken Kheema Fry combo"]]);\n});'''
assert old_test in ts, "non-pickup regression test not found"
ts = ts.replace(old_test, new_test, 1)
old_weekend = '  assert.match(t.llm.prompts[0]!, /never say it is impossible/);'
new_weekend = '  assert.match(t.llm.prompts[0]!, /Saturday and Sunday remain normal pickup days for weekend combos/);'
assert old_weekend in ts, "weekend prompt assertion not found"
ts = ts.replace(old_weekend, new_weekend, 1)
t.write_text(ts)
