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


test("an existing database keeps its reviews when review links are added, and a link gives exactly one review", () => {
  const dir = mkdtempSync(join(tmpdir(), "annapurna-review-migrate-"));
  const path = join(dir, "old.db");
  let store: Store | undefined;
  try {
    // The reviews table exactly as production had it before review links.
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT NOT NULL, name TEXT NOT NULL, items TEXT NOT NULL,
        pickup TEXT, flags TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
      CREATE TABLE reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT 'Annapurna guest',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden','deleted')),
        created_at INTEGER NOT NULL, owner_reply TEXT NOT NULL DEFAULT '', owner_reply_at INTEGER);
      INSERT INTO orders (wa_id, name, items, flags, status, created_at) VALUES ('web:p', 'Priyanka', '[]', '[]', 'done', 1);
      INSERT INTO reviews (id, order_id, rating, comment, display_name, status, created_at, owner_reply, owner_reply_at)
        VALUES (7, 1, 5, 'Excellent breakfast meal plan!', 'Priyanka', 'published', 2, 'Thank you!', 3);
    `);
    old.close();

    store = new Store(path);
    const kept = store.listReviews(true);
    assert.equal(kept.length, 1);
    assert.deepEqual([kept[0]!.id, kept[0]!.orderId, kept[0]!.source, kept[0]!.comment, kept[0]!.ownerReply],
      [7, 1, "order", "Excellent breakfast meal plan!", "Thank you!"]);
    assert.equal(store.submitReview("web:p", 1, 4, "again", "Priyanka", 4), false, "still one review per order");

    const inv = store.createReviewInvite("t".repeat(24), "Lakshmi", 10, 100);
    assert.equal(store.submitInviteReview(inv.token, 5, "Lovely", "Lakshmi", 99), true);
    assert.equal(store.submitInviteReview(inv.token, 5, "Again", "Lakshmi", 99), false, "a link works once");
    const late = store.createReviewInvite("u".repeat(24), "Ravi", 10, 50);
    assert.equal(store.submitInviteReview(late.token, 5, "Late", "Ravi", 50), false, "expired at expiresAt");
    store.close();

    store = new Store(path); // reopening does not migrate again or lose anything
    assert.deepEqual(store.listReviews().map((r) => [r.source, r.displayName]), [["invite", "Lakshmi"], ["order", "Priyanka"]]);
    assert.equal(store.getReviewInvite(inv.token)!.usedAt, 99);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
