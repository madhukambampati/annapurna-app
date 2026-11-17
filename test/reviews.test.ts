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


test("a database from the first review-link release upgrades to group links without losing anything", () => {
  const dir = mkdtempSync(join(tmpdir(), "annapurna-review-group-"));
  const path = join(dir, "v2.db");
  let store: Store | undefined;
  try {
    // Exactly what production has after the first review-link deploy: a used one-time link and its review.
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT NOT NULL, name TEXT NOT NULL, items TEXT NOT NULL,
        pickup TEXT, flags TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
      CREATE TABLE review_invites (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, revoked_at INTEGER);
      CREATE TABLE reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER UNIQUE REFERENCES orders(id),
        invite_id INTEGER UNIQUE REFERENCES review_invites(id),
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT 'Annapurna guest',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden','deleted')),
        created_at INTEGER NOT NULL, owner_reply TEXT NOT NULL DEFAULT '', owner_reply_at INTEGER,
        CHECK((order_id IS NULL) <> (invite_id IS NULL)));
      INSERT INTO orders (wa_id, name, items, flags, status, created_at) VALUES ('web:p', 'Priyanka', '[]', '[]', 'done', 1);
      INSERT INTO reviews (id, order_id, rating, comment, display_name, status, created_at) VALUES (3, 1, 5, 'Excellent!', 'Priyanka', 'published', 2);
      INSERT INTO review_invites (id, token, note, created_at, expires_at, used_at) VALUES (1, '${"g".repeat(24)}', '', 10, 1000, 20);
      INSERT INTO reviews (id, invite_id, rating, comment, display_name, status, created_at) VALUES (4, 1, 5, 'Tasty', 'Shashi', 'pending', 20);
    `);
    old.close();

    store = new Store(path);
    const link = store.getReviewInvite("g".repeat(24))!;
    assert.deepEqual([link.maxUses, link.useCount], [1, 1], "the used link counts its one review");
    assert.equal(store.submitInviteReview(link.token, 5, "Me too", "Surendra", 30), false, "still full until the owner opens it up");
    assert.equal(store.setReviewInviteLimit(link.id, 26), true);
    assert.equal(store.submitInviteReview(link.token, 5, "Me too", "Surendra", 30), true, "the same link now takes more reviews");
    assert.deepEqual(store.listReviews().map((r) => [r.id, r.displayName]), [[5, "Surendra"], [4, "Shashi"], [3, "Priyanka"]]);
    store.close();
    store = new Store(path); // reopening changes nothing
    assert.equal(store.getReviewInvite("g".repeat(24))!.useCount, 2);
    assert.equal(store.listReviews(true)[0]!.comment, "Excellent!");
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
