import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/store.js";

test("reviews persist across SQLite restarts; deletion erases content but preserves one-review-per-order", () => {
  const dir = mkdtempSync(join(tmpdir(), "annapurna-review-test-"));
  const path = join(dir, "existing.db");
  let store: Store | undefined;
  try {
    store = new Store(path);
    const order = store.insertOrder({ waId: "web:test", name: "Private Full Name", items: [], pickup: null,
      flags: [], status: "done", notes: "", createdAt: 1 });
    assert.equal(store.submitReview("web:other", order.id, 5, "Great!", "Asha", 2), false);
    assert.equal(store.submitReview("web:test", order.id, 5, "Great!", "Asha", 2), true);
    const id = store.listReviews()[0]!.id;
    store.moderateReview(id, "publish");
    store.close();
    store = new Store(path);
    assert.equal(store.listReviews(true)[0]!.comment, "Great!");
    assert.equal(store.getOrder(order.id)!.name, "Private Full Name");
    store.moderateReview(id, "delete");
    store.close();
    store = new Store(path);
    assert.equal(store.submitReview("web:test", order.id, 4, "Again", "Asha", 3), false);
    assert.deepEqual(store.listReviews(), []);
    const db = new DatabaseSync(path);
    try {
      const row = db.prepare("SELECT comment, display_name, status FROM reviews WHERE id = ?").get(id)!;
      assert.equal(row.comment, "");
      assert.equal(row.display_name, "Annapurna guest");
      assert.equal(row.status, "deleted");
    } finally { db.close(); }
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
