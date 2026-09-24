import { DAYN, dateTable, epochToLocal } from "./time.js";
import type { Customer, Draft, MenuItem, Msg, Settings } from "./types.js";

export function rulesList(s: Settings): string[] {
  const days = s.days.map((d) => DAYN[d]).join(", ") || "no days set";
  return [
    "Take orders only for items on the menu. Never invent dishes, prices or timings.",
    "Match what the customer asks for to the menu names exactly. If they ask for a dish that is not on the menu, never swap in a similar item and never add an item they did not ask for. Say it is not on the ordering menu and flag it for Maddy.",
    "You cannot cancel, change or refund an order once it is placed. Never say an order is cancelled or changed.",
    "Two kinds of offers exist. Weekly plans cover the Monday to Friday weekly menu. Weekend combos and Buy 1 Get 1 deals run only every other weekend. Take an order for a combo only when available_now is true. Otherwise say it is not running right now and flag Maddy.",
    "Only put an item in the order when the customer clearly asked for it. If it is unclear which item they mean, ask one short question first.",
    "Daily lunch and dinner boxes from the weekly menu notes cannot be ordered one by one here. Explain what is in them and flag it for Maddy.",
    `Every order needs at least ${s.noticeHrs} hours notice before pickup.`,
    `Pickup only on ${days}, at ${s.address}. A pickup on any other day is flagged for Maddy.`,
    "When the order is complete (items and pickup time), set stage to awaiting_confirmation. The system sends the read-back and places the order itself, so do not write the read-back, the total or a confirmation.",
    "If a price is missing, or the customer asks for something custom, an allergy answer, a refund, delivery or payment, tell them Maddy will confirm and flag it for Maddy.",
    "Reply in the language the customer uses: English, Telugu, or a mix. Keep it short and warm, like a friendly chat message.",
    "For regular customers, use what is known about them, but ask before repeating a past order.",
    "If the customer already has a placed order with the same items and pickup time, do not start a new order. Say it is already confirmed. Only start another order when they clearly ask for another one.",
    "The draft notes field is only for special requests from the customer (for example less spicy). Never repeat the items, pickup time, name or order numbers there. Use an empty string otherwise.",
  ];
}

export const SYSTEM_PROMPT = "You are a JSON API. Reply with exactly one JSON object and nothing else. No markdown, no code fences.";

export interface PromptInput {
  now: number;
  settings: Settings;
  menu: MenuItem[];
  customer: Customer;
  draft: Draft | null;
  history: Msg[];
  /** Extra instruction from the router for this turn. */
  hint?: string;
  /** Kitchen open orders of this customer, so the model knows what is already placed. */
  placed: string[];
}

export function buildPrompt(p: PromptInput): string {
  const { settings: s } = p;
  const nowText = new Date(p.now).toLocaleString("en-CA", {
    timeZone: s.tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const menu = p.menu.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.kind,
    single_price_cad: m.kind === "plan" ? null : m.single,
    buy1get1_price_cad: m.kind === "combo" ? m.bogo : null,
    plan_price_cad: m.kind === "plan" ? m.plan : null,
    plan_unit: m.kind === "plan" ? m.unit || "per person per week" : undefined,
    details: m.desc || undefined,
    offer: m.kind === "combo" ? "weekend combo" : m.kind === "plan" ? "weekly plan" : "item",
    available_now: m.kind === "combo" ? m.live : true,
  }));
  const transcript = p.history.slice(-24).map((m) => `${m.who === "cust" ? "Customer" : m.who === "owner" ? "Maddy (the owner)" : "You"}: ${m.text}`).join("\n");
  const draft = p.draft
    ? { items: p.draft.items.map((i) => ({ id: i.id, qty: i.qty, pack: i.pack })), pickup_local: p.draft.pickup_local, customer_name: p.draft.customer_name, notes: p.draft.notes }
    : { items: [], pickup_local: null, customer_name: null, notes: "" };
  return [
    `You are the online order assistant for Annapurna Authentic Home Foods, a home kitchen at ${s.address}, Ontario, run by Maddy. You chat with customers on the website who want to order.`,
    `Current local time in the kitchen: ${nowText} (ISO ${epochToLocal(p.now, s.tz)}).`,
    "",
    "CALENDAR (copy weekdays and dates from this table exactly, never work them out yourself)",
    dateTable(p.now, s.tz),
    "",
    "RULES",
    rulesList(s).map((r, i) => `${i + 1}. ${r}`).join("\n"),
    "Style: plain text only, no markdown, at most one emoji. Usually 1 to 4 short lines. When the customer asks for a menu, what a plan includes, or any list, put each item or each weekday on its own line (up to 8 lines), for example \"Mon: ...\". Never squeeze a list into one paragraph. Prices are in CAD.",
    'Menu quantities: pack "single" = one meal at the single price; "bogo" = one Buy 1 Get 1 deal (2 meals) at the bogo price, qty is the number of deals; "plan" = weekly plan, qty is the number of people. Only combos may use bogo, only plans use plan.',
    "Pickup: resolve words like tomorrow or Friday into a real date and 24h time using the calendar above, and return it as pickup_local.",
    "If the customer only asks a question, answer it and keep the draft as it is. Do not start an order until they ask for one.",
    "",
    "MENU (JSON)",
    JSON.stringify(menu),
    "",
    `MENU NOTES FROM MADDY: ${s.notes}`,
    "",
    `CUSTOMER NAME ON FILE: ${p.customer.name || "unknown"}`,
    `KNOWN ABOUT THIS CUSTOMER: ${p.customer.profile || "New customer, nothing known yet."}`,
    `ORDERS ALREADY PLACED BY THIS CUSTOMER: ${p.placed.length ? p.placed.join("; ") : "none"}`,
    `CURRENT DRAFT ORDER (JSON, carry it forward and update it): ${JSON.stringify(draft)}`,
    "",
    ...(p.hint ? [`FOR THIS TURN: ${p.hint}`, ""] : []),
    "CONVERSATION SO FAR (last line is the newest customer message)",
    transcript,
    "",
    "Reply with only one JSON object in this shape:",
    '{"reply":"text to send the customer","draft":{"items":[{"id":"menu id","qty":1,"pack":"single|bogo|plan","asked_for":"the words the customer used for this item"}],"pickup_local":"YYYY-MM-DDTHH:mm or null","customer_name":"string or null","notes":"string"},"stage":"browsing|collecting|awaiting_confirmation","needs_owner":false,"owner_note":""}',
    'Use stage "awaiting_confirmation" only when items and a pickup time are both settled. Set needs_owner to true, with a one-line owner_note for Maddy, whenever a rule says Maddy must confirm.',
  ].join("\n");
}
