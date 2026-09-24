import { findItem, portions } from "./menu.js";
import { dayLabel } from "./time.js";
import type { MenuItem, Order } from "./types.js";

export interface RecipeRow {
  name: string;
  amt: number;
  unit: string;
}

export function parseRecipe(txt: string): RecipeRow[] {
  return String(txt || "")
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .map((p) => ({ name: p[0] ?? "", amt: parseFloat(p[1] ?? ""), unit: p[2] ?? "" }))
    .filter((r) => r.name && Number.isFinite(r.amt) && r.amt > 0);
}

export function fmtAmt(a: number, u: string): string {
  if (u === "g" && a >= 1000) return `${Math.round(a / 10) / 100} kg`;
  return `${Math.round(a * 10) / 10} ${u}`.trim();
}

export interface CookDay {
  date: string;
  label: string;
  dishes: Array<{ name: string; qty: number; plan: boolean; who: string[] }>;
}

export interface CookSummary {
  days: CookDay[];
  buy: Array<{ name: string; unit: string; amt: number; text: string }>;
  missingRecipe: string[];
}

/** Cook list per pickup day and a buy list, built from orders in "cook" status. */
export function cookSummary(orders: Order[], menu: MenuItem[], date?: string): CookSummary {
  const active = orders.filter((o) => o.status === "cook" && (!date || (o.pickup ?? "").slice(0, 10) === date));
  const byDay = new Map<string, Order[]>();
  for (const o of active) {
    const k = o.pickup ? o.pickup.slice(0, 10) : "none";
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }
  const days: CookDay[] = [];
  for (const k of [...byDay.keys()].sort()) {
    const by = new Map<string, { name: string; qty: number; plan: boolean; who: string[] }>();
    for (const o of byDay.get(k)!) {
      for (const it of o.items) {
        const key = it.id;
        const e = by.get(key) ?? { name: it.name, qty: 0, plan: it.pack === "plan", who: [] };
        e.qty += portions(it);
        if (!e.who.includes(o.name)) e.who.push(o.name);
        by.set(key, e);
      }
    }
    days.push({ date: k, label: k === "none" ? "No pickup time" : dayLabel(k), dishes: [...by.values()] });
  }
  const tot = new Map<string, { name: string; unit: string; amt: number }>();
  const missing: string[] = [];
  for (const o of active) {
    for (const it of o.items) {
      const rows = parseRecipe(findItem(menu, it.id)?.recipe ?? "");
      if (!rows.length) {
        if (!missing.includes(it.name)) missing.push(it.name);
        continue;
      }
      for (const r of rows) {
        const key = `${r.name.toLowerCase()}|${r.unit}`;
        const e = tot.get(key) ?? { name: r.name, unit: r.unit, amt: 0 };
        e.amt += r.amt * portions(it);
        tot.set(key, e);
      }
    }
  }
  const buy = [...tot.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ ...r, text: `${r.name}: ${fmtAmt(r.amt, r.unit)}` }));
  return { days, buy, missingRecipe: missing };
}
