import type { Config } from "./config.js";
import { checkFlags, checkWeekday, draftHash, extrasOnly, friendlyName, mainOrderFor, sanitizeItems, type Issue } from "./guards.js";
import { HeuristicJudge, type Judge, type Judgment } from "./judge.js";
import type { Llm } from "./llm.js";
import { findItem, itemLabel, lineAmt, money, total, optionPicks } from "./menu.js";
import type { Notifier } from "./notify.js";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt.js";
import { route as decideRoute, type Route } from "./router.js";
import type { Store } from "./store.js";
import { dayLabel, formatWhen, isLocalIso } from "./time.js";
import type { Alert, Draft, Order, Settings, Stage } from "./types.js";

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
/** The customer wants a real person, a phone number or the Instagram page. */
const HUMAN = /\b(real (person|human)|human being|a human|(talk|speak|chat) (to|with) (a |the |an )?(person|human|someone|somebody|owner|maddy|team|staff|agent)|contact (you|us|number|info|details)|phone( number)?|your number|call me|call you|instagram|insta|whatsapp|customer (service|support))\b/i;
/** Text sent by the web app's "Yes, place order" button. */
const CONFIRM_BUTTON = /^yes, confirm$/i;
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
    const text = msg.text.trim().slice(0, MAX_TEXT);
    if (!text) return { ...out, route: "empty" };
    if (msg.messageId && !store.markSeen(msg.messageId, this.now())) return { ...out, route: "duplicate" };

    const now = this.now();
    const settings = store.getSettings();
    const menu = store.getMenu();
    let customer = store.upsertCustomer(msg.from, msg.name);
    const before = store.getMessages(msg.from, 40);
    const lastShop = [...before].reverse().find((m) => m.who === "agent" || m.who === "owner")?.text ?? null;
    store.addMessage(msg.from, "cust", text, now);

    const draft = store.getDraft(msg.from);
    const open = store.openOrdersFor(msg.from);

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

    const ctx = { lastShopMessage: lastShop, message: text, awaitingConfirmation: awaiting && readbackCurrent, hasPlacedOrder: open.length > 0 };
    let judgment: Judgment;
    try {
      judgment = await this.d.judge.judge(ctx);
    } catch (e) {
      console.error("judge failed, using rules", e);
      judgment = await this.heuristic.judge(ctx);
    }
    // The "Yes, place order" button sends exactly this text. It is a yes, whatever the judge thinks.
    if (ctx.awaitingConfirmation && CONFIRM_BUTTON.test(text) && judgment.cancelPlaced < 0.5) judgment = { ...judgment, agrees: Math.max(judgment.agrees ?? 0, 0.99) };
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
        await this.modelTurn(msg, text, r, draft, open, customer, settings, out, streak, pickHint);
    }

    for (const reply of out.replies) store.addMessage(msg.from, "agent", reply, this.now());
    return out;
  }

  /* ---------- model turn ---------- */

  private async modelTurn(
    msg: Inbound, text: string, r: Route, draft: Draft | null, open: Order[],
    customer: { name: string; profile: string }, settings: Settings, out: Outcome, streak: number, pickHint?: string,
  ): Promise<void> {
    const { store } = this.d;
    const now = this.now();
    const menu = store.getMenu();
    // A clarify turn, or a customer who only asked a question, must not start or change the order.
    const frozen = r.kind === "clarify" || (r.kind === "normal" && r.freeze === true);
    const hint = r.kind === "clarify" ? r.hint : frozen ? "The customer is only asking a question or chatting. Answer it. Do not start or change the order, and keep stage as it is." : r.kind === "owner_topic" ? "This is a topic only Maddy can settle (payment, delivery, refund, allergy, custom or complaint). Do not answer it yourself. Say warmly that Annapurna Home Foods will reach out to them here in this chat. Never name Maddy to the customer." : undefined;

    const prompt = buildPrompt({
      now, settings, menu, customer: { waId: msg.from, name: customer.name, contact: "", profile: customer.profile, uncertainStreak: streak },
      draft, history: store.getMessages(msg.from, 40), hint: [pickHint, hint].filter(Boolean).join(" ") || undefined,
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
      await this.raise(msg.from, customer.name || msg.name || "Customer", `The assistant could not answer this customer (model error). Check the Claude key and credits, or reply yourself. Their message: "${text.slice(0, 100)}"`, null, out);
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
    const issues: Issue[] = [];

    if (!frozen) {
      const s = sanitizeItems(rd.items, menu);
      items = s.items;
      issues.push(...s.issues);
      pickup = typeof rd.pickup_local === "string" && isLocalIso(rd.pickup_local) ? rd.pickup_local : null;
      notes = typeof rd.notes === "string" ? rd.notes.slice(0, 300) : "";
      if (ADD_MORE.test(text)) again = true;
      custName = typeof rd.customer_name === "string" && rd.customer_name.trim() ? rd.customer_name.trim().slice(0, 60) : null;
      const wk = checkWeekday(text, pickup, now, settings.tz);
      if (wk) {
        issues.push(wk);
        pickup = null;
      }
    }
    out.issues.push(...issues.map((i) => i.kind));

    // Deterministic replies win over the model when code found a problem.
    const fixes: string[] = [];
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

    const next: Draft = { items, pickup_local: pickup, customer_name: custName, notes, readback_hash: null, stage, ...(again ? { again: true } : {}) };
    if (stage === "awaiting_confirmation") next.readback_hash = draftHash(next);
    // A frozen turn keeps the earlier read-back valid, since the draft did not change.
    if (frozen && draft) next.readback_hash = draft.readback_hash;

    if (!items.length && !pickup && !custName && !notes) store.clearDraft(msg.from);
    else store.putDraft(msg.from, next);
    if (custName && !customer.name) store.updateCustomer(msg.from, { name: custName });

    let reply: string;
    if (fixes.length) reply = fixes.join("\n");
    else if (stage === "awaiting_confirmation" && !frozen) reply = this.readBack(next, settings, now, open);
    else reply = modelReply || "Sorry, could you say that again?";
    out.replies.push(reply);

    const ownerNote = typeof raw.owner_note === "string" ? raw.owner_note.trim() : "";
    if ((raw.needs_owner === true || r.kind === "owner_topic") && !fixes.length) {
      await this.raise(msg.from, customer.name || msg.name || "Customer", (ownerNote || `Needs Maddy: "${text.slice(0, 140)}"`).slice(0, 300), null, out);
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
    out.push("Reply YES to confirm, or tell me what to change.");
    return out.join("\n");
  }

  /* ---------- placing an order (code only) ---------- */

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
    const order = store.insertOrder({
      waId, name, items, pickup: draft.pickup_local, flags, status: flags.length ? "hold" : "cook", notes, createdAt: now,
    });
    store.clearDraft(waId);
    if (!customer.name && draft.customer_name) store.updateCustomer(waId, { name: draft.customer_name });
    store.updateCustomer(waId, { profile: `Has ordered before. Last order: ${items.map(itemLabel).join(", ")}, pickup ${formatWhen(draft.pickup_local)}.` });
    out.orderId = order.id;

    const t = total(items);
    const who = friendlyName(customer.name || draft.customer_name);
    const listing = items.map((it) => `- ${itemLabel(it)}`).join("\n");
    if (flags.length) {
      out.replies.push(`Thank you${who ? ` ${who}` : ""}! I've noted order #${order.id}:\n${listing}\nWe need to confirm it first (${flags.join("; ").toLowerCase()}). Annapurna Home Foods will reach out to you here in this chat.`);
    } else {
      out.replies.push(`Thank you${who ? ` ${who}` : ""}! Order #${order.id}${main ? ` (extras for order #${main.id})` : ""} is confirmed:\n${listing}\nTotal: ${money(t)}\nPickup: ${formatWhen(draft.pickup_local)} at ${s.address}`);
    }
    await this.d.notifier.notify(
      flags.length ? `Order #${order.id} needs you` : main ? `Extras for order #${main.id} (new order #${order.id})` : `New order #${order.id}`,
      `${name}: ${items.map(itemLabel).join(", ")}. Pickup ${formatWhen(draft.pickup_local)}. ${money(t)}${flags.length ? `. HOLD: ${flags.join("; ")}` : ""}`,
    );
  }

  /* ---------- talk to a person ---------- */

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
