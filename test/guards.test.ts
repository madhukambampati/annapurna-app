import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFlags, checkWeekday, draftHash, resolveItem, sanitizeItems } from "../src/guards.js";
import { defaultMenu, defaultSettings } from "../src/menu.js";
import { FRI_6PM, NOW, TZ } from "./helpers.js";
import { localToEpoch } from "../src/time.js";

const menu = defaultMenu();

test("regression: asked for Bagara rice and chicken fry, model wrote kheema fry -> corrected", () => {
  const r = resolveItem("Bagara rice and chicken fry", "kheema_fry", menu);
  assert.deepEqual(r, { ok: true, id: "bagara_chicken_fry", corrected: true });
});

test("exact names resolve to themselves", () => {
  for (const m of menu) assert.deepEqual(resolveItem(m.name, m.id, menu), { ok: true, id: m.id, corrected: false }, m.name);
});

test("aliases and spelling variants resolve", () => {
  assert.equal((resolveItem("keema fry", "kheema_fry", menu) as { id: string }).id, "kheema_fry");
  assert.equal((resolveItem("chicken kheema pulav", "chicken_kheema_pulao", menu) as { id: string }).id, "chicken_kheema_pulao");
  assert.equal((resolveItem("chicken kheema pulao", "chicken_kheema_pulao", menu) as { ok: boolean }).ok, true);
  assert.equal((resolveItem("gongura chicken kheema pulao", "gongura_kheema_pulao", menu) as { id: string }).id, "gongura_kheema_pulao");
  assert.equal((resolveItem("bagara rice", "bagara_chicken_fry", menu) as { id: string }).id, "bagara_chicken_fry");
  assert.equal((resolveItem("breakfast plan", "plan_breakfast", menu) as { id: string }).id, "plan_breakfast");
  assert.equal((resolveItem("full meal plan", "plan_full", menu) as { id: string }).id, "plan_full");
});

test("ambiguous wording is not guessed: customer gets asked", () => {
  const r = resolveItem("chicken pulao", "chicken_pulao_salan", menu);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "unclear");
    assert.ok(r.candidates.length >= 2, "should offer the close matches");
  }
  const r2 = resolveItem("chicken fry", "kheema_fry", menu);
  assert.equal(r2.ok, false);
});

test("a dish that is not on the menu is rejected, never swapped for something similar", () => {
  const r = resolveItem("paneer tikka masala", "kheema_fry", menu);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unknown");
});

test("Telugu script cannot be matched, so the model's pick is trusted if the id exists", () => {
  assert.deepEqual(resolveItem("కీమా ఫ్రై", "kheema_fry", menu), { ok: true, id: "kheema_fry", corrected: false });
  assert.equal(resolveItem("కీమా ఫ్రై", "made_up_id", menu).ok, false);
});

test("sanitizeItems: prices, pack rules, merging, bounds", () => {
  const s = sanitizeItems(
    [
      { id: "kheema_fry", qty: 2, pack: "bogo", asked_for: "2 kheema fry buy 1 get 1" },
      { id: "kheema_fry", qty: 1, pack: "bogo", asked_for: "kheema fry" },
      { id: "plan_full", qty: 2, pack: "single", asked_for: "full meal plan" }, // plans are always plan pack
      { id: "kheema_fry", qty: 0 }, // dropped
      { id: "kheema_fry", qty: 500 }, // dropped
      { id: "nope", qty: 1 }, // unknown id, no asked_for
      null,
    ],
    menu,
  );
  assert.equal(s.items.length, 2);
  const k = s.items.find((i) => i.id === "kheema_fry")!;
  assert.deepEqual([k.qty, k.pack, k.amt], [3, "bogo", 84]); // 3 deals x $28
  const p = s.items.find((i) => i.id === "plan_full")!;
  assert.deepEqual([p.qty, p.pack, p.amt], [2, "plan", 180]);
  assert.equal(s.issues.filter((i) => i.kind === "unclear_item").length, 1);
});

test("a bogo pack on a plan or a single item is coerced, not trusted", () => {
  const s = sanitizeItems([{ id: "plan_bc", qty: 1, pack: "bogo", asked_for: "breakfast and curries plan" }], menu);
  assert.equal(s.items[0]!.pack, "plan");
});

