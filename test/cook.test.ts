import assert from "node:assert/strict";
import { test } from "node:test";
import { cookSummary, fmtAmt, parseRecipe } from "../src/cook.js";
import { defaultMenu } from "../src/menu.js";
import type { Order } from "../src/types.js";

const item = (id: string, name: string, qty: number, pack: "single" | "bogo" | "plan") => ({ id, name, qty, pack, amt: 1 });
const order = (id: number, name: string, pickup: string, items: Order["items"], status: Order["status"] = "cook"): Order => ({
  id, waId: "w" + id, name, items, pickup, flags: [], status, notes: "", createdAt: 0,
});

test("parseRecipe reads 'name | amount | unit' lines and skips junk", () => {
  assert.deepEqual(parseRecipe("Chicken | 250 | g\nOnion | 1.5 | pcs\nbad line\nSalt | x | g\n\nOil | 0 | ml"), [
    { name: "Chicken", amt: 250, unit: "g" },
    { name: "Onion", amt: 1.5, unit: "pcs" },
  ]);
});

test("fmtAmt switches grams to kg", () => {
  assert.equal(fmtAmt(750, "g"), "750 g");
  assert.equal(fmtAmt(2500, "g"), "2.5 kg");
});

test("cook list groups by pickup day, counts BOGO as two meals, ignores non-cook orders", () => {
  const menu = defaultMenu();
  menu.find((m) => m.id === "kheema_fry")!.recipe = "Chicken | 250 | g\nRice | 300 | g";
  const orders = [
    order(1, "Asha", "2026-09-25T18:00", [item("kheema_fry", "Chicken Kheema Fry combo", 2, "bogo")]),
    order(2, "Ravi", "2026-09-25T19:00", [item("kheema_fry", "Chicken Kheema Fry combo", 1, "single"), item("plan_full", "Full meal plan", 2, "plan")]),
    order(3, "Held", "2026-09-25T19:00", [item("kheema_fry", "Chicken Kheema Fry combo", 9, "single")], "hold"),
    order(4, "Done", "2026-09-24T19:00", [item("kheema_fry", "Chicken Kheema Fry combo", 9, "single")], "done"),
    order(5, "Sat", "2026-09-28T12:00", [item("kheema_fry", "Chicken Kheema Fry combo", 1, "single")]),
  ];
  const s = cookSummary(orders, menu);
  assert.deepEqual(s.days.map((d) => d.date), ["2026-09-25", "2026-09-28"]);
  const fri = s.days[0]!;
  assert.equal(fri.label, "Friday, September 25");
  const kh = fri.dishes.find((d) => d.name.startsWith("Chicken Kheema"))!;
  assert.equal(kh.qty, 2 * 2 + 1); // 2 BOGO deals = 4 meals, plus 1 single
  assert.deepEqual(kh.who.sort(), ["Asha", "Ravi"]);
  assert.equal(fri.dishes.find((d) => d.plan)!.qty, 2);
  // 5 meals on Fri + 1 on Mon = 6 x 250 g chicken = 1.5 kg
  assert.equal(s.buy.find((b) => b.name === "Chicken")!.text, "Chicken: 1.5 kg");
  assert.equal(s.buy.find((b) => b.name === "Rice")!.text, "Rice: 1.8 kg");
  assert.deepEqual(s.missingRecipe, ["Full meal plan"]);
  // filtering by date
  assert.equal(cookSummary(orders, menu, "2026-09-28").days.length, 1);
});
