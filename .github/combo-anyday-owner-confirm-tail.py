from pathlib import Path

# v2 intentionally reaches this point after changing the UI and first combo rule.
p = Path("src/prompt.ts")
t = p.read_text()
if "A customer may request a combo for any pickup day" not in t:
    raise SystemExit("first combo prompt rule was not applied")
old = '    `Pickup happens at ${s.address}. Weekly plans can be picked up on ${days}. Weekend combos can be picked up on ${comboDays}. An item that lists its own pickup_days uses those. A pickup is allowed only on a day that every ordered item allows. Saturday and Sunday pickup is fine for weekend combos, so never say it is impossible. If the day is not allowed, say which days that item can be picked up and flag it for Maddy.`,\n'
new = '    `Pickup happens at ${s.address}. Weekly plans can be picked up on ${days}. The usual combo pickup schedule is ${comboDays}, but combo customers may request any day. When a combo is requested outside its usual pickup schedule, never tell the customer that the day is forbidden and never force Friday, Saturday or Sunday; collect their preferred date/time and say Annapurna Home Foods will confirm availability here in chat. An item that lists its own pickup_days still uses those as its usual schedule. Non-combo items remain limited to their configured pickup days.`,\n'
if old not in t: raise SystemExit("exact pickup rule not found")
t = t.replace(old, new, 1)
t = t.replace('offer: m.kind === "combo" ? "weekend combo" : m.kind === "plan" ? "weekly plan" :', 'offer: m.kind === "combo" ? "combo" : m.kind === "plan" ? "weekly plan" :')
old = 'pickup_days: m.kind === "addon" ? "same day as the main dish" : itemDays(m, s).map((d) => DAYN[d]),'
new = 'pickup_days: m.kind === "addon" ? "same day as the main dish" : m.kind === "combo" ? "customer may request any day; Annapurna confirms availability when needed" : itemDays(m, s).map((d) => DAYN[d]),\n    usual_pickup_days: m.kind === "combo" ? itemDays(m, s).map((d) => DAYN[d]) : undefined,'
if old not in t: raise SystemExit("pickup_days field not found")
t = t.replace(old, new, 1)
p.write_text(t)

p = Path("src/guards.ts")
t = p.read_text()
old = '''  const dow = dowOfLocal(pickupLocal);\n  const bad = items.filter((it) => !itemDays(findItem(menu, it.id), s).includes(dow));\n  if (bad.length) f.push(`${DAYN[dow]} is not a pickup day for ${bad.map((b) => b.name).join(", ")}`);\n  else if (!items.length && !s.days.includes(dow)) f.push(`${DAYN[dow]} is not a pickup day`);'''
new = '''  const dow = dowOfLocal(pickupLocal);\n  const bad = items.filter((it) => !itemDays(findItem(menu, it.id), s).includes(dow));\n  const comboChecks = bad.filter((it) => findItem(menu, it.id)?.kind === "combo");\n  const hardBad = bad.filter((it) => findItem(menu, it.id)?.kind !== "combo");\n  if (comboChecks.length) f.push(`Availability check needed for ${DAYN[dow]} pickup: ${comboChecks.map((b) => b.name).join(", ")}`);\n  if (hardBad.length) f.push(`${DAYN[dow]} is not a pickup day for ${hardBad.map((b) => b.name).join(", ")}`);\n  else if (!items.length && !s.days.includes(dow)) f.push(`${DAYN[dow]} is not a pickup day`);'''
if old not in t: raise SystemExit("guards pickup block not found")
p.write_text(t.replace(old, new, 1))

p = Path("src/agent.ts")
t = p.read_text()
old = '''    if (d.notes) out.push(`Note: ${d.notes}`);\n    if (flags.length) out.push(`Annapurna Home Foods needs to confirm this order first (${flags.join("; ").toLowerCase()}).`);\n    out.push("Reply YES to confirm, or tell me what to change.");'''
new = '''    if (d.notes) out.push(`Note: ${d.notes}`);\n    const availabilityCheck = flags.some((x) => x.startsWith("Availability check needed"));\n    if (availabilityCheck) out.push("Annapurna Home Foods will confirm availability for your requested pickup day before the order is confirmed.");\n    if (flags.length && !availabilityCheck) out.push(`Annapurna Home Foods needs to confirm this order first (${flags.join("; ").toLowerCase()}).`);\n    out.push(availabilityCheck ? "Reply YES to send this availability request, or tell me what to change." : "Reply YES to confirm, or tell me what to change.");'''
if old not in t: raise SystemExit("agent readback block not found")
p.write_text(t.replace(old, new, 1))

p = Path("src/server.ts")
t = p.read_text()
old = '''            // One availability status per dish. A single-day offer also shows its next date.\n            let label = days.length === 1 ? dayRange(days) : `Pickup ${dayRange(days)}`;\n            if (days.length === 1) label += ` · ${dayLabel(nextDateForDow(now(), s.tz, days[0]!)).replace(/^\\w+, /, "")}`;\n            if (!live) label = "Not running right now";\n            if (x.kind === "addon") label = "Add to any order";'''
new = '''            // Combo customers may ask for any day; the shop confirms off-schedule availability in chat.\n            let label = x.kind === "combo" ? "Ask us for your preferred pickup day" : days.length === 1 ? dayRange(days) : `Pickup ${dayRange(days)}`;\n            if (x.kind !== "combo" && days.length === 1) label += ` · ${dayLabel(nextDateForDow(now(), s.tz, days[0]!)).replace(/^\\w+, /, "")}`;\n            if (!live) label = "Not running right now";\n            if (x.kind === "addon") label = "Add to any order";'''
if old not in t: raise SystemExit("server availability block not found")
p.write_text(t.replace(old, new, 1))

p = Path("test/guards.test.ts")
t = p.read_text()
old = '''  assert.deepEqual(checkFlags(ok, "2026-09-26T12:00", s, NOW), ["Saturday is not a pickup day for A"]);\n  assert.deepEqual(checkFlags([{ ...ok[0]!, amt: null }], FRI_6PM, s, NOW), ["Price not set"]);'''
new = '''  assert.deepEqual(checkFlags(ok, "2026-09-26T12:00", s, NOW), ["Saturday is not a pickup day for A"]);\n  const combo = [{ id: "kheema_fry", name: "Chicken Kheema Fry combo", qty: 1, pack: "single" as const, amt: 18 }];\n  assert.deepEqual(checkFlags(combo, "2026-09-24T18:00", s, NOW, menu), ["Availability check needed for Thursday pickup: Chicken Kheema Fry combo"]);\n  assert.deepEqual(checkFlags([{ ...ok[0]!, amt: null }], FRI_6PM, s, NOW), ["Price not set"]);'''
if old not in t: raise SystemExit("guard test insertion point not found")
p.write_text(t.replace(old, new, 1))

print("combo-anyday tail applied")
