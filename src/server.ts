import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Agent } from "./agent.js";
import type { Config } from "./config.js";
import { cookSummary } from "./cook.js";
import { RateLimiter } from "./limiter.js";
import { dayRange, itemDays, itemLabel, total } from "./menu.js";
import type { Store } from "./store.js";
import { DAYN, dayLabel, formatWhen, nextDateForDow } from "./time.js";
import type { MenuItem, Order, OrderStatus, Settings } from "./types.js";

const MAX_BODY = 100_000;
const MAX_DRAIN = 2_000_000;
const MAX_TEXT = 1000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  hold: ["cook", "cancelled"],
  cook: ["ready", "cancelled"],
  ready: ["done", "cook"],
  done: [],
  cancelled: [],
};

/** Only these files are ever served. Nothing is read from a path the client supplies. */
const ASSETS: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/desk": { file: "desk.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/desk.js": { file: "desk.js", type: "text/javascript; charset=utf-8" },
  "/manifest.webmanifest": { file: "manifest.webmanifest", type: "application/manifest+json" },
  "/icon.svg": { file: "icon.svg", type: "image/svg+xml" },
  "/icon-192.png": { file: "icon-192.png", type: "image/png" },
  "/icon-512.png": { file: "icon-512.png", type: "image/png" },
  "/apple-touch-icon.png": { file: "apple-touch-icon.png", type: "image/png" },
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) {
    super(message);
  }
}

function baseHeaders(req: IncomingMessage): Record<string, string> {
  const h: Record<string, string> = {
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
  };
  if (String(req.headers["x-forwarded-proto"] ?? "") === "https") h["strict-transport-security"] = "max-age=15552000";
  return h;
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...baseHeaders(req), "content-type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_DRAIN) {
      req.destroy();
      throw new HttpError(413, "Body too large");
    }
    // Past the limit keep reading (and discarding) so the client gets a clean 413 instead of a reset.
    if (size <= MAX_BODY) chunks.push(c as Buffer);
  }
  if (size > MAX_BODY) throw new HttpError(413, "Body too large");
  if (!chunks.length) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function num(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
}

/** A phone number (7+ digits) or something that looks like an email. */
export function validContact(c: string): boolean {
  if (c.length < 5 || c.length > 80) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return true;
  return /^[+()\-.\s\d]+$/.test(c) && c.replace(/\D/g, "").length >= 7;
}

export interface ServerDeps {
  agent: Agent;
  store: Store;
  cfg: Config;
  /** Test hook: serve these files instead of reading public/. Keys are file names. */
  assets?: Record<string, string>;
  now?: () => number;
  limiter?: RateLimiter;
}

