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

  // desk edit after the upgrade must survive the next start
  s.single = 11;
  b.putMenu(menu);
  b.close();
  const c = new Store(path);
  assert.equal(c.getMenu().find((x) => x.id === "chicken_pulao_salan")!.single, 11);
  c.close();
});
