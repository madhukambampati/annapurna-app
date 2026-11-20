import { DatabaseSync } from "node:sqlite";
import { defaultMenu, defaultSettings, MENU_VERSION, upgradeMenu } from "./menu.js";
import type { Alert, Customer, Draft, MenuItem, Msg, Order, OrderItem, OrderStatus, Settings } from "./types.js";

export interface ReviewInvite {
  id: number; token: string; note: string; createdAt: number; expiresAt: number;
  /** When the most recent review came in through this link. */
  usedAt: number | null; revokedAt: number | null;
  /** How many reviews the link accepts (1 = one person) and how many it has taken. */
  maxUses: number; useCount: number;
}

type Row = Record<string, unknown>;

/** SQLite via node:sqlite. Pass ":memory:" in tests. */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS customers (
        wa_id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', profile TEXT NOT NULL DEFAULT '',
        uncertain_streak INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT NOT NULL, who TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_wa ON messages (wa_id, id);
      CREATE TABLE IF NOT EXISTS drafts (wa_id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT NOT NULL, name TEXT NOT NULL, items TEXT NOT NULL,
        pickup TEXT, flags TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT 'Annapurna guest',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden','deleted')),
        created_at INTEGER NOT NULL, owner_reply TEXT NOT NULL DEFAULT '', owner_reply_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS reviews_status ON reviews(status, id);
      CREATE TABLE IF NOT EXISTS review_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, revoked_at INTEGER,
        max_uses INTEGER NOT NULL DEFAULT 1, use_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT NOT NULL, cust TEXT NOT NULL, note TEXT NOT NULL,
        order_id INTEGER, done INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seen (message_id TEXT PRIMARY KEY, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS web_sessions (
        token_hash TEXT PRIMARY KEY, wa_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS web_sessions_wa ON web_sessions (wa_id);
    `);
    try {
      this.db.exec("ALTER TABLE customers ADD COLUMN contact TEXT NOT NULL DEFAULT ''");
    } catch {
      /* column already there */
    }
    try {
      this.db.exec("ALTER TABLE reviews ADD COLUMN owner_reply TEXT NOT NULL DEFAULT ''");
    } catch {
      /* owner reply column already exists */
    }
    try {
      this.db.exec("ALTER TABLE reviews ADD COLUMN owner_reply_at INTEGER");
    } catch {
      /* owner reply timestamp column already exists */
    }
    this.migrateReviewsForInvites();
    this.migrateGroupReviewLinks();
    this.migrateMenu();
    this.migrateWeekendSpecialSeed();
    this.seedOct2026WeekendClosure();
    this.initializeFreshVindhuOwnerChat();
  }

  /** Correct the first Weekend Special seed only if it is still exactly the old untouched draft. */
  private migrateWeekendSpecialSeed(): void {
    const key = "weekend_special_seed_v2";
    if (this.db.prepare("SELECT 1 FROM kv WHERE key = ?").get(key)) return;
    const s = this.getSettings();
    const w = s.weekendOffer;
    if (w && !w.active && w.title === "Weekend Specials" && w.label === "Only this weekend") {
      const ids = (w.items ?? []).map((x) => x.menuId).join(",");
      const prices = (w.items ?? []).map((x) => x.price).join(",");
      if (ids === "kobbari_annam_fry,bagara_chicken_fry,kheema_fry" && prices === "12,12,12") {
        w.title = "Weekend Special";
        w.items = [
          { menuId: "kobbari_annam_fry", price: 12 },
          { menuId: "bagara_chicken_fry", price: 12 },
          { menuId: "chicken_kheema_pulao", price: 12 },
        ];
        this.putSettings(s);
      }
    }
    this.kvPut(key, { at: Date.now() });
  }

  /**
   * One-time business-calendar seed requested for the Oct 23–25, 2026 closure.
   * It updates existing production settings once, so the deployed site immediately shows
   * Friday, Saturday and Sunday as closed. The owner can still reopen any date from Owner Desk.
   */
  private seedOct2026WeekendClosure(): void {
    const key = "store_status_seed_20261023_25_v1";
    if (this.db.prepare("SELECT 1 FROM kv WHERE key = ?").get(key)) return;
    const s = this.getSettings();
    s.dayOpen = {
      ...(s.dayOpen ?? {}),
      "2026-10-23": false,
      "2026-10-24": false,
      "2026-10-25": false,
    };
    this.putSettings(s);
    this.kvPut(key, { dates: ["2026-10-23", "2026-10-24", "2026-10-25"], at: Date.now() });
  }

  /**
   * One-time launch reset for the owner Chats inbox. Historical customer messages and
   * placed orders remain stored; owner Chats starts after the current highest message id.
   */
  private initializeFreshVindhuOwnerChat(): void {
    const key = "owner_chat_reset_vindhu_20260927";
    const done = this.db.prepare("SELECT 1 FROM kv WHERE key = ?").get(key);
    if (done) return;
    const r = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages").get() as Row;
    const afterMessageId = Number(r.id) || 0;
    this.db.exec(`
      DELETE FROM drafts;
      UPDATE alerts SET done = 1 WHERE order_id IS NULL;
      UPDATE customers SET profile = '', uncertain_streak = 0;
    `);
    this.kvPut(key, { afterMessageId, at: Date.now(), reason: "Fresh Vindhu owner chat launch" });
  }

  /** Owner Chats intentionally hide messages from before the fresh Vindhu launch. */
  ownerChatResetAfterMessageId(): number {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get("owner_chat_reset_vindhu_20260927") as Row | undefined;
    if (!r) return 0;
    try {
      const v = JSON.parse(String(r.json)) as { afterMessageId?: unknown };
      const n = Number(v.afterMessageId);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  /** Timestamp for owner dashboard metrics that should start fresh with the Vindhu launch. */
  ownerFreshLaunchAt(): number {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get("owner_chat_reset_vindhu_20260927") as Row | undefined;
    if (!r) return 0;
    try {
      const v = JSON.parse(String(r.json)) as { at?: unknown };
      const n = Number(v.at);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  /**
   * True when a customer explicitly deleted their chat. The legacy inference also hides chats
   * deleted before this marker existed, where later order lifecycle notes reconstructed a fake
   * status-only thread after the real conversation had been erased.
   */
  ownerChatDeleted(waId: string): boolean {
    const key = `owner_chat_deleted:${waId}`;
    if (this.db.prepare("SELECT 1 FROM kv WHERE key = ?").get(key)) return true;
    if (!waId.startsWith("web:")) return false;
    if (this.db.prepare("SELECT 1 FROM web_sessions WHERE wa_id = ? LIMIT 1").get(waId)) return false;
    const rows = this.db.prepare("SELECT who, text FROM messages WHERE wa_id = ? ORDER BY id").all(waId) as Row[];
    const hasOrder = !!this.db.prepare("SELECT 1 FROM orders WHERE wa_id = ? LIMIT 1").get(waId);
    if (!rows.length) return hasOrder;
    const lifecycleOnly = rows.every((r) => {
      if (String(r.who) !== "agent") return false;
      const text = String(r.text);
      return /^(?:Annapurna Home Foods confirmed your order #\d+|Order #\d+ has been cancelled|Sorry, order #\d+ has been cancelled|Your order #\d+ is ready for pickup|Thank you for your order)/i.test(text);
    });
    return hasOrder && lifecycleOnly;
  }

  /** One-time refresh of menu business rules when MENU_VERSION goes up. */
  private migrateMenu(): void {
    const v = this.kvGet<number>("menu_version", () => 0);
    if (v >= MENU_VERSION) return;
    const has = this.db.prepare("SELECT 1 FROM kv WHERE key = 'menu'").get();
    if (has) this.kvPut("menu", upgradeMenu(this.kvGet<MenuItem[]>("menu", defaultMenu), v));

    // Version 5 changes the old "weekday boxes are unpriced" note only when that exact legacy
    // sentence is still present. Any owner-written notes around it are preserved.
    if (v < 5) {
      const settings = this.getSettings();
      const legacy = "Single weekday boxes have no prices set here, so never quote a price for them. Annapurna Home Foods confirms those.";
      const replacement = "A single weekday of the Full Meal Plan is available for $18 per person. It includes that weekday's breakfast + lunch + dinner with rice. Other unpriced individual weekday components are not sold separately unless they are listed as menu items.";
      if (settings.notes.includes(legacy)) {
        settings.notes = settings.notes.replace(legacy, replacement);
        this.putSettings(settings);
      }
    }

    this.kvPut("menu_version", MENU_VERSION);
  }

  close(): void {
    this.db.close();
  }

  /* ----- settings and menu ----- */

  private kvGet<T>(key: string, fallback: () => T): T {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get(key) as Row | undefined;
    if (!r) {
      const v = fallback();
      this.kvPut(key, v);
      return v;
    }
    return JSON.parse(String(r.json)) as T;
  }

  private kvPut(key: string, v: unknown): void {
    this.db.prepare("INSERT INTO kv (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json").run(key, JSON.stringify(v));
  }

  getSettings(): Settings {
    return { ...defaultSettings(), ...this.kvGet<Partial<Settings>>("settings", defaultSettings) };
  }
  putSettings(s: Settings): void {
    this.kvPut("settings", s);
  }
  getMenu(): MenuItem[] {
    return this.kvGet<MenuItem[]>("menu", defaultMenu);
  }
  putMenu(m: MenuItem[]): void {
    this.kvPut("menu", m);
  }

  /* ----- customers and messages ----- */

  upsertCustomer(waId: string, name?: string, contact?: string): Customer {
    this.db.prepare("INSERT OR IGNORE INTO customers (wa_id, name, contact) VALUES (?, ?, ?)").run(waId, name ?? "", contact ?? "");
    if (name) this.db.prepare("UPDATE customers SET name = ? WHERE wa_id = ? AND name = ''").run(name, waId);
    return this.getCustomer(waId)!;
  }

  getCustomer(waId: string): Customer | undefined {
    const r = this.db.prepare("SELECT * FROM customers WHERE wa_id = ?").get(waId) as Row | undefined;
    if (!r) return undefined;
    return { waId, name: String(r.name), contact: String(r.contact ?? ""), profile: String(r.profile), uncertainStreak: Number(r.uncertain_streak) };
  }

  listCustomers(): Customer[] {
    const rows = this.db.prepare("SELECT wa_id FROM customers ORDER BY rowid").all() as Row[];
    return rows.map((r) => this.getCustomer(String(r.wa_id))!);
  }

  updateCustomer(waId: string, patch: Partial<Pick<Customer, "name" | "contact" | "profile" | "uncertainStreak">>): void {
    if (patch.contact !== undefined) this.db.prepare("UPDATE customers SET contact = ? WHERE wa_id = ?").run(patch.contact, waId);
    if (patch.name !== undefined) this.db.prepare("UPDATE customers SET name = ? WHERE wa_id = ?").run(patch.name, waId);
    if (patch.profile !== undefined) this.db.prepare("UPDATE customers SET profile = ? WHERE wa_id = ?").run(patch.profile, waId);
    if (patch.uncertainStreak !== undefined) this.db.prepare("UPDATE customers SET uncertain_streak = ? WHERE wa_id = ?").run(patch.uncertainStreak, waId);
  }

  addMessage(waId: string, who: Msg["who"], text: string, ts: number): number {
    // If a transport ever reuses the same customer id after deletion, a genuine new customer
    // message starts a new visible thread. System/order lifecycle notes never do this.
    if (who === "cust") this.db.prepare("DELETE FROM kv WHERE key = ?").run(`owner_chat_deleted:${waId}`);
    const r = this.db.prepare("INSERT INTO messages (wa_id, who, text, ts) VALUES (?, ?, ?, ?)").run(waId, who, text, ts);
    return Number(r.lastInsertRowid);
  }

  private msgFrom(r: Row): Msg {
    return { id: Number(r.id), who: r.who as Msg["who"], text: String(r.text), ts: Number(r.ts) };
  }

  getMessages(waId: string, limit = 40): Msg[] {
    const rows = this.db.prepare("SELECT id, who, text, ts FROM messages WHERE wa_id = ? ORDER BY id DESC LIMIT ?").all(waId, limit) as Row[];
    return rows.reverse().map((r) => this.msgFrom(r));
  }

  /** Messages newer than afterId, oldest first. */
  getMessagesAfter(waId: string, afterId: number, limit = 100): Msg[] {
    const rows = this.db.prepare("SELECT id, who, text, ts FROM messages WHERE wa_id = ? AND id > ? ORDER BY id LIMIT ?").all(waId, afterId, limit) as Row[];
    return rows.map((r) => this.msgFrom(r));
  }

  lastMessage(waId: string): Msg | undefined {
    const r = this.db.prepare("SELECT id, who, text, ts FROM messages WHERE wa_id = ? ORDER BY id DESC LIMIT 1").get(waId) as Row | undefined;
    return r ? this.msgFrom(r) : undefined;
  }

  /* ----- website sessions ----- */

  createWebSession(tokenHash: string, waId: string, now: number): void {
    this.db.prepare("INSERT INTO web_sessions (token_hash, wa_id, created_at, last_seen) VALUES (?, ?, ?, ?)").run(tokenHash, waId, now, now);
  }

  /** Returns the customer id for a live session and refreshes it, or undefined if unknown or expired. */
  findWebSession(tokenHash: string, now: number, maxAgeMs: number): string | undefined {
    const r = this.db.prepare("SELECT wa_id, last_seen FROM web_sessions WHERE token_hash = ?").get(tokenHash) as Row | undefined;
    if (!r) return undefined;
    if (now - Number(r.last_seen) > maxAgeMs) {
      this.db.prepare("DELETE FROM web_sessions WHERE token_hash = ?").run(tokenHash);
      return undefined;
    }
    this.db.prepare("UPDATE web_sessions SET last_seen = ? WHERE token_hash = ?").run(now, tokenHash);
    return String(r.wa_id);
  }

  /** Removes a customer's chat, draft and login. Placed orders stay: the kitchen needs them. */
  deleteCustomerChat(waId: string): void {
    this.db.prepare("DELETE FROM messages WHERE wa_id = ?").run(waId);
    this.db.prepare("DELETE FROM drafts WHERE wa_id = ?").run(waId);
    this.db.prepare("DELETE FROM web_sessions WHERE wa_id = ?").run(waId);
    // Persist a tombstone so later order-ready/thank-you lifecycle events cannot silently recreate
    // a misleading partial conversation in the owner's Chats list. Orders themselves remain intact.
    this.kvPut(`owner_chat_deleted:${waId}`, { at: Date.now() });
    // Chat-only work and cancellation requests should not survive a deleted customer chat.
    // Other order-linked safety alerts remain available to the kitchen.
    this.db.prepare("UPDATE alerts SET done = 1 WHERE wa_id = ? AND (order_id IS NULL OR note LIKE 'Cancellation requested%')").run(waId);
    this.db.prepare("UPDATE customers SET profile = '', uncertain_streak = 0 WHERE wa_id = ?").run(waId);
  }

  ordersFor(waId: string): Order[] {
    const rows = this.db.prepare("SELECT * FROM orders WHERE wa_id = ? ORDER BY id DESC LIMIT 20").all(waId) as Row[];
    return rows.map((r) => this.orderFrom(r));
  }

  /** True the first time a provider message id is seen. Use it to drop webhook retries. */
  markSeen(messageId: string, ts: number): boolean {
    const r = this.db.prepare("INSERT OR IGNORE INTO seen (message_id, ts) VALUES (?, ?)").run(messageId, ts);
    return Number(r.changes) > 0;
  }

  /* ----- drafts ----- */

  getDraft(waId: string): Draft | null {
    const r = this.db.prepare("SELECT json FROM drafts WHERE wa_id = ?").get(waId) as Row | undefined;
    return r ? (JSON.parse(String(r.json)) as Draft) : null;
  }
  putDraft(waId: string, d: Draft): void {
    this.db.prepare("INSERT INTO drafts (wa_id, json) VALUES (?, ?) ON CONFLICT(wa_id) DO UPDATE SET json = excluded.json").run(waId, JSON.stringify(d));
  }
  clearDraft(waId: string): void {
    this.db.prepare("DELETE FROM drafts WHERE wa_id = ?").run(waId);
  }

  /* ----- orders ----- */

  private orderFrom(r: Row): Order {
    return {
      id: Number(r.id),
      waId: String(r.wa_id),
      name: String(r.name),
      items: JSON.parse(String(r.items)) as OrderItem[],
      pickup: r.pickup == null ? null : String(r.pickup),
      flags: JSON.parse(String(r.flags)) as string[],
      status: r.status as OrderStatus,
      notes: String(r.notes),
      createdAt: Number(r.created_at),
    };
  }

  insertOrder(o: Omit<Order, "id">): Order {
    const r = this.db
      .prepare("INSERT INTO orders (wa_id, name, items, pickup, flags, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(o.waId, o.name, JSON.stringify(o.items), o.pickup, JSON.stringify(o.flags), o.status, o.notes, o.createdAt);
    return { ...o, id: Number(r.lastInsertRowid) };
  }

  getOrder(id: number): Order | undefined {
    const r = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Row | undefined;
    return r ? this.orderFrom(r) : undefined;
  }

  listOrders(status?: OrderStatus): Order[] {
    const rows = (status
      ? this.db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY id").all(status)
      : this.db.prepare("SELECT * FROM orders ORDER BY id").all()) as Row[];
    return rows.map((r) => this.orderFrom(r));
  }

  /** Orders of this customer that are still live: on hold, being cooked or ready. Newest first. */
  openOrdersFor(waId: string): Order[] {
    const rows = this.db.prepare("SELECT * FROM orders WHERE wa_id = ? AND status IN ('hold','cook','ready') ORDER BY id DESC").all(waId) as Row[];
    return rows.map((r) => this.orderFrom(r));
  }

  setOrderStatus(id: number, status: OrderStatus, clearFlags = false): Order | undefined {
    this.db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    if (clearFlags) this.db.prepare("UPDATE orders SET flags = '[]' WHERE id = ?").run(id);
    return this.getOrder(id);
  }

  /**
   * Reviews from owner-sent links have no website order, so order_id must allow NULL.
   * SQLite cannot relax NOT NULL in place: rebuild the table once, keeping every row and id.
   */
  private migrateReviewsForInvites(): void {
    const cols = this.db.prepare("PRAGMA table_info(reviews)").all() as Row[];
    if (cols.some((c) => c.name === "invite_id")) return;
    this.db.exec("BEGIN");
    try {
      this.db.exec(`
        CREATE TABLE reviews_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER UNIQUE REFERENCES orders(id),
          invite_id INTEGER REFERENCES review_invites(id),
          rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT 'Annapurna guest',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden','deleted')),
          created_at INTEGER NOT NULL, owner_reply TEXT NOT NULL DEFAULT '', owner_reply_at INTEGER,
          CHECK((order_id IS NULL) <> (invite_id IS NULL))
        );
        INSERT INTO reviews_v2 (id, order_id, rating, comment, display_name, status, created_at, owner_reply, owner_reply_at)
          SELECT id, order_id, rating, comment, display_name, status, created_at, owner_reply, owner_reply_at FROM reviews;
        DROP TABLE reviews;
        ALTER TABLE reviews_v2 RENAME TO reviews;
        CREATE INDEX IF NOT EXISTS reviews_status ON reviews(status, id);
      `);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * Group links: one link can take several reviews. Databases from the first review-link release
   * have invite_id UNIQUE on reviews and no counters on review_invites; fix both once, keeping every row.
   */
  private migrateGroupReviewLinks(): void {
    const inviteCols = this.db.prepare("PRAGMA table_info(review_invites)").all() as Row[];
    if (!inviteCols.some((c) => c.name === "max_uses")) {
      this.db.exec("ALTER TABLE review_invites ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1");
      this.db.exec("ALTER TABLE review_invites ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0");
      this.db.exec("UPDATE review_invites SET use_count = (SELECT COUNT(*) FROM reviews WHERE reviews.invite_id = review_invites.id)");
    }
    const sql = String((this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reviews'").get() as Row | undefined)?.sql ?? "");
    if (!/invite_id\s+INTEGER\s+UNIQUE/i.test(sql)) return;
    this.db.exec("BEGIN");
    try {
      this.db.exec(`
        CREATE TABLE reviews_v3 (
          id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER UNIQUE REFERENCES orders(id),
          invite_id INTEGER REFERENCES review_invites(id),
          rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT 'Annapurna guest',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden','deleted')),
          created_at INTEGER NOT NULL, owner_reply TEXT NOT NULL DEFAULT '', owner_reply_at INTEGER,
          CHECK((order_id IS NULL) <> (invite_id IS NULL))
        );
        INSERT INTO reviews_v3 (id, order_id, invite_id, rating, comment, display_name, status, created_at, owner_reply, owner_reply_at)
          SELECT id, order_id, invite_id, rating, comment, display_name, status, created_at, owner_reply, owner_reply_at FROM reviews;
        DROP TABLE reviews;
        ALTER TABLE reviews_v3 RENAME TO reviews;
        CREATE INDEX IF NOT EXISTS reviews_status ON reviews(status, id);
      `);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /* ----- review links: invitations the owner sends to past customers ----- */
  createReviewInvite(token: string, note: string, at: number, expiresAt: number, maxUses = 1): ReviewInvite {
    const r = this.db.prepare("INSERT INTO review_invites (token, note, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?)")
      .run(token, note, at, expiresAt, maxUses);
    return this.getReviewInviteById(Number(r.lastInsertRowid))!;
  }

  private inviteRow(r: Row | undefined): ReviewInvite | undefined {
    if (!r) return undefined;
    return { id: Number(r.id), token: String(r.token), note: String(r.note), createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at), usedAt: r.used_at == null ? null : Number(r.used_at),
      revokedAt: r.revoked_at == null ? null : Number(r.revoked_at),
      maxUses: Number(r.max_uses ?? 1), useCount: Number(r.use_count ?? 0) };
  }

  getReviewInviteById(id: number): ReviewInvite | undefined {
    return this.inviteRow(this.db.prepare("SELECT * FROM review_invites WHERE id = ?").get(id) as Row | undefined);
  }

  getReviewInvite(token: string): ReviewInvite | undefined {
    return this.inviteRow(this.db.prepare("SELECT * FROM review_invites WHERE token = ?").get(token) as Row | undefined);
  }

  listReviewInvites(limit = 200): ReviewInvite[] {
    return (this.db.prepare("SELECT * FROM review_invites ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map((r) => this.inviteRow(r)!);
  }

  /** Stops a link that can still take reviews. Reviews already received stay. */
  revokeReviewInvite(id: number, at: number): boolean {
    const r = this.db.prepare("UPDATE review_invites SET revoked_at = ? WHERE id = ? AND use_count < max_uses AND revoked_at IS NULL").run(at, id);
    return Number(r.changes) === 1;
  }

  /** Changes how many reviews a link accepts. Never below the reviews it already has; not for a stopped link. */
  setReviewInviteLimit(id: number, maxUses: number): boolean {
    const r = this.db.prepare("UPDATE review_invites SET max_uses = ? WHERE id = ? AND revoked_at IS NULL AND use_count <= ?").run(maxUses, id, maxUses);
    return Number(r.changes) === 1;
  }

  /** Counts the use and stores the review together: a link never takes more reviews than its limit. */
  submitInviteReview(token: string, rating: number, comment: string, displayName: string, at: number): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const used = this.db.prepare(`UPDATE review_invites SET used_at = ?, use_count = use_count + 1
        WHERE token = ? AND use_count < max_uses AND revoked_at IS NULL AND expires_at > ?`).run(at, token, at);
      if (Number(used.changes) !== 1) { this.db.exec("ROLLBACK"); return false; }
      this.db.prepare(`INSERT INTO reviews (invite_id, rating, comment, display_name, created_at)
        SELECT id, ?, ?, ?, ? FROM review_invites WHERE token = ?`).run(rating, comment, displayName, at, token);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /* Reviews deliberately contain no customer contact or session identifiers. */
  reviewForOrder(orderId: number): { status: string } | undefined {
    return this.db.prepare("SELECT status FROM reviews WHERE order_id = ?").get(orderId) as { status: string } | undefined;
  }

  submitReview(waId: string, orderId: number, rating: number, comment: string, displayName: string, at: number): boolean {
    // One atomic statement checks ownership, pickup and uniqueness, including deleted reviews.
    const r = this.db.prepare(`INSERT OR IGNORE INTO reviews (order_id, rating, comment, display_name, created_at)
      SELECT id, ?, ?, ?, ? FROM orders WHERE id = ? AND wa_id = ? AND status = 'done'`)
      .run(rating, comment, displayName, at, orderId, waId);
    return Number(r.changes) === 1;
  }

  listReviews(publicOnly = false) {
    const sel = "SELECT r.*, i.note AS invite_note FROM reviews r LEFT JOIN review_invites i ON i.id = r.invite_id";
    const rows = this.db.prepare(publicOnly
      ? `${sel} WHERE r.status = 'published' ORDER BY r.id DESC LIMIT 100`
      : `${sel} WHERE r.status != 'deleted' ORDER BY r.id DESC`).all() as Row[];
    return rows.map(r => ({ id: Number(r.id), orderId: r.order_id == null ? null : Number(r.order_id),
      source: (r.order_id == null ? "invite" : "order") as "invite" | "order",
      inviteNote: r.invite_note == null ? "" : String(r.invite_note), rating: Number(r.rating),
      comment: String(r.comment), displayName: String(r.display_name), status: String(r.status), createdAt: Number(r.created_at),
      ownerReply: String(r.owner_reply ?? ""), ownerReplyAt: r.owner_reply_at == null ? null : Number(r.owner_reply_at) }));
  }

  setReviewReply(id: number, reply: string, at: number | null): boolean {
    // Clearing an already-empty reply is a no-op and should report "not found" to the API.
    // SQLite may count a matched UPDATE even when the stored values are unchanged, so make
    // the state transition explicit in the WHERE clause for deletes.
    const sql = reply
      ? "UPDATE reviews SET owner_reply = ?, owner_reply_at = ? WHERE id = ? AND status != 'deleted'"
      : "UPDATE reviews SET owner_reply = '', owner_reply_at = NULL WHERE id = ? AND status != 'deleted' AND owner_reply != ''";
    const r = reply
      ? this.db.prepare(sql).run(reply, at, id)
      : this.db.prepare(sql).run(id);
    return Number(r.changes) === 1;
  }

  moderateReview(id: number, action: 'publish' | 'hide' | 'unpublish' | 'delete'): boolean {
    const status = { publish: 'published', hide: 'hidden', unpublish: 'pending', delete: 'deleted' }[action];
    const r = action === 'delete'
      ? this.db.prepare("UPDATE reviews SET status = 'deleted', comment = '', display_name = 'Annapurna guest', owner_reply = '', owner_reply_at = NULL WHERE id = ? AND status != 'deleted'").run(id)
      : this.db.prepare("UPDATE reviews SET status = ? WHERE id = ? AND status != 'deleted'").run(status, id);
    return Number(r.changes) === 1;
  }

  /* ----- alerts ----- */

  insertAlert(a: Omit<Alert, "id" | "done">): Alert {
    const r = this.db
      .prepare("INSERT INTO alerts (wa_id, cust, note, order_id, done, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .run(a.waId, a.cust, a.note, a.orderId, a.createdAt);
    return { ...a, id: Number(r.lastInsertRowid), done: false };
  }

  listAlerts(openOnly = false): Alert[] {
    const rows = this.db.prepare(`SELECT * FROM alerts ${openOnly ? "WHERE done = 0" : ""} ORDER BY id`).all() as Row[];
    return rows.map((r) => ({
      id: Number(r.id), waId: String(r.wa_id), cust: String(r.cust), note: String(r.note),
      orderId: r.order_id == null ? null : Number(r.order_id), done: Number(r.done) === 1, createdAt: Number(r.created_at),
    }));
  }

  /** The customer's open "talk to a person" request, if any. */
  openHandoff(waId: string): Alert | undefined {
    return this.listAlerts(true).find((a) => a.waId === waId && a.note.startsWith("Wants to talk to a person"));
  }

  /** The owner has replied in the chat, so open handoff requests from this customer are answered. */
  closeHandoffs(waId: string): void {
    this.db.prepare("UPDATE alerts SET done = 1 WHERE wa_id = ? AND done = 0 AND note LIKE 'Wants to talk to a person%'").run(waId);
  }

  /** A closed order cannot keep stale owner alerts open. */
  closeOrderAlerts(orderId: number): void {
    this.db.prepare("UPDATE alerts SET done = 1 WHERE order_id = ? AND done = 0").run(orderId);
  }

  markAlertDone(id: number): void {
    this.db.prepare("UPDATE alerts SET done = 1 WHERE id = ?").run(id);
  }
}
