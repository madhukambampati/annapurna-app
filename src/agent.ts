import type { Config } from "./config.js";
import { clearCustomQuote, customQuoteIsCurrent, customTermsKey } from "./custom.js";
import { checkFlags, checkWeekday, draftHash, extrasOnly, friendlyName, mainOrderFor, sanitizeItems, tokens, type Issue } from "./guards.js";
import { HeuristicJudge, type Judge, type Judgment } from "./judge.js";
import { LlmError, type Llm } from "./llm.js";
import { findItem, itemLabel, lineAmt, money, total, optionPicks } from "./menu.js";
import type { Notifier } from "./notify.js";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt.js";
import { route as decideRoute, type Route } from "./router.js";
import type { Store } from "./store.js";
import { dayLabel, formatWhen, isLocalIso, nextDateForDow, pad, zonedParts } from "./time.js";
import type { Alert, Draft, MenuItem, Order, Settings, Stage } from "./types.js";

/**
 * The turn loop. Code owns the control flow:
 *   1. TypeSafe judges what the customer's message is (intent, cancel, yes).
 *   2. route() decides the path from those judgments.
 *   3. Claude writes replies and proposes an order draft, but only for ordinary turns.
 *   4. Code checks every proposed item, date and price, builds the read-back itself,
 *      and is the only thing that can place, hold or cancel an order.
 */

export interface AgentDeps {
  store: Store;
  judge: Judge;
  llm: Llm;
  notifier: Notifier;
  cfg: Config;
  now?: () => number;
}

export interface Inbound {
  /** Customer id. Website chats use "web:<random>"; a future WhatsApp adapter would use the phone number. */
  from: string;
  name?: string;
  text: string;
  /** Provider message id. Used to drop duplicate webhook deliveries. */
  messageId?: string;
}

export interface Outcome {
  replies: string[];
  route: string;
  orderId?: number;
  alertIds: number[];
  issues: string[];
  judgment?: Judgment;
}

const MAX_TEXT = 1000;

const ADD_MORE = /\b(another|again|second|one more|extra|also|additional|add|more)\b/i;

