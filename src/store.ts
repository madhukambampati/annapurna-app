import { DatabaseSync } from "node:sqlite";
import { defaultMenu, defaultSettings, MENU_VERSION, upgradeMenu } from "./menu.js";
import type { Alert, Customer, Draft, MenuItem, Msg, Order, OrderItem, OrderStatus, Settings } from "./types.js";

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
    this.migrateMenu();
  }

  /** One-time refresh of combo names and prices when MENU_VERSION goes up. */
  private migrateMenu(): void {
    const v = this.kvGet<number>("menu_version", () => 0);
    if (v >= MENU_VERSION) return;
    const has = this.db.prepare("SELECT 1 FROM kv WHERE key = 'menu'").get();
    if (has) this.kvPut("menu", upgradeMenu(this.kvGet<MenuItem[]>("menu", defaultMenu)));
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

  markAlertDone(id: number): void {
    this.db.prepare("UPDATE alerts SET done = 1 WHERE id = ?").run(id);
  }
}
