import { createHash } from "node:crypto";
import { DAYN, dowOfLocal, isLocalIso, localToEpoch, nextDateForDow } from "./time.js";
import { findItem, itemDays, lineAmt } from "./menu.js";
import type { Draft, MenuItem, OrderItem, Pack, Settings } from "./types.js";

/* ---------- item matching: the model may not swap dishes ---------- */

const STOP = new Set([
  "and", "with", "combo", "combos", "the", "a", "an", "of", "in", "on", "ka", "plus", "please", "for", "to",
  "buy", "get", "bogo", "1", "2", "3", "4", "5", "x", "one", "two", "three", "want", "need", "i", "me", "my",
]);
const SYN: Record<string, string> = {
  keema: "kheema", qeema: "kheema", kima: "kheema", kheema: "kheema",
  pulav: "pulao", pulaov: "pulao", pilaf: "pulao", pulao: "pulao",
  raitha: "raita", salaan: "salan", curry: "curries",
};

export function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (!raw || STOP.has(raw)) continue;
    out.add(SYN[raw] ?? raw);
  }
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

export function matchScore(asked: string, m: MenuItem): number {
  const a = tokens(asked);
  let best = 0;
  for (const name of [m.name, ...m.aliases]) best = Math.max(best, dice(a, tokens(name)));
  return best;
}

export type ItemResolution =
  | { ok: true; id: string; corrected: boolean }
  | { ok: false; reason: "unclear" | "unknown"; askedFor: string; candidates: string[] };

const EXACT = 0.99;
const OK_SCORE = 0.8;
const CLEAR_GAP = 0.15;
/** A partial match (e.g. "bagara rice") is accepted when nothing else on the menu comes close. */
const PARTIAL_OK = 0.6;
const PARTIAL_RIVAL = 0.4;

/**
 * Check that the item the model put in the draft is really what the customer asked for.
 * Fixes clear mix-ups (asked "Bagara rice and chicken fry", model wrote kheema fry) and
 * rejects anything ambiguous so the customer gets asked instead of guessed at.
 */
export function resolveItem(askedFor: string, claimedId: string, menu: MenuItem[]): ItemResolution {
  // Telugu script or other non-Latin text can't be matched against English names. Trust the model.
  if (/[^\x00-\x7F]/.test(askedFor)) {
    return findItem(menu, claimedId) ? { ok: true, id: claimedId, corrected: false } : { ok: false, reason: "unknown", askedFor, candidates: [] };
  }
  if (!tokens(askedFor).size) {
    return findItem(menu, claimedId) ? { ok: true, id: claimedId, corrected: false } : { ok: false, reason: "unknown", askedFor, candidates: [] };
  }
  const scored = menu
    .map((m) => ({ m, s: matchScore(askedFor, m) }))
    .sort((x, y) => y.s - x.s);
  const claimed = scored.find((x) => x.m.id === claimedId);
  const top = scored[0];
  const second = scored[1];
  if (top) {
    const s2 = second?.s ?? 0;
    // Two exact matches (same alias on two items): keep the model's pick if it is one of them.
    if (top.s >= EXACT && s2 >= EXACT && claimed && claimed.s >= EXACT) return { ok: true, id: claimedId, corrected: false };
    const clear =
      (top.s >= EXACT && s2 < EXACT) ||
      (top.s >= OK_SCORE && top.s - s2 >= CLEAR_GAP) ||
      (top.s >= PARTIAL_OK && s2 < PARTIAL_RIVAL);
    if (clear) return { ok: true, id: top.m.id, corrected: top.m.id !== claimedId };
  }
  const candidates = scored.filter((x) => x.s >= PARTIAL_RIVAL).slice(0, 3).map((x) => x.m.name);
  return { ok: false, reason: candidates.length ? "unclear" : "unknown", askedFor, candidates };
}

/* ---------- draft sanitising ---------- */

export interface RawItem {
  id?: unknown;
  qty?: unknown;
  pack?: unknown;
  asked_for?: unknown;
}

export type Issue =
  | { kind: "unclear_item"; askedFor: string; candidates: string[] }
  | { kind: "not_live"; name: string }
  | { kind: "corrected_item"; from: string; to: string }
  | { kind: "weekday_mismatch"; said: string; suggestion: string };

export interface Sanitized {
  items: OrderItem[];
  issues: Issue[];
}