test("combos that are switched off never reach the draft", () => {
  const m = defaultMenu();
  m.find((x) => x.id === "kheema_fry")!.live = false;
  const s = sanitizeItems([{ id: "kheema_fry", qty: 1, pack: "single", asked_for: "chicken kheema fry" }], m);
  assert.equal(s.items.length, 0);
  assert.deepEqual(s.issues, [{ kind: "not_live", name: "Chicken Kheema Fry combo" }]);
});

test("items with no price stay in the draft with amt null", () => {
  const m = defaultMenu();
  m.find((x) => x.id === "bagara_chicken_fry")!.single = null;
  const s = sanitizeItems([{ id: "bagara_chicken_fry", qty: 1, pack: "single", asked_for: "bagara rice and chicken fry" }], m);
  assert.equal(s.items[0]!.amt, null);
});

test("checkWeekday catches a wrong-weekday pickup", () => {
  // Wednesday noon. Customer says Friday, model produced Thursday.
  const bad = checkWeekday("pickup friday 6pm", "2026-09-24T18:00", NOW, TZ);
  assert.deepEqual(bad, { kind: "weekday_mismatch", said: "Friday", suggestion: "2026-09-25" });
  assert.equal(checkWeekday("pickup friday 6pm", FRI_6PM, NOW, TZ), null);
  assert.equal(checkWeekday("tomorrow 6pm", "2026-09-24T18:00", NOW, TZ), null); // no weekday named
  assert.equal(checkWeekday("friday or saturday", "2026-09-24T18:00", NOW, TZ), null); // two named, don't guess
});

test("checkFlags: notice, past, non-pickup day, missing price, missing time", () => {
  const s = defaultSettings();
  const ok = [{ id: "a", name: "A", qty: 1, pack: "single" as const, amt: 10 }];
  assert.deepEqual(checkFlags(ok, FRI_6PM, s, NOW), []);
  assert.deepEqual(checkFlags(ok, null, s, NOW), ["No pickup time"]);
  assert.deepEqual(checkFlags(ok, "garbage", s, NOW), ["Pickup time unclear"]);
  assert.deepEqual(checkFlags(ok, "2026-09-23T12:59", s, NOW), ["Under 2h notice"]);
  assert.deepEqual(checkFlags(ok, "2026-09-23T11:00", s, NOW), ["Pickup in the past"]);
  assert.deepEqual(checkFlags(ok, "2026-09-26T12:00", s, NOW), ["Saturday is not a pickup day"]);
  assert.deepEqual(checkFlags([{ ...ok[0]!, amt: null }], FRI_6PM, s, NOW), ["Price not set"]);
  // exactly at the notice limit is fine
  assert.deepEqual(checkFlags(ok, "2026-09-23T14:00", s, NOW), []);
});

test("checkFlags uses the kitchen timezone, not the server's", () => {
  const s = defaultSettings();
  const ok = [{ id: "a", name: "A", qty: 1, pack: "single" as const, amt: 10 }];
  // Friday 23:30 Toronto is already Saturday in UTC. It must still count as Friday.
  const late = localToEpoch("2026-09-25T20:00", TZ);
  assert.deepEqual(checkFlags(ok, "2026-09-25T23:30", s, late), []);
});

test("draftHash changes when items, time or notes change, not when item order changes", () => {
  const a = { id: "x", name: "X", qty: 1, pack: "single" as const, amt: 1 };
  const b = { id: "y", name: "Y", qty: 2, pack: "bogo" as const, amt: 2 };
  const base = { items: [a, b], pickup_local: FRI_6PM, notes: "" };
  assert.equal(draftHash(base), draftHash({ ...base, items: [b, a] }));
  assert.notEqual(draftHash(base), draftHash({ ...base, items: [{ ...a, qty: 2 }, b] }));
  assert.notEqual(draftHash(base), draftHash({ ...base, pickup_local: "2026-09-25T19:00" }));
  assert.notEqual(draftHash(base), draftHash({ ...base, notes: "less spicy" }));
});
