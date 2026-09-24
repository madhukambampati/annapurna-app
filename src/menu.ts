import type { MenuItem, OrderItem, Pack, Settings } from "./types.js";

/** Combos and prices as printed on the Annapurna posters (Sept 2026). Plans are not on the posters. Switch combos on/off with `live` from the desk. */
export function posterCombos(): MenuItem[] {
  const base = { plan: null, unit: "", verify: false, live: true, recipe: "" };
  return [
    {
      ...base, id: "kheema_fry", name: "Chicken Kheema Fry combo", kind: "combo", single: 18, bogo: 28,
      desc: "Chicken fry and kheema with Bagara rice. 24oz rice, 8oz chicken, 4oz raitha, 4oz onion and lemon.",
      aliases: ["chicken kheema fry", "kheema fry", "kheema fry combo", "chicken keema fry"],
    },
    {
      ...base, id: "gongura_kheema_pulao", name: "Gongura Chicken Kheema Pulao", kind: "combo", single: 13, bogo: 24,
      desc: "Gongura kheema pulao.",
      aliases: ["gongura chicken kheema pulao", "gongura kheema pulao", "gongura pulao", "gongura chicken keema pulao"],
    },
    {
      ...base, id: "fry_piece_pulao", name: "Gongura Fry Piece Pulao combo", kind: "combo", single: 17, bogo: 25,
      desc: "Served with raita and onion.",
      aliases: ["gongura fry piece pulao", "fry piece pulao", "fry piece pulav", "chicken fry piece pulao"],
    },
    {
      ...base, id: "bagara_chicken_fry", name: "Bagara Rice and Chicken Fry combo", kind: "combo", single: 15, bogo: 22,
      desc: "Bagara rice with chicken fry.",
      aliases: ["bagara rice and chicken fry", "bagara rice chicken fry", "bagara chicken fry", "bagara rice with chicken fry"],
    },
    {
      ...base, id: "kobbari_annam_fry", name: "Kobbari Annam with Chicken Fry combo", kind: "combo", single: 15, bogo: 22,
      desc: "Coconut rice with chicken fry.",
      aliases: ["kobbari annam with chicken fry", "kobbari annam chicken fry", "kobbari annam", "coconut rice with chicken fry"],
    },
    {
      ...base, id: "chicken_pulao_salan", name: "Chicken Pulao with Mirchi Ka Salan and Raitha", kind: "combo", single: 10, bogo: 18,
      desc: "",
      aliases: ["chicken pulao with mirchi ka salan and raitha", "chicken pulao mirchi ka salan", "chicken pulao salan"],
    },
    {
      ...base, id: "chicken_kheema_pulao", name: "Chicken Kheema Pulao with Raitha", kind: "combo", single: 12, bogo: 22,
      desc: "",
      aliases: ["chicken kheema pulao with raitha", "chicken kheema pulao", "kheema pulao"],
    },
    {
      ...base, id: "sunday_bogo_special", name: "Sunday special: Fry Piece Pulao + free Chicken Kheema Pulao", kind: "combo", single: 22, bogo: null, live: false, days: [0],
      desc: "Buy 1 Fry Piece Pulao, get a Chicken Kheema Pulao free.",
      aliases: ["sunday special", "sunday offer", "sunday bogo", "buy 1 fry piece pulao get chicken keema pulao free"],
    },
  ];
}

/** Bump when the poster prices or combos change. Existing databases get the update once. */
export const MENU_VERSION = 3;

/**
 * Brings a stored menu up to the poster version. Only names, prices, descriptions and aliases of combos
 * are refreshed. `live` and `recipe` are kept as Maddy set them, plans are untouched, new dishes are added.
 */
export function upgradeMenu(stored: MenuItem[]): MenuItem[] {
  const out = stored.map((m) => ({ ...m }));
  for (const p of posterCombos()) {
    const cur = out.find((m) => m.id === p.id);
    if (!cur) {
      out.push(p);
      continue;
    }
    Object.assign(cur, { name: p.name, single: p.single, bogo: p.bogo, desc: p.desc, aliases: p.aliases, verify: false });
    if (p.days) cur.days = p.days;
  }
  return out;
}