export function createServer(d: ServerDeps): Server {
  const { agent, store, cfg } = d;
  const now = d.now ?? Date.now;
  const limiter = d.limiter ?? new RateLimiter(now);
  const w = cfg.web;
  const cache = new Map<string, Buffer | string>();

  const asset = (file: string): Buffer | string | undefined => {
    if (d.assets) return d.assets[file];
    if (cache.has(file)) return cache.get(file);
    try {
      const b = readFileSync(new URL(`../../public/${file}`, import.meta.url));
      cache.set(file, b);
      return b;
    } catch {
      return undefined;
    }
  };

  const clientIp = (req: IncomingMessage): string => {
    if (w.proxyHops > 0) {
      const parts = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const at = parts.length - w.proxyHops;
      if (at >= 0 && parts[at]) return parts[at]!;
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  const limit = (key: string, max: number, windowMs: number) => {
    const r = limiter.hit(key, max, windowMs);
    if (!r.ok) throw new HttpError(429, "Too many requests. Please slow down.", r.retryAfter);
  };

  const ownerAuth = (req: IncomingMessage) => {
    if (!cfg.ownerToken) return;
    const ip = clientIp(req);
    if (!limiter.peek(`authfail:${ip}`, 10)) throw new HttpError(429, "Too many failed attempts. Try again later.", 900);
    const given = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || String(req.headers["x-owner-token"] ?? "");
    if (!safeEqual(given, cfg.ownerToken)) {
      limiter.hit(`authfail:${ip}`, 10, 15 * 60_000);
      throw new HttpError(401, "Owner token required");
    }
  };

  const webSession = (req: IncomingMessage): string => {
    const tok = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!tok || tok.length > 200) throw new HttpError(401, "Please start a new chat.");
    const waId = store.findWebSession(sha(tok), now(), w.sessionDays * DAY);
    if (!waId) throw new HttpError(401, "Your chat expired. Please start a new one.");
    return waId;
  };

  const orderNote = (o: Order, from: OrderStatus, to: OrderStatus, s: Settings, reason = ""): string | null => {
    if (to === "cancelled" && reason) return `Sorry, order #${o.id} has been cancelled.\n${reason}`;
    if (from === "hold" && to === "cook") return `Annapurna Home Foods confirmed your order #${o.id}. Pickup ${formatWhen(o.pickup)} at ${s.address}.`;
    if (to === "cancelled") return `Order #${o.id} has been cancelled by Annapurna Home Foods. We may write to you here about it.`;
    if (to === "ready") return `Your order #${o.id} is ready for pickup at ${s.address}.`;
    return null;
  };

  const thanksNote = (o: Order, s: Settings): string => {
    const first = (o.name || "").trim().split(/\s+/)[0];
    const lines = [`Thank you for your order${first && first !== "Customer" ? `, ${first}` : ""}! Enjoy your food.`];
    if (s.contactInstagram) lines.push("We'd love your feedback on Instagram. Please follow our page too:", `instagram.com/${s.contactInstagram}`);
    else lines.push("We'd love to hear how you liked it. Just reply here.");
    return lines.join("\n");
  };

  return httpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname;
      const m = req.method ?? "GET";

      if (m === "GET" && path === "/health") return send(req, res, 200, { ok: true });

      /* ----- static files (fixed allowlist) ----- */
      const a = m === "GET" ? ASSETS[path] : undefined;
      if (a) {
        if (path === "/" && !w.enabled) throw new HttpError(404, "Not found");
        const body = asset(a.file);
        if (body === undefined) throw new HttpError(404, "Not found");
        res.writeHead(200, { ...baseHeaders(req), "content-type": a.type, "cache-control": path.endsWith(".png") || path.endsWith(".svg") ? "public, max-age=86400" : "no-cache" });
        return void res.end(body);
      }

      /* ----- customer website ----- */
      if (path.startsWith("/web/")) {
        if (!w.enabled) throw new HttpError(404, "Not found");
        const ip = clientIp(req);

        if (m === "GET" && path === "/web/menu") {
          limit(`menu:${ip}`, 60, 60_000);
          const s = store.getSettings();
          const items = store.getMenu().map((x, i) => {
            const live = x.kind === "combo" ? x.live : true;
            const days = itemDays(x, s);
            // One availability status per dish. A single-day offer also shows its next date.
            let label = days.length === 1 ? dayRange(days) : `Pickup ${dayRange(days)}`;
            if (days.length === 1) label += ` · ${dayLabel(nextDateForDow(now(), s.tz, days[0]!)).replace(/^\w+, /, "")}`;
            if (!live) label = "Not running right now";
            if (x.kind === "addon") label = "Add to any order";
            return {
              no: i + 1, id: x.id, name: x.name, kind: x.kind, single: x.single, bogo: x.bogo, plan: x.plan, unit: x.unit,
              desc: /price not set yet|please add/i.test(x.desc ?? "") ? "" : x.desc,
              live, availability: label,
            };
          });
          return send(req, res, 200, {
            items, weekly: s.weeklyMenu.split("\n").map((l) => l.trim()).filter(Boolean), pickupDays: s.days.map((n) => DAYN[n]), noticeHrs: s.noticeHrs,
            address: s.address, contact: { instagram: s.contactInstagram, phone: s.contactPhone },
          });
        }

        if (m === "POST" && path === "/web/session") {
          limit(`sess:${ip}`, w.sessionsPerIpHour, HOUR);
          const b = await readJson(req);
          const name = cleanText(b.name, 60);
          const contact = cleanText(b.contact, 80);
          if (!name) throw new HttpError(400, "Please enter your name.");
          if (!validContact(contact)) throw new HttpError(400, "Please enter a phone number or email so Annapurna Home Foods can reach you.");
          if (b.consent !== true) throw new HttpError(400, "Please tick the box to continue.");
          const waId = `web:${randomBytes(8).toString("hex")}`;
          const token = randomBytes(24).toString("base64url");
          store.upsertCustomer(waId, name, contact);
          store.createWebSession(sha(token), waId, now());
          return send(req, res, 200, { token, name });
        }

        if (m === "POST" && path === "/web/message") {
          const waId = webSession(req);
          limit(`ip:${ip}`, 120, 60_000);
          const b = await readJson(req);
          const text = typeof b.text === "string" ? b.text.trim() : "";
          if (!text) throw new HttpError(400, "Message is empty.");
          if (text.length > MAX_TEXT) throw new HttpError(400, `Message is too long (max ${MAX_TEXT} characters).`);
          limit(`min:${waId}`, w.msgPerMinute, 60_000);
          limit(`day:${waId}`, w.msgPerDay, DAY);
          const g = limiter.hit("global-day", w.globalPerDay, DAY);
          if (!g.ok) throw new HttpError(503, "Our ordering assistant is very busy right now. Please try again later.", g.retryAfter);
          const before = store.lastMessage(waId)?.id ?? 0;
          const c = store.getCustomer(waId)!;
          const out = await agent.handle({ from: waId, name: c.name, text });
          return send(req, res, 200, { messages: store.getMessagesAfter(waId, before), orderId: out.orderId ?? null });
        }

        if (m === "GET" && path === "/web/history") {
          const waId = webSession(req);
          limit(`poll:${waId}`, 60, 60_000);
          const after = Math.max(0, Math.floor(Number(url.searchParams.get("after") ?? 0)) || 0);
          const c = store.getCustomer(waId);
          const h = store.openHandoff(waId);
          return send(req, res, 200, { messages: store.getMessagesAfter(waId, after), name: c?.name ?? "", handoff: h ? { at: h.createdAt } : null });
        }

        if (m === "POST" && path === "/web/handoff") {
          const waId = webSession(req);
          limit(`ip:${ip}`, 120, 60_000);
          limit(`handoff:${waId}`, 5, HOUR);
          const c = store.getCustomer(waId)!;
          const s = store.getSettings();
          const before = store.lastMessage(waId)?.id ?? 0;
          const { created, alert } = await agent.requestHuman(waId, c.name || "Customer", "Pressed the Talk to a person button");
          store.addMessage(waId, "agent", agent.handoffReply(created, alert, s), now());
          return send(req, res, 200, { messages: store.getMessagesAfter(waId, before), handoff: { at: alert.createdAt } });
        }

        if (m === "GET" && path === "/web/orders") {
          const waId = webSession(req);
          limit(`poll:${waId}`, 60, 60_000);
          const s = store.getSettings();
          const orders = store.ordersFor(waId).map((o) => ({
            id: o.id, status: o.status, pickup: o.pickup, pickupText: formatWhen(o.pickup), items: o.items.map(itemLabel), total: total(o.items), address: s.address,
          }));
          return send(req, res, 200, { orders });
        }

        if (m === "DELETE" && path === "/web/me") {
          const waId = webSession(req);
          store.deleteCustomerChat(waId);
          return send(req, res, 200, { ok: true });
        }
        throw new HttpError(404, "Not found");
      }

      /* ----- developer simulator (no login, keep off on a public server) ----- */
      if (path.startsWith("/sim/")) {
        if (!cfg.simulator) throw new HttpError(404, "Simulator is off");
        if (m === "POST" && path === "/sim/message") {
          const b = await readJson(req);
          const from = typeof b.from === "string" ? b.from.trim().slice(0, 40) : "";
          const text = typeof b.text === "string" ? b.text : "";
          if (!from || !text.trim()) throw new HttpError(400, "from and text are required");
          const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 60) : undefined;
          const o = await agent.handle({ from, name, text });
          return send(req, res, 200, { replies: o.replies, route: o.route, orderId: o.orderId ?? null, issues: o.issues, judged: o.judgment ?? null });
        }
        if (m === "GET" && path === "/sim/history") {
          const from = url.searchParams.get("from") ?? "";
          return send(req, res, 200, { messages: from ? store.getMessages(from, 100) : [] });
        }
        throw new HttpError(404, "Not found");
      }

      /* ----- owner console ----- */
      if (path.startsWith("/api/")) {
        ownerAuth(req);
        if (m === "GET" && path === "/api/state") {
          const customers = store
            .listCustomers()
            .map((c) => ({ waId: c.waId, name: c.name, contact: c.contact, last: store.lastMessage(c.waId) ?? null }))
            .filter((c) => c.last)
            .sort((x, y) => y.last!.id - x.last!.id)
            .slice(0, 100);
          const contactOf = (waId: string) => store.getCustomer(waId)?.contact ?? "";
          return send(req, res, 200, {
            orders: store.listOrders().map((o) => ({ ...o, contact: contactOf(o.waId) })),
            alerts: store.listAlerts().map((a) => ({ ...a, contact: contactOf(a.waId) })),
            menu: store.getMenu(), settings: store.getSettings(),
            customers, features: { simulator: cfg.simulator, web: w.enabled },
          });
        }
        if (m === "GET" && path === "/api/whoami") {
          // Lets you check that rate limits see each visitor's real IP behind your host's proxy.
          return send(req, res, 200, {
            ip: clientIp(req),
            proxyHops: w.proxyHops,
            forwardedFor: String(req.headers["x-forwarded-for"] ?? ""),
            flyClientIp: String(req.headers["fly-client-ip"] ?? ""),
            socket: req.socket.remoteAddress ?? "",
          });
        }
        if (m === "GET" && path === "/api/cook") {
          return send(req, res, 200, cookSummary(store.listOrders(), store.getMenu(), url.searchParams.get("date") ?? undefined));
        }
        let mt = /^\/api\/customers\/([^/]{1,80})\/(messages|reply)$/.exec(path);
        if (mt) {
          let waId = "";
          try {
            waId = decodeURIComponent(mt[1]!);
          } catch {
            throw new HttpError(400, "Bad customer id");
          }
          const c = store.getCustomer(waId);
          if (!c) throw new HttpError(404, "No such customer");
          if (m === "GET" && mt[2] === "messages") return send(req, res, 200, { customer: { waId, name: c.name, contact: c.contact }, messages: store.getMessages(waId, 200) });
          if (m === "POST" && mt[2] === "reply") {
            const text = cleanText((await readJson(req)).text, MAX_TEXT);
            if (!text) throw new HttpError(400, "Reply is empty");
            const id = store.addMessage(waId, "owner", text, now());
            store.closeHandoffs(waId);
            return send(req, res, 200, { message: { id, who: "owner", text, ts: now() } });
          }
        }
        mt = /^\/api\/orders\/(\d+)\/status$/.exec(path);
        if (m === "POST" && mt) {
          const o = store.getOrder(Number(mt[1]));
          if (!o) throw new HttpError(404, "No such order");
          const body = await readJson(req);
          const to = body.status as OrderStatus;
          // The owner can say why an order is cancelled. It goes to the customer with the cancel message.
          const reason = to === "cancelled" ? cleanText(body.reason, 300) : "";
          if (!ALLOWED[o.status]?.includes(to)) throw new HttpError(400, `Cannot move an order from ${o.status} to ${String(to)}`);
          const updated = store.setOrderStatus(o.id, to, o.status === "hold" && to === "cook");
          const s = store.getSettings();
          const note = orderNote(o, o.status, to, s, reason);
          if (note) store.addMessage(o.waId, "owner", note, now());
          // After pickup the assistant thanks the customer and asks for feedback, once per order.
          if (to === "done" && o.status !== "done") store.addMessage(o.waId, "agent", thanksNote(o, s), now());
          return send(req, res, 200, { order: updated });
        }
        mt = /^\/api\/alerts\/(\d+)\/done$/.exec(path);
        if (m === "POST" && mt) {
          store.markAlertDone(Number(mt[1]));
          return send(req, res, 200, { ok: true });
        }
        mt = /^\/api\/menu\/([\w-]+)$/.exec(path);
        if (m === "PATCH" && mt) {
          const b = await readJson(req);
          const menu = store.getMenu();
          const it = menu.find((x) => x.id === mt![1]);
          if (!it) throw new HttpError(404, "No such menu item");
          for (const f of ["single", "bogo", "plan"] as const) {
            if (f in b) {
              const v = num(b[f]);
              if (v === undefined) throw new HttpError(400, `${f} must be a number or null`);
              it[f] = v;
              it.verify = false;
            }
          }
          if (typeof b.live === "boolean") it.live = b.live;
          if (typeof b.verify === "boolean") it.verify = b.verify;
          if (typeof b.desc === "string") it.desc = b.desc.slice(0, 500);
          if (typeof b.recipe === "string") it.recipe = b.recipe.slice(0, 2000);
          if (Array.isArray(b.days)) {
            const d = [...new Set(b.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
            if (d.length) it.days = d;
            else delete it.days;
          }
          if (Array.isArray(b.aliases)) it.aliases = b.aliases.filter((x): x is string => typeof x === "string").slice(0, 12);
          store.putMenu(menu as MenuItem[]);
          return send(req, res, 200, { item: it });
        }
        if (m === "PUT" && path === "/api/settings") {
          const b = await readJson(req);
          const s: Settings = { ...store.getSettings() };
          const n = num(b.noticeHrs);
          if (n !== undefined && n !== null) s.noticeHrs = n;
          if (typeof b.address === "string" && b.address.trim()) s.address = b.address.trim().slice(0, 200);
          if (Array.isArray(b.days)) s.days = [...new Set(b.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
          if (typeof b.notes === "string") s.notes = b.notes.slice(0, 6000);
          if (typeof b.weeklyMenu === "string") s.weeklyMenu = b.weeklyMenu.slice(0, 3000);
          if (Array.isArray(b.comboDays)) s.comboDays = [...new Set(b.comboDays.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
          if (typeof b.contactInstagram === "string") s.contactInstagram = b.contactInstagram.trim().replace(/^@/, "").replace(/[^\w.]/g, "").slice(0, 40);
          if (typeof b.contactPhone === "string") s.contactPhone = b.contactPhone.replace(/[^\d+()\-\s.]/g, "").trim().slice(0, 30);
          store.putSettings(s);
          return send(req, res, 200, { settings: s });
        }
        throw new HttpError(404, "Not found");
      }
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError) {
        return send(req, res, e.status, { error: e.message }, e.retryAfter ? { "retry-after": String(e.retryAfter) } : {});
      }
      console.error(e);
      send(req, res, 500, { error: "Internal error" });
    }
  });
}