/** Thanks and short acknowledgements never change an order. */
const THANKS = /^(thanks|thank you|thank u|thankyou|thx|ty|tq|many thanks|thanks a lot|thank you so much|great|perfect|awesome|cool|nice|noted|got it|super|superb|ok thanks|okay thanks|ok thank you|okay thank you)[\s!.]*$/i;
/** A bare yes or ok. Only ignored when there is nothing in progress to say yes to. */
const BARE_OK = /^(yes|yep|yeah|yup|y|ya|ok|okay|k|sure|done|fine|alright)[\s!.]*$/i;
/** Natural acknowledgements while a custom order is waiting on owner/customer confirmation. */
const CUSTOM_ACK = /^(?:(?:ok(?:ay)?|got it)[,\s.!]*)*(?:thanks|thank you|thank u|thx)[\s!.]*$/i;
/** The customer wants a real person, a phone number or the Instagram page. */
const HUMAN = /\b(real (person|human)|human being|a human|(talk|speak|chat) (to|with) (a |the |an )?(person|human|someone|somebody|owner|maddy|team|staff|agent)|contact (you|us|number|info|details)|phone( number)?|your number|call me|call you|instagram|insta|whatsapp|customer (service|support))\b/i;
/** Text sent by the web app's "Yes, place order" button. */
const CONFIRM_BUTTON = /^yes, confirm$/i;
/** Owner-managed catering/bulk orders. A headcount alone counts as custom only at 8+ people. */
const CUSTOM_RECIPE_WORDS = /\b(custom recipe|customi[sz](?:e|ed|ation)|modified recipe)\b/i;
const CUSTOM_WORDS = /\b(cater(?:ing)?|bulk|party order|large order|full tray|half tray|medium tray|large tray|custom recipe|customi[sz](?:e|ed|ation)|modified recipe)\b/i;
const CUSTOM_HEADCOUNT = /\b(\d{1,3})\s*(?:people|persons|pax|members|guests)\b/i;
const CUSTOM_CONFIRM = /(?:^yes\b|^go\s+ahead\b|\bconfirm(?:ing|ed)?\s+(?:(?:the|my)\s+)?order\b|\bplace\s+(?:(?:the|my)\s+)?order\b)/i;
/** Explicitly abandoning an unplaced custom/bulk request must destroy every bit of its draft state. */
const CUSTOM_ABANDON = /(?:\bnever\s*mind\b|\bnevermind\b|\bforget\s+(?:it|that|the\s+(?:bulk|custom|catering|tray)(?:\s+(?:one|order|request))?)\b|\b(?:cancel|drop|skip)\s+(?:the\s+)?(?:bulk|custom|catering|tray)(?:\s+(?:one|order|request))?\b|\b(?:don\'?t|do not|no longer)\s+want\s+(?:the\s+)?(?:bulk|custom|catering|tray)\b)/i;
/** Explicit reset of the current unplaced draft. Placed orders are never touched. */
const DRAFT_RESET = /\b(?:forget\s+everything\s+before\s+this|start\s+over|reset\s+(?:this|the|my)?\s*order|fresh\s+order)\b/i;
const CUSTOMER_CUSTOM_PRICE = /(?:\$\s*\d{1,5}(?:\.\d{1,2})?|\b\d{1,5}(?:\.\d{1,2})?\s*(?:\$|cad)\b)/i;
const PLACEMENT_CLAIM = /\b(?:order\s+(?:is\s+|has\s+been\s+|was\s+)?(?:confirm(?:ed|ing)|placed|booked)|(?:confirm(?:ed|ing)|placed|booked)\s+(?:this|it|the\s+order|your\s+order)|(?:this|it|that|the\s+order|your\s+order)\s+(?:went|has\s+gone|is\s+going)\s+through|(?:went|gone|going)\s+through|successfully\s+(?:placed|confirmed|booked)|lock(?:ing|ed)?\s+(?:this|it|the order)\s+in)\b/i;
const PLACED_ORDER_CHANGE = /\b(?:change|modify|cancel|update|edit|replace)\b/i;
const EXPLICIT_PLACED_ORDER_TARGET = /\b(?:order\s*#\s*\d+|order\s+#?\d+|confirmed\s+order|placed\s+order|existing\s+order)\b/i;

/** Legacy/model custom alerts that belong to a pending catering request, not a placed order. */
function isCustomWorkAlert(note: string): boolean {
  if (/^Custom\/bulk request(?: updated)?:/i.test(note)) return true;
  const headcount = /\b\d{1,3}\s*(?:people|persons|pax|members|guests)\b/i.test(note);
  const customWork = /\b(?:quote|price|cater(?:ing)?|bulk|custom|tray)\b/i.test(note);
  return headcount && customWork;
}

/** A headcount edit belongs to the active unplaced catering draft unless a real placed order is named. */
function pendingCustomHeadcountChange(text: string, draft: Draft | null): number | null {
  if (!draft?.custom || !PLACED_ORDER_CHANGE.test(text) || EXPLICIT_PLACED_ORDER_TARGET.test(text)) return null;
  return customHeadcount(text);
}

function customHeadcount(text: string): number | null {
  const m = CUSTOM_HEADCOUNT.exec(text);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n < 500 ? n : null;
}

function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bulkMenuQuantity(text: string, menu: MenuItem[]): number | null {
  for (const it of menu) {
    const base = it.name.replace(/\s+combo$/i, "").trim();
    const words = base.split(/\s+/).map(reEscape).join("\\s+");
    // Do not read a menu price such as "$17 Gongura ..." as quantity 17.
    // A bulk quantity must start the string or be preceded by a non-word, non-currency character.
    const m = new RegExp(`(?:^|[^\\w$])(\\d{1,3})\\s+(?:x\\s+)?${words}\\b`, "i").exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 8 && n < 500) return n;
  }
  return null;
}

function looksCustom(text: string, menu: MenuItem[] = []): boolean {
  if (CUSTOM_WORDS.test(text)) return true;
  const m = CUSTOM_HEADCOUNT.exec(text);
  if (m && Number(m[1]) >= 8) return true;
  return !!bulkMenuQuantity(text, menu);
}

/** Only the failure-prone forms bypass Claude: large explicit menu quantities and recipe modifications. */
function deterministicCustomStart(text: string, menu: MenuItem[]): boolean {
  return CUSTOM_RECIPE_WORDS.test(text) || bulkMenuQuantity(text, menu) != null;
}

/** A clearly unrelated normal menu order can safely replace a stale custom draft. */
function clearlyNormalMenuOrder(text: string, menu: MenuItem[]): boolean {
  if (looksCustom(text, menu) || CUSTOM_CONFIRM.test(text)) return false;
  const orderSignal = /^\s*\d+\b/.test(text) || /\b(?:order|want|need|would like|add|get me|give me|take)\b/i.test(text);
  if (!orderSignal) return false;
  const tt = tokens(text);
  return menu.some((it) => {
    const mt = tokens(it.name.replace(/\s+combo$/i, ""));
    return mt.size > 0 && [...mt].every((t) => tt.has(t));
  });
}

function requestedSwitchedOffCombo(text: string, menu: MenuItem[]): MenuItem | null {
  const said = tokens(text);
  if (!said.size) return null;
  let best: { item: MenuItem; specificity: number } | null = null;
  for (const item of menu) {
    if (item.kind !== "combo" || item.live) continue;
    for (const label of [item.name, ...item.aliases]) {
      const want = tokens(label);
      if (want.size < 2 || ![...want].every((t) => said.has(t))) continue;
      if (!best || want.size > best.specificity) best = { item, specificity: want.size };
    }
  }
  return best?.item ?? null;
}

function deterministicFreshMenuItem(text: string, menu: MenuItem[]): MenuItem | null {
  const said = tokens(text);
  if (!said.size) return null;
  const matches: Array<{ item: MenuItem; specificity: number }> = [];
  for (const item of menu) {
    if (item.kind === "addon" || (item.kind === "combo" && !item.live)) continue;
    let best = 0;
    for (const label of [item.name, ...item.aliases]) {
      const want = tokens(label.replace(/\s+combo$/i, ""));
      if (want.size < 2 || ![...want].every((t) => said.has(t))) continue;
      best = Math.max(best, want.size);
    }
    if (best) matches.push({ item, specificity: best });
  }
  matches.sort((a, b) => b.specificity - a.specificity || b.item.name.length - a.item.name.length);
  if (!matches.length) return null;
  if (matches[1] && matches[1].specificity === matches[0]!.specificity) return null;
  return matches[0]!.item;
}

function deterministicFreshQuantity(text: string, item: MenuItem): number | null {
  if (item.kind === "plan") {
    const people = customHeadcount(text);
    if (people != null && people < 100) return people;
  }
  const direct = /^\s*(\d{1,2})\b/.exec(text)
    ?? /\b(?:order|want|need|would\s+like|get\s+me|give\s+me|take)\s+(\d{1,2})\b/i.exec(text);
  const qty = direct ? Number(direct[1]) : 1;
  return qty > 0 && qty < 100 ? qty : null;
}

function deterministicFreshDraft(text: string, menu: MenuItem[], now: number, settings: Settings, customerName: string | null): Draft | null {
  if (looksCustom(text, menu)) return null;
  const said = tokens(text);
  const mentionsAddon = menu.some((candidate) => candidate.kind === "addon" && [candidate.name, ...candidate.aliases].some((label) => {
    const want = tokens(label);
    return want.size >= 2 && [...want].every((t) => said.has(t));
  }));
  if (mentionsAddon) return null;
  const item = deterministicFreshMenuItem(text, menu);
  if (!item) return null;
  const qty = deterministicFreshQuantity(text, item);
  const pickup = simpleCustomPickup(text, now, settings.tz);
  if (!qty || !pickup) return null;
  const wantsBogo = /\b(?:bogo|buy\s*1\s*get\s*1|buy\s+one\s+get\s+one)\b/i.test(text);
  const pack = item.kind === "plan" ? "plan" : item.kind === "combo" && wantsBogo ? "bogo" : "single";
  if (pack === "bogo" && item.bogo == null) return null;
  const orderItem = { id: item.id, name: item.name, qty, pack, amt: lineAmt(menu, { id: item.id, qty, pack }) } as Draft["items"][number];
  const draft: Draft = {
    items: [orderItem],
    pickup_local: pickup,
    customer_name: customerName,
    notes: "",
    readback_hash: null,
    stage: "awaiting_confirmation",
  };
  draft.readback_hash = draftHash(draft);
  return draft;
}

function deterministicCustomItems(text: string, menu: MenuItem[]): Draft["items"] {
  const tt = tokens(text);
  const qty = customHeadcount(text) ?? bulkMenuQuantity(text, menu) ?? 1;
  const matches = menu.filter((it) => {
    const mt = tokens(it.name.replace(/\s+combo$/i, ""));
    return mt.size > 0 && [...mt].every((t) => tt.has(t));
  }).sort((a, b) => b.name.length - a.name.length);
  const m = matches[0];
  return m ? [{ id: m.id, name: m.name, qty, pack: "single", amt: null }] : [];
}

/** If a reset message also contains a replacement order, return only that fresh-order part. */
function resetRemainder(text: string): string {
  const fresh = /\bfresh\s+order\s*:\s*(.+)$/i.exec(text);
  if (fresh?.[1]?.trim()) return fresh[1].trim();
  const swap = /\b(?:instead|just)\b[\s,:-]*(.+)$/i.exec(text);
  if (swap?.[1]?.trim()) return swap[1].trim();
  const sentence = /^[^.!?]*[.!?]+\s*(.+)$/.exec(text);
  return sentence?.[1]?.trim() ?? "";
}

function parseClock(text: string): { h: number; mi: number } | null {
  const special = /\b(noon|midnight)\b/i.exec(text);
  if (special) return { h: special[1]!.toLowerCase() === "noon" ? 12 : 0, mi: 0 };
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? "0");
  if (h < 1 || h > 12 || mi < 0 || mi > 59) return null;
  const ap = m[3]!.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { h, mi };
}

/** Common custom pickup replies should not depend on an LLM call, including weekday noon/midnight. */
function simpleCustomPickup(text: string, now: number, tz: string): string | null {
  const clock = parseClock(text);
  if (!clock) return null;
  const p = zonedParts(now, tz);
  // An explicit calendar date wins over a weekday. This prevents "Saturday Oct 3" from
  // being collapsed to the nearest Saturday (for example Sep 26).
  const md = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i.exec(text);
  if (md) {
    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
    const key = md[1]!.toLowerCase().slice(0, md[1]!.toLowerCase().startsWith("sept") ? 4 : 3);
    const mo = months[key]!;
    const day = Number(md[2]);
    let y = md[3] ? Number(md[3]) : p.y;
    if (!md[3] && (mo < p.m || (mo === p.m && day < p.d))) y += 1;
    const check = new Date(Date.UTC(y, mo - 1, day));
    if (check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === day) {
      return `${y}-${pad(mo)}-${pad(day)}T${pad(clock.h)}:${pad(clock.mi)}`;
    }
  }
  const rel = /\b(today|tomorrow)\b/i.exec(text);
  let d: Date;
  if (rel) {
    const add = rel[1]!.toLowerCase() === "tomorrow" ? 1 : 0;
    d = new Date(Date.UTC(p.y, p.m - 1, p.d + add));
  } else {
    const wk = /\b(?:(this|next)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.exec(text);
    if (!wk) return null;
    const days: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const iso = nextDateForDow(now, tz, days[wk[2]!.slice(0, 3).toLowerCase()]!);
    d = new Date(`${iso}T00:00:00Z`);
    if (wk[1]?.toLowerCase() === "next") d.setUTCDate(d.getUTCDate() + 7);
  }
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(clock.h)}:${pad(clock.mi)}`;
}

export const HANDOFF_NOTE = "Wants to talk to a person";

/** Identity of an order for duplicate checks: what is ordered and when it is picked up. */
function orderKey(items: Array<{ id: string; qty: number; pack: string }>, pickup: string | null): string {
  return JSON.stringify(items.map((i) => `${i.id}:${i.pack}:${i.qty}`).sort()) + "|" + (pickup ?? "");
}

export class Agent {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly heuristic = new HeuristicJudge();

  constructor(private readonly d: AgentDeps) {}

  private now(): number {
    return (this.d.now ?? Date.now)();
  }

  /** Messages from one customer are handled one at a time, in order. */
  handle(msg: Inbound): Promise<Outcome> {
    const prev = this.locks.get(msg.from) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(() => this.process(msg));
    this.locks.set(msg.from, run);
    void run.finally(() => {
      if (this.locks.get(msg.from) === run) this.locks.delete(msg.from);
    }).catch(() => undefined);
    return run;
  }

  private async process(msg: Inbound): Promise<Outcome> {
    const { store, cfg } = this.d;
    const out: Outcome = { replies: [], route: "", alertIds: [], issues: [] };
    let text = msg.text.trim().slice(0, MAX_TEXT);
    if (!text) return { ...out, route: "empty" };
    if (msg.messageId && !store.markSeen(msg.messageId, this.now())) return { ...out, route: "duplicate" };

    const now = this.now();
    const settings = store.getSettings();
    const menu = store.getMenu();
    let customer = store.upsertCustomer(msg.from, msg.name);
    const before = store.getMessages(msg.from, 40);
    const lastShop = [...before].reverse().find((m) => m.who === "agent" || m.who === "owner")?.text ?? null;
    store.addMessage(msg.from, "cust", text, now);

    let draft = store.getDraft(msg.from);
    const open = store.openOrdersFor(msg.from);
    let freshResetContext = false;

    // Important: only the active draft decides whether an order is custom.
    // Do not infer custom/catering state from older chat history: customers often place a normal
    // menu order after a catering order in the same conversation.

    // A pending draft can be reset without deleting the whole chat. If the same message also
    // contains a replacement order, continue processing only that fresh-order part in this turn.
    const abandoningCustom = !!draft?.custom && CUSTOM_ABANDON.test(text);
    const resettingDraft = DRAFT_RESET.test(text);
    if (abandoningCustom || resettingDraft) {
      const hadDraft = !!draft;
      const wasCustom = !!draft?.custom;
      const hadQuote = draft?.custom?.price != null;
      const remainder = resetRemainder(text);
      freshResetContext = resettingDraft && !!remainder;
      store.clearDraft(msg.from);
      if (wasCustom) {
        for (const a of store.listAlerts(true)) {
          if (a.waId === msg.from && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);
        }
        await this.d.notifier.notify(
          "Custom/bulk request withdrawn",
          `${customer.name || msg.name || "Customer"} withdrew the pending custom/bulk request. Do not prepare or price that request.`,
        );
      }
      if (hadDraft) {
        out.replies.push(wasCustom
          ? `No problem — I cleared that pending custom/bulk request${hadQuote ? " and its old quoted price" : ""}. Nothing from it will carry into your next order. Any already-confirmed orders are unchanged.`
          : "No problem — I cleared the current unplaced order. Any already-confirmed orders are unchanged.");
      } else if (!remainder) {
        out.replies.push("You are starting fresh. Tell me what you would like to order.");
      }
      draft = null;
      if (!remainder) {
        out.route = wasCustom ? "custom_abandoned" : "draft_reset";
        for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
        return out;
      }
      text = remainder;
    }

    // A specifically requested combo that is switched off is handled by code before Claude.
    // This guarantees a clear customer answer and an owner alert even if the model would omit the item.
    const switchedOffCombo = requestedSwitchedOffCombo(text, menu);
    if (switchedOffCombo) {
      out.route = "not_live";
      out.issues.push("not_live");
      out.replies.push(`Sorry, ${switchedOffCombo.name} isn't running right now, so I can't take that one. I've let Annapurna Home Foods know.`);
      await this.raise(
        msg.from,
        customer.name || msg.name || "Customer",
        `Asked for ${switchedOffCombo.name}, which is switched off right now.`,
        null,
        out,
      );
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // For an explicit fresh-order reset, exact one-item menu orders with a clear pickup
    // are rebuilt entirely in code. This path must never wait on Claude just to forget old draft state.
    if (freshResetContext) {
      const rebuilt = deterministicFreshDraft(text, menu, now, settings, customer.name || msg.name || null);
      if (rebuilt) {
        store.putDraft(msg.from, rebuilt);
        out.route = "fresh_order";
        out.replies.push(this.readBack(rebuilt, settings, now, open));
        for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
        return out;
      }
    }

    // After a stale custom quote has been refused, a clearly unrelated normal menu order starts cleanly.
    // This prevents old custom state from swallowing the next normal confirmation. The old custom alert
    // is also closed so the owner cannot later quote an abandoned/stale request from an old screen.
    const afterStaleCustomRefusal = !!draft?.custom && draft.custom.price == null &&
      /(?:old quote|quote the current request again|final price must come from Annapurna Home Foods|still need the final price)/i.test(lastShop ?? "");
    if (afterStaleCustomRefusal && clearlyNormalMenuOrder(text, menu)) {
      store.clearDraft(msg.from);
      for (const a of store.listAlerts(true)) {
        if (a.waId === msg.from && a.orderId == null && a.note.startsWith("Custom/bulk request:")) store.markAlertDone(a.id);
      }
      draft = null;
      out.issues.push("stale_custom_cleared_for_normal_order");
    }

    // Large explicit quantities and custom-recipe requests are captured before Claude. A fresh
    // catering/headcount request immediately after an already-placed order is also forced down this
    // path so it cannot be mistaken for a change/cancel request for that earlier order.
    const freshCustomAfterPlaced = !draft?.custom && open.length > 0 && looksCustom(text, menu) && !PLACED_ORDER_CHANGE.test(text);
    if (!draft?.custom && (deterministicCustomStart(text, menu) || freshCustomAfterPlaced)) {
      const parsedPickup = simpleCustomPickup(text, now, settings.tz);
      const next: Draft = {
        items: deterministicCustomItems(text, menu),
        pickup_local: parsedPickup,
        customer_name: customer.name || msg.name || null,
        notes: "",
        readback_hash: null,
        stage: "collecting",
        custom: { request: text.slice(0, 300), price: null, approved: false },
      };
      store.putDraft(msg.from, next);
      out.route = "custom_request";
      out.replies.push(
        `I've sent this custom/bulk request to Annapurna Home Foods. No order is placed yet. ` +
        `${parsedPickup ? `Pickup noted for ${formatWhen(parsedPickup)}. ` : ""}` +
        `Annapurna Home Foods will confirm the final price${parsedPickup ? "" : " and pickup time"} here before you can place it.`
      );
      await this.raise(msg.from, customer.name || msg.name || "Customer", `Custom/bulk request: "${text.slice(0, 220)}"`, null, out);
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // For an active custom order, parse common pickup replies in code so a transient model failure
    // cannot lose "tomorrow 6 PM" or "Sunday noon". The kitchen timezone remains the source of truth.
    if (draft?.custom) {
      const custom = draft.custom;
      const parsedPickup = simpleCustomPickup(text, now, settings.tz);
      if (parsedPickup && parsedPickup !== draft.pickup_local) {
        draft = { ...draft, custom, pickup_local: parsedPickup, stage: "collecting", readback_hash: null };
        store.putDraft(msg.from, draft);
        if (!CUSTOM_CONFIRM.test(text)) {
          out.route = "custom_pickup";
          out.replies.push(custom.price == null
            ? `Got it — pickup is ${formatWhen(parsedPickup)}. Annapurna Home Foods will confirm the final price here.`
            : `Got it — pickup is ${formatWhen(parsedPickup)} and the quoted price is ${money(custom.price)}. Reply CONFIRM THE ORDER when you're ready.`);
          for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
          return out;
        }
      }
    }

    // Customer-entered prices never populate custom pricing. Only the authenticated owner endpoint
    // is allowed to set draft.custom.price.
    if (draft?.custom && draft.custom.price == null && CUSTOMER_CUSTOM_PRICE.test(text)) {
      out.route = "custom_customer_price_ignored";
      out.replies.push("Thanks — I've noted your message, but the final price must come from Annapurna Home Foods. No order is placed yet.");
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // Custom/catering orders are different from menu orders: the owner sets the final price in chat,
    // then the customer confirms. Handle confirmation/acknowledgements deterministically so the model
    // can never invent a custom-order confirmation or lose the pending terms.
    if (draft?.custom && CUSTOM_CONFIRM.test(text)) {
      const staleQuote = draft.custom.price != null && !customQuoteIsCurrent(draft);
      if (staleQuote) {
        draft = clearCustomQuote(draft);
        store.putDraft(msg.from, draft);
      }
      if (draft.custom?.price != null && draft.pickup_local && customQuoteIsCurrent(draft)) {
        out.route = "confirm_custom_order";
        await this.placeCustomOrder(msg.from, draft, settings, out);
      } else if (staleQuote) {
        out.route = "confirm_custom_order+stale_quote";
        out.replies.push("I won't place that custom order with an old quote. The requested items changed after that price was given, so Annapurna Home Foods needs to quote the current request again. No order was placed.");
      } else {
        const missing = [
          draft.custom?.price == null ? "the final price" : "",
          !draft.pickup_local ? "the pickup day and time" : "",
        ].filter(Boolean);
        out.route = "confirm_custom_order+waiting";
        out.replies.push(`Your custom order is saved, but I still need ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} before I can place it. Annapurna Home Foods will finalize that here in this chat.`);
      }
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }
    if (draft?.custom && (THANKS.test(text) || CUSTOM_ACK.test(text))) {
      out.route = "custom_ack";
      const ready = customQuoteIsCurrent(draft) && !!draft.pickup_local;
      out.replies.push(ready
        ? "You're welcome! Your custom order details are ready. Reply CONFIRM THE ORDER when you want me to place it."
        : "You're welcome! Your custom order request is saved. Annapurna Home Foods will finalize the remaining details here.");
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // A change such as "my new catering request, change it to 25 people instead of 20"
    // must update the pending custom draft, never route to cancel/change a placed order.
    const changedHeadcount = pendingCustomHeadcountChange(text, draft);
    if (draft?.custom && changedHeadcount != null) {
      const hadQuote = draft.custom.price != null;
      const next: Draft = {
        ...draft,
        items: draft.items.map((it) => ({ ...it, qty: changedHeadcount })),
        readback_hash: null,
        stage: "collecting",
        custom: {
          ...draft.custom,
          request: text.slice(0, 300),
          price: null,
          approved: false,
          quote_key: null,
        },
      };
      store.putDraft(msg.from, next);
      // Replace stale custom-work alerts with one current, unlinked request. Never attach this
      // kind of change to a placed order, which is what creates the dangerous Cancel button.
      for (const a of store.listAlerts(true)) {
        if (a.waId === msg.from && a.orderId == null && isCustomWorkAlert(a.note)) store.markAlertDone(a.id);
      }
      out.route = "custom_headcount_change";
      if (hadQuote) out.issues.push("stale_custom_quote");
      out.replies.push(
        hadQuote
          ? `Got it — I updated the pending catering request to ${changedHeadcount} people and cleared the old quoted price. No placed order was changed. Annapurna Home Foods needs to quote the updated request again.`
          : `Got it — I updated the pending catering request to ${changedHeadcount} people. No placed order was changed. Annapurna Home Foods will confirm the price here.`
      );
      await this.raise(
        msg.from,
        customer.name || msg.name || "Customer",
        `Custom/bulk request updated: ${changedHeadcount} people. Needs current price quote. Customer said: "${text.slice(0, 180)}"`,
        null,
        out,
      );
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }

    // Wants a real person or a contact detail: answered by code, so the customer always gets a clear status.
    if (HUMAN.test(text) && !(draft?.stage === "awaiting_confirmation" && BARE_OK.test(text))) {
      const who = customer.name || msg.name || "Customer";
      const { created, alert } = await this.requestHuman(msg.from, who, text);
      out.route = "handoff";
      out.replies.push(this.handoffReply(created, alert, settings));
      for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
      return out;
    }
    const awaiting = draft?.stage === "awaiting_confirmation";
    const readbackCurrent = !!draft && !!draft.readback_hash && draft.readback_hash === draftHash(draft);

    const ctx = { lastShopMessage: freshResetContext ? null : lastShop, message: text, awaitingConfirmation: awaiting && readbackCurrent, hasPlacedOrder: open.length > 0 };
    let judgment: Judgment;
    try {
      judgment = await this.d.judge.judge(ctx);
    } catch (e) {
      console.error("judge failed, using rules", e);
      judgment = await this.heuristic.judge(ctx);
    }
    // The "Yes, place order" button sends exactly this text. It is a yes, whatever the judge thinks.
    if (ctx.awaitingConfirmation && CONFIRM_BUTTON.test(text) && judgment.cancelPlaced < 0.5) judgment = { ...judgment, agrees: Math.max(judgment.agrees ?? 0, 0.99) };

    // A clearly phrased fresh menu order must not be mistaken for a change/cancel request merely
    // because this customer already has another live order. TypeSafe can occasionally over-score
    // cancels_placed_order when hasPlacedOrder=true, so code gives a deterministic fresh-order
    // sentence priority unless the customer actually uses change/cancel language or targets an
    // existing order. Phrases such as "instead" remain ambiguous and are deliberately not forced.
    const clearFreshMenuOrder = open.length > 0
      && clearlyNormalMenuOrder(text, menu)
      && !PLACED_ORDER_CHANGE.test(text)
      && !EXPLICIT_PLACED_ORDER_TARGET.test(text)
      && !/\b(?:instead|rather\s+than|swap|remove)\b/i.test(text);
    if (clearFreshMenuOrder && judgment.cancelPlaced >= cfg.thresholds.cancelMaybe) {
      judgment = {
        ...judgment,
        cancelPlaced: 0.05,
        intent: {
          label: "order",
          prob: Math.max(judgment.intent.prob, 0.95),
          confidence: Math.max(judgment.intent.confidence, 0.9),
        },
      };
    }
    out.judgment = judgment;

    let r = decideRoute(judgment, { awaitingConfirmation: ctx.awaitingConfirmation, readbackCurrent, hasPlacedOrder: open.length > 0 }, cfg.thresholds);
    // A thank-you, or a bare yes when nothing is in progress, must never touch the order.
    if (r.kind === "normal" && !r.freeze) {
      const idle = !draft || (!draft.items.length && !draft.pickup_local);
      if (THANKS.test(text) || (BARE_OK.test(text) && open.length > 0 && idle)) r = { kind: "normal", freeze: true };
    }
    // "option 5" or just "5" after a numbered list: code looks the number up, so it is a real pick, not small talk.
    const picks = optionPicks(text, store.getMenu(), lastShop);
    let pickHint: string | undefined;
    if (picks.length) {
      const generic = r.kind === "clarify" && /^It is not clear/.test(r.hint);
      if (generic || (r.kind === "normal" && r.freeze)) r = { kind: "normal" };
      pickHint = picks.map((p) => p.item
        ? `The customer's "${p.no}" means option ${p.no}: ${p.item.name} (id ${p.item.id}).`
        : `There is no option ${p.no} on the menu. Say so kindly and ask which dish they mean.`).join(" ");
    }
    out.route = r.kind;

    // Unclear-turn streak: after a few in a row, hand the customer to Maddy.
    let streak = r.kind === "clarify" ? customer.uncertainStreak + 1 : 0;
    if (streak !== customer.uncertainStreak) store.updateCustomer(msg.from, { uncertainStreak: streak });
    customer = { ...customer, uncertainStreak: streak };

    switch (r.kind) {
      case "confirm_order":
        await this.placeOrder(msg.from, draft!, settings, out);
        break;
      case "confirm_ask":
        out.replies.push("Just to be sure, shall I place this order? Reply YES to confirm, or tell me what to change.");
        break;
      case "cancel_placed": {
        const o = open[0]!;
        const ids = open.map((x) => `#${x.id}`).join(", ");
        await this.raise(msg.from, customer.name || msg.name || "Customer", `Wants to cancel or change order ${open.length > 1 ? `(open orders ${ids}, most likely #${o.id})` : `#${o.id}`}: "${text.slice(0, 140)}"`, o.id, out);
        out.replies.push(`Got it, I've passed this to Annapurna Home Foods. We'll confirm here whether order #${o.id} can be changed or cancelled.`);
        break;
      }
      default:
        await this.modelTurn(msg, text, r, draft, open, customer, settings, out, streak, pickHint, freshResetContext);
    }

    for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
    return out;
  }

  /* ---------- model turn ---------- */

  private async modelTurn(
    msg: Inbound, text: string, r: Route, draft: Draft | null, open: Order[],
    customer: { name: string; profile: string }, settings: Settings, out: Outcome, streak: number, pickHint?: string, freshContext = false,
  ): Promise<void> {
    const { store } = this.d;
    const now = this.now();
    const menu = store.getMenu();
    // A clarify turn, or a customer who only asked a question, must not start or change the order.
    const frozen = r.kind === "clarify" || (r.kind === "normal" && r.freeze === true);
    const hint = r.kind === "clarify" ? r.hint : frozen ? "The customer is only asking a question or chatting. Answer it. Do not start or change the order, and keep stage as it is." : r.kind === "owner_topic" ? "This is a topic only Maddy can settle (payment, delivery, refund, allergy, custom or complaint). Do not answer it yourself. Say warmly that Annapurna Home Foods will reach out to them here in this chat. Never name Maddy to the customer." : undefined;

    const promptHistory = store.getMessages(msg.from, 40);
    // A real reset means "forget everything before this" for model context too. Keep the complete
    // transcript in storage for the customer/owner, but never send pre-reset chat back to Claude.
    const newest = promptHistory.at(-1);
    if (newest?.who === "cust" && newest.text !== text) promptHistory[promptHistory.length - 1] = { ...newest, text };
    if (freshContext && promptHistory.length) promptHistory.splice(0, promptHistory.length - 1);
    const prompt = buildPrompt({
      now, settings, menu, customer: { waId: msg.from, name: customer.name, contact: "", profile: customer.profile, uncertainStreak: streak },
      draft, history: promptHistory, hint: [pickHint, hint].filter(Boolean).join(" ") || undefined,
      placed: open.map((o) => `#${o.id} (${o.status}) ${o.items.map(itemLabel).join(", ")}, pickup ${formatWhen(o.pickup)}`),
    });

    let raw: Record<string, unknown>;
    try {
      const j = await this.d.llm.json(SYSTEM_PROMPT, prompt);
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("model returned a non-object");
      raw = j as Record<string, unknown>;
    } catch (e) {
      console.error("model turn failed", e);
      out.route += "+model_error";
      out.replies.push("Sorry, I couldn't process that just now. Please send it once more, or Annapurna Home Foods will help you here.");
      const detail = e instanceof LlmError
        ? e.code === "timeout"
          ? "Claude timed out before replying"
          : e.code === "http"
            ? `Claude returned an HTTP error (${e.message})`
            : `Claude returned an unusable response (${e.code})`
        : "The Claude request failed unexpectedly";
      await this.raise(msg.from, customer.name || msg.name || "Customer", `The assistant could not answer this customer (model error). ${detail}. Reply yourself if needed. Their message: "${text.slice(0, 100)}"`, null, out);
      return;
    }

    const modelReply = typeof raw.reply === "string" ? raw.reply.trim() : "";
    const rd = (raw.draft && typeof raw.draft === "object" ? raw.draft : {}) as Record<string, unknown>;

    // On a frozen turn the draft must not change, whatever the model sent.
    let items = draft?.items ?? [];
    let pickup = draft?.pickup_local ?? null;
    let notes = draft?.notes ?? "";
    let custName = draft?.customer_name ?? null;
    let again = draft?.again ?? false;
    let custom = draft?.custom;
    const issues: Issue[] = [];

    if (!frozen) {
      const startsCustom = !custom && looksCustom(text, menu);
      if (custom || startsCustom) {
        // Custom orders are owner-managed. Preserve the structured draft we already have and do not
        // run normal menu-item ambiguity checks on phrases such as "15-person medium tray".
        custom = custom ?? { request: text.slice(0, 300), price: null, approved: false };
        if (Array.isArray(rd.items) && rd.items.length) {
          const s = sanitizeItems(rd.items, menu);
          // Keep any clearly resolved menu items for a useful label, but ambiguity must not block catering.
          if (s.items.length) items = s.items;
          issues.push(...s.issues.filter((i) => i.kind === "not_live" || i.kind === "weekday_mismatch"));
        }
        if (typeof rd.pickup_local === "string" && isLocalIso(rd.pickup_local)) pickup = rd.pickup_local;
        if (typeof rd.notes === "string" && rd.notes.trim()) notes = rd.notes.slice(0, 300);
        if (typeof rd.customer_name === "string" && rd.customer_name.trim()) custName = rd.customer_name.trim().slice(0, 60);
      } else {
        const s = sanitizeItems(rd.items, menu);
        items = s.items;
        issues.push(...s.issues);
        pickup = typeof rd.pickup_local === "string" && isLocalIso(rd.pickup_local) ? rd.pickup_local : null;
        notes = typeof rd.notes === "string" ? rd.notes.slice(0, 300) : "";
        custName = typeof rd.customer_name === "string" && rd.customer_name.trim() ? rd.customer_name.trim().slice(0, 60) : null;
      }
      if (ADD_MORE.test(text)) again = true;
      const wk = checkWeekday(text, pickup, now, settings.tz);
      if (wk) {
        issues.push(wk);
        pickup = null;
      }
    }

    // An owner quote belongs to the exact custom food terms that existed when it was sent. If the
    // customer changes the dish, quantity, pack or custom notes, invalidate that quote immediately.
    // Pickup can change without invalidating price because it is intentionally excluded from the key.
    let staleCustomQuote = false;
    if (!frozen && custom?.price != null) {
      const candidate: Draft = {
        items, pickup_local: pickup, customer_name: custName, notes, readback_hash: null, stage: "collecting", custom,
      };
      if (!custom.quote_key || custom.quote_key !== customTermsKey(candidate)) {
        custom = { ...custom, price: null, approved: false, quote_key: null };
        staleCustomQuote = true;
      }
    }
    out.issues.push(...issues.map((i) => i.kind));

    // Deterministic replies win over the model when code found a problem.
    const fixes: string[] = [];
    if (staleCustomQuote) {
      fixes.push("The custom request changed, so I cleared the old quoted price. No order is placed. Annapurna Home Foods needs to quote the updated request before you can confirm it.");
      out.issues.push("stale_custom_quote");
    }
    const notLive = issues.filter((i): i is Extract<Issue, { kind: "not_live" }> => i.kind === "not_live");
    const unclear = issues.filter((i): i is Extract<Issue, { kind: "unclear_item" }> => i.kind === "unclear_item");
    const weekday = issues.find((i): i is Extract<Issue, { kind: "weekday_mismatch" }> => i.kind === "weekday_mismatch");
    if (notLive.length) {
      fixes.push(`Sorry, ${notLive.map((n) => n.name).join(" and ")} ${notLive.length > 1 ? "aren't" : "isn't"} running right now, so I can't take that one. I've let Annapurna Home Foods know.`);
      await this.raise(msg.from, customer.name || msg.name || "Customer", `Asked for ${notLive.map((n) => n.name).join(", ")}, which is switched off right now.`, null, out);
    }
    for (const u of unclear) {
      if (u.candidates.length) {
        fixes.push(`Just to be sure I get it right, which one did you mean for "${u.askedFor}": ${u.candidates.join(", or ")}?`);
      } else {
        fixes.push(`I don't see "${u.askedFor}" on the ordering menu. I've let Annapurna Home Foods know. Would you like something from the menu instead?`);
        await this.raise(msg.from, customer.name || msg.name || "Customer", `Asked for "${u.askedFor}", which is not on the menu.`, null, out);
      }
    }
    if (weekday) {
      fixes.push(`Just checking, did you mean ${dayLabel(weekday.suggestion)}? Please tell me the day and time you'd like to pick up.`);
    }

    // The same items and pickup as an order that is already placed is not a new order. Never read it back
    // again, or a stray "yes" would place a duplicate. Only "another / again / one more" starts a second one.
    if (!frozen && !fixes.length && items.length && pickup && !ADD_MORE.test(text)) {
      const key = orderKey(items, pickup);
      const dupe = open.find((o) => orderKey(o.items, o.pickup) === key);
      if (dupe) {
        fixes.push(`Order #${dupe.id} is already confirmed with these items and this pickup time (${formatWhen(dupe.pickup)}). If you'd like to place another order, just tell me what to add.`);
        items = [];
        pickup = null;
        notes = "";
        out.issues.push("duplicate_order");
      }
    }

    // Stage: the model can only propose. Code decides whether the order is ready to read back.
    const proposed = raw.stage === "awaiting_confirmation" ? "awaiting_confirmation" : raw.stage === "collecting" ? "collecting" : "browsing";
    let stage: Stage = frozen ? (draft?.stage ?? "browsing") : proposed;
    if (!frozen) {
      if (!items.length) stage = pickup || custName ? "collecting" : "browsing";
      else if (stage === "awaiting_confirmation" && (!pickup || fixes.length)) stage = "collecting";
      else if (stage === "browsing") stage = "collecting";
    }
    // Custom orders never enter the normal menu-order confirmation path. Once the owner has quoted
    // the custom price and pickup is known, the customer's explicit confirmation is handled by placeCustomOrder().
    if (custom) stage = "collecting";

    const next: Draft = { items, pickup_local: pickup, customer_name: custName, notes, readback_hash: null, stage, ...(again ? { again: true } : {}), ...(custom ? { custom } : {}) };
    if (stage === "awaiting_confirmation" && !custom) next.readback_hash = draftHash(next);
    // A frozen turn keeps the earlier read-back valid, since the draft did not change.
    if (frozen && draft) next.readback_hash = draft.readback_hash;

    if (!items.length && !pickup && !custName && !notes && !custom) store.clearDraft(msg.from);
    else store.putDraft(msg.from, next);
    if (custName && !customer.name) store.updateCustomer(msg.from, { name: custName });

    let reply: string;
    if (fixes.length) reply = fixes.join("\n");
    else if (stage === "awaiting_confirmation" && !frozen && !custom) reply = this.readBack(next, settings, now, open);
    else reply = modelReply || "Sorry, could you say that again?";
    if (custom && /(?:\bis\s+confirmed\b|\bhas\s+been\s+confirmed\b|\border\b[^.!?\n]{0,80}\bconfirmed\b)/i.test(reply)) {
      reply = custom.price != null && pickup
        ? "The custom order details are ready. Reply CONFIRM THE ORDER to place it."
        : "I've saved your custom order request. Annapurna Home Foods will confirm the final price and details here in this chat.";
    }
    // Model prose can never be the authority that an order was placed. Real placement confirmations
    // are generated by code and contain a real order number.
    if (!custom && PLACEMENT_CLAIM.test(reply)) {
      const hasRealOrderNumber = open.some((o) => new RegExp(`#${o.id}\\b`).test(reply));
      if (!hasRealOrderNumber) {
        reply = "I haven't placed an order from that message. Tell me what you'd like, and I'll show you a Check your order review before anything is placed.";
        out.issues.push("false_confirmation_blocked");
      }
    }
    out.replies.push(reply);

    const ownerNote = typeof raw.owner_note === "string" ? raw.owner_note.trim() : "";
    if ((raw.needs_owner === true || r.kind === "owner_topic") && !fixes.length) {
      const baseNote = ownerNote || `Needs Maddy: "${text.slice(0, 140)}"`;
      // Keep every custom/catering alert recognizable as custom work so fulfillment can close it.
      const alertNote = custom
        ? `Custom/bulk request: ${baseNote.replace(/^Custom\/bulk request:\s*/i, "")}`
        : baseNote;
      await this.raise(msg.from, customer.name || msg.name || "Customer", alertNote.slice(0, 300), null, out);
    }
    if (r.kind === "clarify" && streak >= this.d.cfg.thresholds.unclearStreak) {
      await this.raise(msg.from, customer.name || msg.name || "Customer", `The agent has been unsure what this customer wants for ${streak} messages in a row. Latest: "${text.slice(0, 140)}"`, null, out);
      out.replies[out.replies.length - 1] += "\nI've also asked Annapurna Home Foods to help you.";
    }
  }

  /** The read-back is built here, not by the model, so the total, dates and items are always right. */
  readBack(d: Draft, s: Settings, now: number, open: Order[] = []): string {
    const menu = this.d.store.getMenu();
    const lines = d.items.map((it) => `- ${itemLabel(it)}: ${it.amt == null ? "price to be confirmed" : money(it.amt)}`);
    const t = total(d.items);
    const flags = checkFlags(d.items, d.pickup_local, s, now, menu, open);
    const main = extrasOnly(d.items, menu) ? mainOrderFor(d.pickup_local, open) : undefined;
    const out = [
      main ? `Please check your extras for order #${main.id}:` : "Please check your order:",
      ...lines,
      t == null ? "Total: Annapurna Home Foods will confirm the price" : `Total: ${money(t)}`,
      `Pickup: ${formatWhen(d.pickup_local)} at ${s.address}`,
    ];
    if (d.notes) out.push(`Note: ${d.notes}`);
    if (flags.length) out.push(`Annapurna Home Foods needs to confirm this order first (${flags.join("; ").toLowerCase()}).`);
    out.push("Reply YES to submit this order for Annapurna confirmation, or tell me what to change.");
    return out.join("\n");
  }

  /* ---------- placing an order (code only) ---------- */

  private async placeCustomOrder(waId: string, draft: Draft, s: Settings, out: Outcome): Promise<void> {
    const { store } = this.d;
    const now = this.now();
    const custom = draft.custom;
    if (!custom || custom.price == null || !draft.pickup_local) return;
    // Last line of defence: even a stale/corrupt draft cannot create a custom order using a quote
    // that was issued for different items or quantities.
    if (!customQuoteIsCurrent(draft)) {
      store.putDraft(waId, clearCustomQuote(draft));
      out.route = "confirm_custom_order+stale_quote";
      out.issues.push("stale_custom_quote");
      out.replies.push("I won't place that custom order with an old quote. Annapurna Home Foods needs to quote the current request again. No order was placed.");
      return;
    }

    const already = store.openOrdersFor(waId).find((o) =>
      o.pickup === draft.pickup_local &&
      o.items.some((it) => it.id.startsWith("custom:")) &&
      total(o.items) === custom.price
    );
    if (already) {
      store.clearDraft(waId);
      out.orderId = already.id;
      out.route = "confirm_custom_order+duplicate";
      out.replies.push(`Order #${already.id} is already confirmed for ${formatWhen(already.pickup)}. There is nothing more to confirm.`);
      return;
    }

    const people = customHeadcount(custom.request) ?? bulkMenuQuantity(custom.request, store.getMenu());
    const menuNames = [...new Set(draft.items.map((it) => it.name))];
    const requestName = custom.request
      .replace(/^\s*(?:hi\s+)?(?:i\s+(?:would\s+like|want|need)\s+to\s+order\s*)/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const baseName = menuNames.length ? menuNames.join(" + ") : (requestName || "Custom catering order");
    const item = {
      id: `custom:${now}`,
      name: `${baseName} · custom catering`,
      qty: people ?? 1,
      pack: "single" as const,
      amt: custom.price,
    };
    const customer = store.getCustomer(waId)!;
    const name = customer.name || draft.customer_name || "Customer";
    const notes = [
      "Custom order price quoted by Annapurna and confirmed by customer",
      custom.request ? `Request: ${custom.request}` : "",
      draft.notes,
    ].filter(Boolean).join(". ").slice(0, 300);

    const order = store.insertOrder({
      waId, name, items: [item], pickup: draft.pickup_local, flags: [], status: "cook", notes, createdAt: now,
    });
    // The Needs-you custom request is fulfilled by this real order. Close every still-open
    // unlinked custom request alert for this customer so the owner desk does not retain stale work.
    for (const a of store.listAlerts(true)) {
      if (a.waId === waId && a.orderId == null && isCustomWorkAlert(a.note)) store.markAlertDone(a.id);
    }
    store.clearDraft(waId);
    if (!customer.name && draft.customer_name) store.updateCustomer(waId, { name: draft.customer_name });
    store.updateCustomer(waId, { profile: `Has ordered before. Last order: ${itemLabel(item)}, pickup ${formatWhen(draft.pickup_local)}.` });
    out.orderId = order.id;

    const who = friendlyName(name);
    out.replies.push(
      `Thank you${who ? ` ${who}` : ""}! Order #${order.id} is confirmed:\n- ${itemLabel(item)}\nTotal: ${money(custom.price)}\nPickup: ${formatWhen(draft.pickup_local)} at ${s.address}`
    );
    await this.d.notifier.notify(
      `Custom order #${order.id} confirmed`,
      `${name}: ${itemLabel(item)}. Pickup ${formatWhen(draft.pickup_local)}. ${money(custom.price)}`,
    );
  }

  private async placeOrder(waId: string, draft: Draft, s: Settings, out: Outcome): Promise<void> {
    const { store } = this.d;
    const now = this.now();
    const menu = store.getMenu();
    // The menu may have changed between the read-back and the yes. Never charge a price the
    // customer did not see, and never place a combo that was switched off in the meantime.
    const off = draft.items.filter((it) => {
      const m = findItem(menu, it.id);
      return !m || (m.kind === "combo" && !m.live);
    });
    const items = draft.items.filter((it) => !off.includes(it)).map((it) => ({ ...it, amt: lineAmt(menu, it) }));
    if (off.length || items.some((it, i) => it.amt !== draft.items[i]?.amt)) {
      const stage: Stage = items.length && draft.pickup_local ? "awaiting_confirmation" : "collecting";
      const next: Draft = { ...draft, items, stage, readback_hash: null };
      if (stage === "awaiting_confirmation") next.readback_hash = draftHash(next);
      store.putDraft(waId, next);
      out.route = "confirm_order+menu_changed";
      const lead = off.length
        ? `Sorry, ${off.map((o) => o.name).join(" and ")} ${off.length > 1 ? "aren't" : "isn't"} running right now, so I've taken ${off.length > 1 ? "them" : "it"} off your order.`
        : "Heads up, a price was just updated.";
      out.replies.push(stage === "awaiting_confirmation" ? `${lead}\n${this.readBack(next, s, now, store.openOrdersFor(waId))}` : `${lead} What else would you like?`);
      return;
    }
    // Last line of defence against double orders: the same items and pickup as an order that is already
    // open is never placed twice, unless the customer asked for another one.
    const sameAs = draft.again ? undefined : store.openOrdersFor(waId).find((o) => orderKey(o.items, o.pickup) === orderKey(items, draft.pickup_local));
    if (sameAs) {
      store.clearDraft(waId);
      out.route = "confirm_order+duplicate";
      out.issues.push("duplicate_order");
      out.replies.push(`Order #${sameAs.id} is already confirmed (${formatWhen(sameAs.pickup)}), so there is nothing more to confirm. If you'd like another order, just tell me what to add.`);
      return;
    }
    const openNow = store.openOrdersFor(waId);
    const flags = checkFlags(items, draft.pickup_local, s, now, menu, openNow);
    // Extras on their own ride along with the customer's order for the same day.
    const main = extrasOnly(items, menu) ? mainOrderFor(draft.pickup_local, openNow) : undefined;
    const notes = main ? [`Extras for order #${main.id}`, draft.notes].filter(Boolean).join(". ") : draft.notes;
    const customer = store.getCustomer(waId)!;
    const name = customer.name || draft.customer_name || "Customer";
    // Every normal website order is reviewed by Annapurna before it enters the kitchen.
    // Existing safety flags remain visible; ordinary orders get an explicit approval flag.
    const approvalFlags = flags.length ? flags : ["Awaiting owner approval"];
    const order = store.insertOrder({
      waId, name, items, pickup: draft.pickup_local, flags: approvalFlags, status: "hold", notes, createdAt: now,
    });
    store.clearDraft(waId);
    if (!customer.name && draft.customer_name) store.updateCustomer(waId, { name: draft.customer_name });
    store.updateCustomer(waId, { profile: `Has ordered before. Last order: ${items.map(itemLabel).join(", ")}, pickup ${formatWhen(draft.pickup_local)}.` });
    out.orderId = order.id;

    const t = total(items);
    const who = friendlyName(customer.name || draft.customer_name);
    const listing = items.map((it) => `- ${itemLabel(it)}`).join("\n");
    const reviewNote = flags.length ? ` Review needed: ${flags.join("; ").toLowerCase()}.` : "";
    out.replies.push(
      `Thank you${who ? ` ${who}` : ""}! Order #${order.id}${main ? ` (extras for order #${main.id})` : ""} has been submitted for Annapurna confirmation:\n${listing}\nTotal: ${money(t)}\nPickup: ${formatWhen(draft.pickup_local)} at ${s.address}\nWe'll confirm it here before we start cooking.${reviewNote}`
    );
    await this.d.notifier.notify(
      flags.length ? `Order #${order.id} needs you` : `Order #${order.id} needs approval`,
      `${name}: ${items.map(itemLabel).join(", ")}. Pickup ${formatWhen(draft.pickup_local)}. ${money(t)}. REVIEW: ${approvalFlags.join("; ")}`,
    );
  }

  /* ---------- talk to a person ---------- */

  /** A placed-order cancellation remains an owner decision, but the request itself is deterministic and notified. */
  async requestOrderCancellation(waId: string, who: string, orderId: number): Promise<{ created: boolean; alert: Alert }> {
    const { store } = this.d;
    const existing = store.listAlerts(true).find((a) => a.waId === waId && a.orderId === orderId && a.note.startsWith("Cancellation requested"));
    if (existing) return { created: false, alert: existing };
    const alert = store.insertAlert({
      waId,
      cust: who,
      note: `Cancellation requested for order #${orderId}`,
      orderId,
      createdAt: this.now(),
    });
    await this.d.notifier.notify(`Cancellation request for order #${orderId}`, `${who} asked to cancel order #${orderId}. Review it in the owner desk.`);
    return { created: true, alert };
  }

  /** Records one open request per customer and alerts the owner. Asking twice does not create a second alert. */
  async requestHuman(waId: string, who: string, said: string): Promise<{ created: boolean; alert: Alert }> {
    const { store } = this.d;
    const existing = store.openHandoff(waId);
    if (existing) return { created: false, alert: existing };
    const alert = store.insertAlert({ waId, cust: who, note: `${HANDOFF_NOTE}. They said: "${said.slice(0, 140)}"`, orderId: null, createdAt: this.now() });
    await this.d.notifier.notify(`${who} wants to talk to you`, `${HANDOFF_NOTE}. They said: "${said.slice(0, 140)}"`);
    return { created: true, alert };
  }

  handoffReply(created: boolean, alert: Alert, s: Settings): string {
    const at = new Date(alert.createdAt).toLocaleTimeString("en-US", { timeZone: s.tz, hour: "numeric", minute: "2-digit" });
    const lines = [
      created
        ? `Done. I've sent your request to Annapurna Home Foods at ${at}. We'll reach out to you here in this chat.`
        : `Your request is already with Annapurna Home Foods (sent at ${at}). We'll reach out to you here in this chat.`,
    ];
    if (s.contactInstagram) lines.push("You can also find us on Instagram:", `instagram.com/${s.contactInstagram}`);
    if (s.contactPhone) lines.push(`Phone: ${s.contactPhone}`);
    return lines.join("\n");
  }

  /* ---------- owner alerts ---------- */

  private async raise(waId: string, cust: string, note: string, orderId: number | null, out: Outcome): Promise<void> {
    const { store } = this.d;
    const dup = store.listAlerts(true).some((a) => a.waId === waId && a.note === note);
    if (dup) return;
    const a = store.insertAlert({ waId, cust, note, orderId, createdAt: this.now() });
    out.alertIds.push(a.id);
    await this.d.notifier.notify(`${cust} needs you`, note);
  }
}