export function defaultMenu(): MenuItem[] {
  const base = { plan: null, unit: "", verify: false, live: true, recipe: "" };
  return [
    ...posterCombos(),
    {
      ...base, id: "plan_full", name: "Full meal plan", kind: "plan", single: null, bogo: null, plan: 90, unit: "per person per week",
      desc: "Breakfast + lunch + dinner, with rice.",
      aliases: ["full meal plan", "full meals plan", "full plan", "full meal"],
    },
    {
      ...base, id: "plan_bc", name: "Breakfast + curries plan", kind: "plan", single: null, bogo: null, plan: 80, unit: "per person per week",
      desc: "Breakfast + lunch + dinner curries, no rice.",
      aliases: ["breakfast curries plan", "breakfast and curries plan", "breakfast plus curries plan"],
    },
    {
      ...base, id: "plan_curries", name: "Only curries plan", kind: "plan", single: null, bogo: null, plan: 70, unit: "per person per week",
      desc: "24oz curry box daily.",
      aliases: ["only curries plan", "curries plan", "curries only"],
    },
    {
      ...base, id: "plan_breakfast", name: "Only breakfast plan", kind: "plan", single: null, bogo: null, plan: 30, unit: "per person per week",
      desc: "5 days of breakfast.",
      aliases: ["only breakfast plan", "breakfast plan", "breakfast only"],
    },
  ];
}

export const DEFAULT_NOTES =
  "Weekly menu, repeats every week. Chutney and karam podi come with breakfast every day. Box sizes: curry boxes are 24oz (about 450 to 500 g), a 24oz rice box is 600 g, a 16oz rice box is 300 g, fry boxes are 4oz.\n" +
  "Monday, breakfast 4 idli. Lunch and dinner alternate by week. Week 1: chicken pulav (2 x 24oz boxes, each 700 to 800 g) with Mirchi Ka Salan (2 x 4oz) and raita (2 x 4oz). Week 2: Bagara rice (24oz, 600 g) with Kodi Vepudu (24oz, 450 g) and raita (2 x 4oz).\n" +
  "Tuesday, veg, breakfast 3 dosa. Lunch and dinner: rice 24oz box (600 g), dal 24oz box (450 g), fry 2 x 4oz boxes.\n" +
  "Wednesday, special combo, breakfast 7 gunthapungullu. Lunch and dinner: rice 24oz box (600 g), egg curry 24oz box (450 to 500 g), perugu charu, roti pachadi (optional).\n" +
  "Thursday, breakfast 2 uttapam. Lunch and dinner: rice 24oz box (600 g), veg curry or sambar 24oz box (450 to 500 g), papad.\n" +
  "Friday, healthy combo, breakfast 1 thatte idli. Lunch and dinner alternate by week. Week 1: rice 16oz box (300 g), 1 ragi mudha, chicken curry 24oz box (450 to 500 g). Week 2: coconut rice 24oz box (600 g) and chicken curry 24oz box (450 to 500 g).\n" +
  "Chicken is served 2 days a week. Everything is fresh homemade with no preservatives.\n" +
  "Single weekday boxes have no prices set here, so never quote a price for them. Annapurna Home Foods confirms those.";

export const DEFAULT_WEEKLY =
  "Monday: Breakfast 4 idli. Lunch and dinner alternate by week: chicken pulav with Mirchi Ka Salan and raita, or Bagara rice with Kodi Vepudu and raita.\n" +
  "Tuesday (veg): Breakfast 3 dosa. Lunch and dinner: rice, dal and fry.\n" +
  "Wednesday (special combo): Breakfast 7 gunthapungullu. Lunch and dinner: rice, egg curry, perugu charu, roti pachadi (optional).\n" +
  "Thursday: Breakfast 2 uttapam. Lunch and dinner: rice, veg curry or sambar, papad.\n" +
  "Friday (healthy combo): Breakfast 1 thatte idli. Lunch and dinner alternate by week: rice, ragi mudha and chicken curry, or coconut rice and chicken curry.\n" +
  "Chutney and karam podi come with breakfast every day. Everything is fresh and homemade.";

