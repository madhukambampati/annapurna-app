import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { defaultMenu } from "../src/menu.js";

test("default menu matches the posters", () => {
  const m = new Map(defaultMenu().map((x) => [x.id, x]));
  const p = (id: string) => [m.get(id)!.single, m.get(id)!.bogo];
  assert.deepEqual(p("kheema_fry"), [18, 28]);
  assert.deepEqual(p("gongura_kheema_pulao"), [13, 24]);
  assert.deepEqual(p("fry_piece_pulao"), [17, 25]);
  assert.deepEqual(p("bagara_chicken_fry"), [15, 22]);
  assert.deepEqual(p("kobbari_annam_fry"), [15, 22]);
  assert.deepEqual(p("chicken_pulao_salan"), [10, 18]);
  assert.deepEqual(p("chicken_kheema_pulao"), [12, 22]);
  assert.equal(m.get("sunday_bogo_special")!.live, false);
  assert.equal(m.get("plan_full")!.plan, 90);
});

test("an old stored menu is upgraded once and keeps live/recipe choices", () => {
  const dir = mkdtempSync(join(tmpdir(), "menu-"));
  const path = join(dir, "t.db");
  const a = new Store(path);
  // pretend this is the old deployment: old prices, menu_version missing
  const old = defaultMenu().filter((x) => x.id !== "kobbari_annam_fry");
  const salan = old.find((x) => x.id === "chicken_pulao_salan")!;
  salan.single = 15; salan.bogo = 22; salan.live = false; salan.recipe = "my recipe";
  const sun = old.find((x) => x.id === "sunday_bogo_special")!;
  delete sun.days;
  sun.desc = "One-day offer. Available only this Sunday.";
  a.putMenu(old);
  (a as unknown as { db: { exec(s: string): void } }).db.exec("DELETE FROM kv WHERE key = 'menu_version'");
  a.close();

  const b = new Store(path);
  const menu = b.getMenu();
  const s = menu.find((x) => x.id === "chicken_pulao_salan")!;
  assert.deepEqual([s.single, s.bogo], [10, 18]);
  assert.equal(s.live, false);
  assert.equal(s.recipe, "my recipe");
  assert.ok(menu.find((x) => x.id === "kobbari_annam_fry"));
  assert.deepEqual(menu.find((x) => x.id === "sunday_bogo_special")!.days, [0], "the Sunday special is Sunday-only after the upgrade");
  assert.doesNotMatch(menu.find((x) => x.id === "sunday_bogo_special")!.desc, /only this Sunday/i);

  // desk edit after the upgrade must survive the next start
  s.single = 11;
  b.putMenu(menu);
  b.close();
  const c = new Store(path);
  assert.equal(c.getMenu().find((x) => x.id === "chicken_pulao_salan")!.single, 11);
  c.close();
});

import { optionPicks, optionNo } from "../src/menu.js";

test("option numbers: 'option 5', '#2', 'no 3' map to the dish in menu order", () => {
  const menu = defaultMenu();
  assert.equal(optionNo(menu, "kheema_fry"), 1);
  assert.equal(optionNo(menu, "gongura_kheema_pulao"), 2);
  assert.equal(optionPicks("I want to go with option 5", menu, null)[0]!.item!.id, menu[4]!.id);
  assert.deepEqual(optionPicks("#2 and option 3 please", menu, null).map((p) => p.item!.id), ["gongura_kheema_pulao", "fry_piece_pulao"]);
  assert.equal(optionPicks("no 3", menu, null)[0]!.no, 3);
  assert.equal(optionPicks("option 40", menu, null)[0]!.item, undefined, "a number past the menu is reported, not guessed");
  assert.deepEqual(optionPicks("no onion please", menu, null), []);
  assert.deepEqual(optionPicks("2 chicken kheema fry combos", menu, null), [], "a quantity is not an option");
});

test("option numbers: a bare '5' counts only right after a numbered list", () => {
  const menu = defaultMenu();
  const list = "Here are our weekend combos:\n1. Chicken Kheema Fry combo - $18\n5. Chicken Pulao - $10\nWhich one?";
  assert.equal(optionPicks("5", menu, list)[0]!.no, 5);
  assert.deepEqual(optionPicks("5", menu, "How many would you like?"), []);
  assert.deepEqual(optionPicks("5", menu, null), []);
  assert.deepEqual(optionPicks("1 and 5", menu, list).map((p) => p.no), [1, 5]);
});

import { upgradeMenu, extrasMenu } from "../src/menu.js";

test("extras: on the default menu with the owner's prices", () => {
  const m = new Map(defaultMenu().map((x) => [x.id, x]));
  assert.deepEqual(["extra_chicken_fry", "extra_chicken_kheema", "extra_kheema_fry", "extra_salan", "extra_raita", "extra_onion_lemon"].map((id) => m.get(id)!.single), [8, 8, 10, 1, 1, 1]);
  assert.ok(extrasMenu().every((x) => x.kind === "addon"));
});

test("upgrade from version 3 adds extras but keeps combo prices changed on the desk", () => {
  const stored = defaultMenu().filter((x) => x.kind !== "addon").map((x) => (x.id === "kheema_fry" ? { ...x, single: 19 } : x));
  const up = upgradeMenu(stored, 3);
  assert.equal(up.find((x) => x.id === "kheema_fry")!.single, 19);
  assert.equal(up.find((x) => x.id === "extra_kheema_fry")!.single, 10);
  const again = upgradeMenu(up.map((x) => (x.id === "extra_raita" ? { ...x, single: 2 } : x)), 3);
  assert.equal(again.find((x) => x.id === "extra_raita")!.single, 2, "an extra's price set on the desk is kept");
  assert.equal(again.filter((x) => x.id === "extra_raita").length, 1);
});
