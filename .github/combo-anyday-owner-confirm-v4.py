from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    t = p.read_text()
    if old not in t:
        raise SystemExit(f"{label} not found")
    p.write_text(t.replace(old, new, 1))

# Customer UI
replace_once(
    "public/index.html",
    '<span class="tile-copy"><b>Weekend Combos</b><small>Single & Buy 1 Get 1 specials</small></span>',
    '<span class="tile-copy"><b>Combos</b><small>Single & Buy 1 Get 1 specials · ask for your preferred pickup day</small></span>',
    "home combo tile",
)

p = Path("public/app.js")
t = p.read_text()
t = t.replace('"What weekend combos are running?"', '"What combos are available?"')
t = t.replace('"Psst, ask me about weekend combos."', '"Psst, ask me about our combos."')
old = '["Weekend combos", h("div", { class: "panel" },\n      h("p", { class: "lead" }, "Cooked fresh for weekend pickup. Order at least " + m.noticeHrs + " hours ahead."),'
new = '["Combos", h("div", { class: "panel" },\n      h("p", { class: "lead" }, "Fresh homemade combos. Tell us your preferred pickup day and time; Annapurna will confirm availability when needed. Order at least " + m.noticeHrs + " hours ahead."),'
if old not in t: raise SystemExit("combo menu panel not found")
t = t.replace(old, new, 1)
t = t.replace('["sun", "Weekend combos", false, function () { if (!busy) send("What combos are available?"); }],', '["sun", "Combos", false, function () { if (!busy) send("What combos are available?"); }],')
t = t.replace('showMenu(e, "Weekend combos")', 'showMenu(e, "Combos")')
if "Weekend combos" in t or "weekend combos" in t: raise SystemExit("old weekend wording remains in app.js")
p.write_text(t)

# LLM instructions
p = Path("src/prompt.ts")
t = p.read_text()
old = "Two kinds of offers exist. Weekly plans cover the Monday to Friday weekly menu. Weekend combos and Buy 1 Get 1 deals run only every other weekend. Take an order for a combo only when available_now is true. Otherwise say it is not running right now and flag Maddy."
new = "Two kinds of offers exist. Weekly plans cover the Monday to Friday weekly menu. Combos may include Single and Buy 1 Get 1 pricing. A customer may request a combo for any pickup day. available_now only says whether that combo is currently offered on the menu; if false, say it is not running right now and flag Maddy. If the requested day is outside the usual combo schedule, do not reject it or force another day: collect the preferred date/time and tell the customer Annapurna Home Foods will confirm availability here in chat."
if old not in t: raise SystemExit("combo prompt rule not found")
t = t.replace(old, new, 1)
old = "Pickup happens at ${s.address}. Weekly plans can be picked up on ${days}. Weekend combos can be picked up on ${comboDays}. An item that lists its own pickup_days uses those. A pickup is allowed only on a day that every ordered item allows. Saturday and Sunday pickup is fine for weekend combos, so never say it is impossible. If the day is not allowed, say which days that item can be picked up and flag it for Maddy."
new = "Pickup happens at ${s.address}. Weekly plans can be picked up on ${days}. The usual combo pickup schedule is ${comboDays}, but combo customers may request any day. When a combo is requested outside its usual pickup schedule, never tell the customer that the day is forbidden and never force Friday, Saturday or Sunday; collect their preferred date/time and say Annapurna Home Foods will confirm availability here in chat. An item that lists its own pickup_days still uses those as its usual schedule. Non-combo items remain limited to their configured pickup days."
if old not in t: raise SystemExit("pickup prompt rule not found")
t = t.replace(old, new, 1)
old = 'offer: m.kind === "combo" ? "weekend combo" : m.kind === "plan" ? "weekly plan" :'
if old not in t: raise SystemExit("combo offer label not found")
t = t.replace(old, 'offer: m.kind === "combo" ? "combo" : m.kind === "plan" ? "weekly plan" :', 1)
old = 'pickup_days: m.kind === "addon" ? "same day as the main dish" : itemDays(m, s).map((d) => DAYN[d]),'
new = 'pickup_days: m.kind === "addon" ? "same day as the main dish" : m.kind === "combo" ? "customer may request any day; Annapurna confirms availability when needed" : itemDays(m, s).map((d) => DAYN[d]),\n    usual_pickup_days: m.kind === "combo" ? itemDays(m, s).map((d) => DAYN[d]) : undefined,'
if old not in t: raise SystemExit("pickup_days prompt field not found")
t = t.replace(old, new, 1)
p.write_text(t)