export function defaultSettings(): Settings {
  return {
    noticeHrs: 2,
    address: "1425B Blockline Rd, Kitchener",
    days: [1, 2, 3, 4, 5],
    tz: "America/Toronto",
    notes: DEFAULT_NOTES,
    weeklyMenu: DEFAULT_WEEKLY,
    comboDays: [5, 6, 0],
    contactInstagram: "annapurna_hometaste",
    contactPhone: "",
  };
}

/** Pickup days that apply to one menu item. An item's own days win, then the combo days, then the plan days. */
export function itemDays(m: MenuItem | undefined, s: Settings): number[] {
  if (m?.days?.length) return m.days;
  return m?.kind === "combo" ? s.comboDays : s.days;
}

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon to Fri", "Fri to Sun", "Sunday only", or a comma list. Weeks start on Monday. */
export function dayRange(days: number[]): string {
  const order = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!order.length) return "no days set";
  if (order.length === 1) return `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][order[0]!]} only`;
  const run = order.every((d, i) => i === 0 || ((d + 6) % 7) - ((order[i - 1]! + 6) % 7) === 1);
  return run && order.length >= 3 ? `${SHORT[order[0]!]} to ${SHORT[order.at(-1)!]}` : order.map((d) => SHORT[d]).join(", ");
}

/** Option numbers customers can say, like "option 5". Menu order, starting at 1, same on the website and for the assistant. */
export function optionNo(menu: MenuItem[], id: string): number {
  return menu.findIndex((m) => m.id === id) + 1;
}

const OPTION_WORD = /\b(?:option|opt|number|num|no\.?|item|dish|choice)\s*#?\s*(\d{1,2})\b|#\s*(\d{1,2})\b/gi;
const BARE_NUMBERS = /^\s*(\d{1,2})(?:\s*(?:,|and|&|\+)\s*(\d{1,2}))*\s*(?:please|pls|plz)?[\s.!]*$/i;

/**
 * Finds option numbers in a customer message: "option 5", "no 3", "#2", or just "5" (only when the last
 * shop message listed numbered dishes). Each number is looked up in the menu, so the model never guesses.
 */
export function optionPicks(text: string, menu: MenuItem[], lastShop: string | null): { no: number; item?: MenuItem }[] {
  const nums: number[] = [];
  for (const m of text.matchAll(OPTION_WORD)) nums.push(Number(m[1] ?? m[2]));
  if (!nums.length && BARE_NUMBERS.test(text) && lastShop) {
    for (const d of text.match(/\d{1,2}/g) ?? []) {
      if (new RegExp(`^\\s*${d}[.)]\\s`, "m").test(lastShop)) nums.push(Number(d));
    }
  }
  return [...new Set(nums)].map((no) => ({ no, item: no >= 1 ? menu[no - 1] : undefined }));
}

export function findItem(menu: MenuItem[], id: string): MenuItem | undefined {
  return menu.find((m) => m.id === id);
}

export function unitPrice(m: MenuItem | undefined, pack: Pack): number | null {
  if (!m) return null;
  const p = pack === "bogo" ? m.bogo : pack === "plan" ? m.plan : m.single;
  return p ?? null;
}

export function lineAmt(menu: MenuItem[], it: Pick<OrderItem, "id" | "qty" | "pack">): number | null {
  const p = unitPrice(findItem(menu, it.id), it.pack);
  return p == null ? null : p * it.qty;
}

export function total(items: OrderItem[]): number | null {
  let t = 0;
  for (const it of items) {
    if (it.amt == null) return null;
    t += it.amt;
  }
  return Math.round(t * 100) / 100;
}

export function money(n: number | null): string {
  return n == null ? "Price TBC" : `$${Math.round(n * 100) / 100}`;
}

export function itemLabel(it: OrderItem): string {
  if (it.pack === "bogo") return `${it.qty} x ${it.name} (Buy 1 Get 1)`;
  if (it.pack === "plan") return `${it.qty} x ${it.name} (${it.qty} ${it.qty > 1 ? "people" : "person"})`;
  return `${it.qty} x ${it.name}`;
}

export function portions(it: OrderItem): number {
  return it.pack === "bogo" ? it.qty * 2 : it.qty;
}