export function sanitizeItems(raw: unknown, menu: MenuItem[]): Sanitized {
  const items: OrderItem[] = [];
  const issues: Issue[] = [];
  if (!Array.isArray(raw)) return { items, issues };
  for (const r of raw as RawItem[]) {
    if (!r || typeof r !== "object") continue;
    const claimedId = String(r.id ?? "");
    const qty = Math.round(Number(r.qty));
    if (!(qty > 0 && qty < 100)) continue;
    const asked = typeof r.asked_for === "string" ? r.asked_for : "";
    let id = claimedId;
    if (asked) {
      const res = resolveItem(asked, claimedId, menu);
      if (!res.ok) {
        issues.push({ kind: "unclear_item", askedFor: res.askedFor, candidates: res.candidates });
        continue;
      }
      if (res.corrected) {
        issues.push({ kind: "corrected_item", from: findItem(menu, claimedId)?.name ?? claimedId, to: findItem(menu, res.id)?.name ?? res.id });
      }
      id = res.id;
    }
    const m = findItem(menu, id);
    if (!m) {
      issues.push({ kind: "unclear_item", askedFor: asked || claimedId, candidates: [] });
      continue;
    }
    if (m.kind === "combo" && !m.live) {
      issues.push({ kind: "not_live", name: m.name });
      continue;
    }
    const pack: Pack = m.kind === "plan" ? "plan" : m.kind === "combo" && r.pack === "bogo" ? "bogo" : "single";
    const existing = items.find((x) => x.id === m.id && x.pack === pack);
    if (existing) {
      existing.qty += qty;
      existing.amt = lineAmt(menu, existing);
      continue;
    }
    items.push({ id: m.id, name: m.name, qty, pack, amt: lineAmt(menu, { id: m.id, qty, pack }) });
  }
  return { items, issues };
}

/* ---------- weekday sanity check ---------- */

const DAY_WORDS: Array<[RegExp, number]> = [
  [/\b(sun|sunday)\b/i, 0], [/\b(mon|monday)\b/i, 1], [/\b(tue|tues|tuesday)\b/i, 2],
  [/\b(wed|wednesday)\b/i, 3], [/\b(thu|thur|thurs|thursday)\b/i, 4], [/\b(fri|friday)\b/i, 5], [/\b(sat|saturday)\b/i, 6],
];

/** Weekdays the customer named in a message. */
export function mentionedDays(text: string): number[] {
  const out: number[] = [];
  for (const [re, d] of DAY_WORDS) if (re.test(text)) out.push(d);
  return out;
}

/**
 * If the customer named exactly one weekday and the pickup the model produced lands on a different
 * weekday, the model got the calendar wrong. Do not trust it.
 */
export function checkWeekday(text: string, pickupLocal: string | null, now: number, tz: string): Issue | null {
  if (!pickupLocal || !isLocalIso(pickupLocal)) return null;
  const said = mentionedDays(text);
  if (said.length !== 1) return null;
  const want = said[0]!;
  if (dowOfLocal(pickupLocal) === want) return null;
  return { kind: "weekday_mismatch", said: DAYN[want]!, suggestion: nextDateForDow(now, tz, want) };
}

/* ---------- flags ---------- */

/**
 * The first name to greet a customer with, or "" when the typed name does not look like a name
 * ("sd", "abc", "x", "123"). Owner-facing screens still show exactly what was typed.
 */
export function friendlyName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}[\p{L}\p{M}'.-]{1,29}$/u.test(first)) return "";
  const letters = first.toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
  if (letters.length < 2 || /^(.)\1+$/.test(letters)) return "";
  if (/^[a-z]+$/.test(letters) && (!/[aeiouy]/.test(letters) || /^(abc|asd|asdf|qwe|qwerty|test|xyz|aaa|na|no|none|customer|user|name)$/.test(letters))) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Extras only, with no main dish in this order. */
export function extrasOnly(items: OrderItem[], menu: MenuItem[]): boolean {
  return items.length > 0 && items.every((it) => findItem(menu, it.id)?.kind === "addon");
}

/** An open order of this customer with pickup on the same day, which extras can go with. */
export function mainOrderFor(pickupLocal: string | null, open: Array<{ id: number; pickup: string | null; status: string }>): { id: number; pickup: string | null } | undefined {
  if (!pickupLocal) return undefined;
  const day = pickupLocal.slice(0, 10);
  return open.find((o) => ["hold", "cook", "ready"].includes(o.status) && o.pickup?.slice(0, 10) === day);
}

export function checkFlags(items: OrderItem[], pickupLocal: string | null, s: Settings, now: number, menu: MenuItem[] = [], open: Array<{ id: number; pickup: string | null; status: string }> = []): string[] {
  const f: string[] = [];
  if (!pickupLocal) {
    f.push("No pickup time");
    return f;
  }
  if (!isLocalIso(pickupLocal)) {
    f.push("Pickup time unclear");
    return f;
  }
  const mins = (localToEpoch(pickupLocal, s.tz) - now) / 60000;
  if (mins < s.noticeHrs * 60) f.push(mins < 0 ? "Pickup in the past" : `Under ${s.noticeHrs}h notice`);
  const dow = dowOfLocal(pickupLocal);
  const bad = items.filter((it) => !itemDays(findItem(menu, it.id), s).includes(dow));
  if (bad.length) f.push(`${DAYN[dow]} is not a pickup day for ${bad.map((b) => b.name).join(", ")}`);
  else if (!items.length && !s.days.includes(dow)) f.push(`${DAYN[dow]} is not a pickup day`);
  if (items.some((it) => it.amt == null)) f.push("Price not set");
  if (extrasOnly(items, menu) && !mainOrderFor(pickupLocal, open)) f.push("Extras need a main dish picked up the same day");
  return f;
}

/* ---------- read-back hash ---------- */

export function draftHash(d: Pick<Draft, "items" | "pickup_local" | "notes">): string {
  const canon = JSON.stringify({
    i: d.items.map((x) => [x.id, x.qty, x.pack]).sort(),
    p: d.pickup_local,
    n: d.notes.trim(),
  });
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}