# Guard: combo off-schedule is an availability check; other item rules stay strict.
p = Path("src/guards.ts")
t = p.read_text()
old = '  const dow = dowOfLocal(pickupLocal);\n  const bad = items.filter((it) => !itemDays(findItem(menu, it.id), s).includes(dow));\n  if (bad.length) f.push(`${DAYN[dow]} is not a pickup day for ${bad.map((b) => b.name).join(", ")}`);\n  else if (!items.length && !s.days.includes(dow)) f.push(`${DAYN[dow]} is not a pickup day`);'
new = '  const dow = dowOfLocal(pickupLocal);\n  const bad = items.filter((it) => !itemDays(findItem(menu, it.id), s).includes(dow));\n  const comboChecks = bad.filter((it) => findItem(menu, it.id)?.kind === "combo");\n  const hardBad = bad.filter((it) => findItem(menu, it.id)?.kind !== "combo");\n  if (comboChecks.length) f.push(`Availability check needed for ${DAYN[dow]} pickup: ${comboChecks.map((b) => b.name).join(", ")}`);\n  if (hardBad.length) f.push(`${DAYN[dow]} is not a pickup day for ${hardBad.map((b) => b.name).join(", ")}`);\n  else if (!items.length && !s.days.includes(dow)) f.push(`${DAYN[dow]} is not a pickup day`);'
if old not in t: raise SystemExit("guard day block not found")
p.write_text(t.replace(old, new, 1))

# Read-back: YES sends an availability request instead of promising the off-schedule date.
p = Path("src/agent.ts")
t = p.read_text()
old = '    if (d.notes) out.push(`Note: ${d.notes}`);\n    if (flags.length) out.push(`Annapurna Home Foods needs to confirm this order first (${flags.join("; ").toLowerCase()}).`);\n    out.push("Reply YES to confirm, or tell me what to change.");'
new = '    if (d.notes) out.push(`Note: ${d.notes}`);\n    const availabilityCheck = flags.some((x) => x.startsWith("Availability check needed"));\n    if (availabilityCheck) out.push("Annapurna Home Foods will confirm availability for your requested pickup day before the order is confirmed.");\n    if (flags.length && !availabilityCheck) out.push(`Annapurna Home Foods needs to confirm this order first (${flags.join("; ").toLowerCase()}).`);\n    out.push(availabilityCheck ? "Reply YES to send this availability request, or tell me what to change." : "Reply YES to confirm, or tell me what to change.");'
if old not in t: raise SystemExit("agent readback block not found")
p.write_text(t.replace(old, new, 1))

# Public menu status: no Fri-Sun restriction shown on combo cards.
p = Path("src/server.ts")
t = p.read_text()
old = '            // One availability status per dish. A single-day offer also shows its next date.\n            let label = days.length === 1 ? dayRange(days) : `Pickup ${dayRange(days)}`;\n            if (days.length === 1) label += ` · ${dayLabel(nextDateForDow(now(), s.tz, days[0]!)).replace(/^\\w+, /, "")}`;\n            if (!live) label = "Not running right now";\n            if (x.kind === "addon") label = "Add to any order";'
new = '            // Combo customers may ask for any day; the shop confirms off-schedule availability in chat.\n            let label = x.kind === "combo" ? "Ask us for your preferred pickup day" : days.length === 1 ? dayRange(days) : `Pickup ${dayRange(days)}`;\n            if (x.kind !== "combo" && days.length === 1) label += ` · ${dayLabel(nextDateForDow(now(), s.tz, days[0]!)).replace(/^\\w+, /, "")}`;\n            if (!live) label = "Not running right now";\n            if (x.kind === "addon") label = "Add to any order";'
if old not in t: raise SystemExit("server availability block not found")
p.write_text(t.replace(old, new, 1))

# Regression test
p = Path("test/guards.test.ts")
t = p.read_text()
old = '  assert.deepEqual(checkFlags(ok, "2026-09-26T12:00", s, NOW), ["Saturday is not a pickup day for A"]);\n  assert.deepEqual(checkFlags([{ ...ok[0]!, amt: null }], FRI_6PM, s, NOW), ["Price not set"]);'
new = '  assert.deepEqual(checkFlags(ok, "2026-09-26T12:00", s, NOW), ["Saturday is not a pickup day for A"]);\n  const combo = [{ id: "kheema_fry", name: "Chicken Kheema Fry combo", qty: 1, pack: "single" as const, amt: 18 }];\n  assert.deepEqual(checkFlags(combo, "2026-09-24T18:00", s, NOW, menu), ["Availability check needed for Thursday pickup: Chicken Kheema Fry combo"]);\n  assert.deepEqual(checkFlags([{ ...ok[0]!, amt: null }], FRI_6PM, s, NOW), ["Price not set"]);'
if old not in t: raise SystemExit("guard regression insertion point not found")
p.write_text(t.replace(old, new, 1))

print("combo-anyday patch v4 applied")
