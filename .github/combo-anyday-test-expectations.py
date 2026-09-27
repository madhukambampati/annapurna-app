from pathlib import Path

# Agent regression expectations now reflect availability-check semantics for off-schedule combo requests.
p = Path("test/agent.test.ts")
t = p.read_text()
old = '''test("a non-pickup day puts the order on hold", async () => {
  const t = setup({ judge: yesJudge });
  await orderAndReadBack(t, [KHEEMA_BOGO], "2026-09-28T12:00", "2 kheema fry combos monday at noon"); // Monday, not a combo day
  await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.deepEqual([o.status, o.flags], ["hold", ["Monday is not a pickup day for Chicken Kheema Fry combo"]]);
});'''
new = '''test("an off-schedule combo day becomes an owner availability check", async () => {
  const t = setup({ judge: yesJudge });
  const r = await orderAndReadBack(t, [KHEEMA_BOGO], "2026-09-28T12:00", "2 kheema fry combos monday at noon");
  assert.match(r.replies[0]!, /confirm availability for your requested pickup day/);
  assert.match(r.replies[0]!, /Reply YES to send this availability request/);
  await t.say("yes");
  const o = t.store.listOrders()[0]!;
  assert.deepEqual([o.status, o.flags], ["hold", ["Availability check needed for Monday pickup: Chicken Kheema Fry combo"]]);
});'''
if old not in t: raise SystemExit("agent off-schedule test block not found")
t = t.replace(old, new, 1)
old = '''  assert.match(t.llm.prompts[0]!, /never say it is impossible/);
  assert.match(t.llm.prompts[0]!, /"pickup_days":\["Friday","Saturday","Sunday"\]/);'''
new = '''  assert.match(t.llm.prompts[0]!, /combo customers may request any day/);
  assert.match(t.llm.prompts[0]!, /"pickup_days":"customer may request any day; Annapurna confirms availability when needed"/);
  assert.match(t.llm.prompts[0]!, /"usual_pickup_days":\["Friday","Saturday","Sunday"\]/);'''
if old not in t: raise SystemExit("agent combo prompt expectations not found")
t = t.replace(old, new, 1)
p.write_text(t)

# Web menu should advertise a request/confirmation flow for combos, not a Fri-Sun hard restriction.
p = Path("test/web.test.ts")
t = p.read_text()
old = '''  test("every dish shows exactly one availability status; the Sunday special is off, and shows its date when on", () =>
    withRig(async ({ t, call }) => {
      const m = (await call("GET", "/web/menu")).json;
      const by = (id: string) => m.items.find((x: any) => x.id === id);
      assert.equal(by("sunday_bogo_special").live, false);
      assert.equal(by("sunday_bogo_special").availability, "Not running right now");
      assert.doesNotMatch(by("sunday_bogo_special").desc, /only this Sunday|Available only/i);
      assert.equal(by("kheema_fry").availability, "Pickup Fri to Sun");
      assert.equal(by("plan_full").availability, "Pickup Mon to Fri");
      const menu = t.store.getMenu();
      menu.find((x) => x.id === "sunday_bogo_special")!.live = true;
      t.store.putMenu(menu);
      const on = (await call("GET", "/web/menu")).json.items.find((x: any) => x.id === "sunday_bogo_special");
      assert.match(on.availability, /^Sunday only · September 27$/);
      assert.deepEqual(m.contact, { instagram: "annapurna_hometaste", phone: "" });
    }));'''
new = '''  test("combo menu asks for the preferred pickup day while switched-off specials stay unavailable", () =>
    withRig(async ({ t, call }) => {
      const m = (await call("GET", "/web/menu")).json;
      const by = (id: string) => m.items.find((x: any) => x.id === id);
      assert.equal(by("sunday_bogo_special").live, false);
      assert.equal(by("sunday_bogo_special").availability, "Not running right now");
      assert.doesNotMatch(by("sunday_bogo_special").desc, /only this Sunday|Available only/i);
      assert.equal(by("kheema_fry").availability, "Ask us for your preferred pickup day");
      assert.equal(by("plan_full").availability, "Pickup Mon to Fri");
      const menu = t.store.getMenu();
      menu.find((x) => x.id === "sunday_bogo_special")!.live = true;
      t.store.putMenu(menu);
      const on = (await call("GET", "/web/menu")).json.items.find((x: any) => x.id === "sunday_bogo_special");
      assert.equal(on.availability, "Ask us for your preferred pickup day");
      assert.deepEqual(m.contact, { instagram: "annapurna_hometaste", phone: "" });
    }));'''
if old not in t: raise SystemExit("web availability test block not found")
t = t.replace(old, new, 1)
p.write_text(t)

print("combo-anyday test expectations updated")
