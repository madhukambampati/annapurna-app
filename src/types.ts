export type Kind = "combo" | "plan" | "item" | "addon";
export type Pack = "single" | "bogo" | "plan";
export type Stage = "browsing" | "collecting" | "awaiting_confirmation";
export type OrderStatus = "hold" | "cook" | "ready" | "done" | "cancelled";

export interface MenuItem {
  id: string;
  name: string;
  kind: Kind;
  single: number | null;
  bogo: number | null;
  plan: number | null;
  unit: string;
  /** Price was read from a screenshot and Maddy has not confirmed it yet. */
  verify: boolean;
  desc: string;
  /** Combos only: is this weekend combo running right now? */
  live: boolean;
  /** Other names customers use. Used by the code-side item check. */
  aliases: string[];
  /** Pickup days for this item only, 0 = Sunday. Empty or missing means the kind's default days from Settings. */
  days?: number[];
  /** One ingredient per line: "Chicken | 250 | g" (per meal, or per person per week for plans). */
  recipe: string;
}

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  pack: Pack;
  /** Amount in CAD, null when the price is not set. */
  amt: number | null;
}

export interface Draft {
  items: OrderItem[];
  /** Wall-clock time in the kitchen timezone, "YYYY-MM-DDTHH:mm". */
  pickup_local: string | null;
  customer_name: string | null;
  notes: string;
  /** Hash of the read-back the customer was shown. Confirmation only counts against this. */
  readback_hash: string | null;
  stage: Stage;
  /** The customer asked for another order, so a match with an open order is allowed. */
  again?: boolean;
}

export interface Order {
  id: number;
  waId: string;
  name: string;
  items: OrderItem[];
  pickup: string | null;
  flags: string[];
  status: OrderStatus;
  notes: string;
  createdAt: number;
}

export interface Alert {
  id: number;
  waId: string;
  cust: string;
  note: string;
  orderId: number | null;
  done: boolean;
  createdAt: number;
}

export interface Settings {
  noticeHrs: number;
  address: string;
  /** Pickup days, 0 = Sunday. */
  days: number[];
  tz: string;
  /** Notes for the agent (box sizes, rules). Not shown to customers as-is. */
  notes: string;
  /** Customer-facing weekly plan, one weekday per line, "Monday: ...". Shown in the Menu sheet. */
  weeklyMenu: string;
  /** Pickup days for weekend combos, 0 = Sunday. */
  comboDays: number[];
  /** Instagram handle customers can be pointed to. Empty = none. */
  contactInstagram: string;
  /** Phone number customers can be pointed to. Empty = none. */
  contactPhone: string;
}

export interface Msg {
  id: number;
  /** cust = customer, agent = the AI assistant, owner = Maddy (or a status note from the kitchen). */
  who: "cust" | "agent" | "owner";
  text: string;
  ts: number;
}

export interface Customer {
  waId: string;
  name: string;
  /** Phone or email the customer gave on the website. Empty for other channels. */
  contact: string;
  profile: string;
  uncertainStreak: number;
}
