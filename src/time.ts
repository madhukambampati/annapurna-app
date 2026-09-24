/**
 * All pickup times are wall-clock times in the kitchen timezone ("YYYY-MM-DDTHH:mm").
 * Nothing here depends on the timezone of the server.
 */

export const DAYN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  dow: number;
}

export function zonedParts(epoch: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const get: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(epoch))) get[p.type] = p.value;
  return {
    y: Number(get.year),
    m: Number(get.month),
    d: Number(get.day),
    h: Number(get.hour),
    mi: Number(get.minute),
    dow: SHORT.indexOf(get.weekday ?? ""),
  };
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isLocalIso(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = LOCAL_RE.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Wall-clock "YYYY-MM-DDTHH:mm" in tz to a real instant (epoch ms). */
export function localToEpoch(local: string, tz: string): number {
  const m = LOCAL_RE.exec(local);
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += target - shown;
  }
  return guess;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function epochToLocal(epoch: number, tz: string): string {
  const p = zonedParts(epoch, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export function dowOfLocal(local: string): number {
  const m = LOCAL_RE.exec(local) ?? /^(\d{4})-(\d{2})-(\d{2})/.exec(local);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** "Fri, Sep 25 · 6:00 PM" */
export function formatWhen(local: string | null): string {
  if (!local || !isLocalIso(local)) return "No pickup time";
  const m = LOCAL_RE.exec(local)!;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
  const day = t.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const time = t.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** Calendar for the prompt, so the model copies dates instead of working them out. */
export function dateTable(now: number, tz: string, days = 21): string {
  const p = zonedParts(now, tz);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const name = DAYN[t.getUTCDay()]!;
    const label = t.toLocaleDateString("en-CA", { timeZone: "UTC", month: "long", day: "numeric" });
    const iso = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    out.push(`${i === 0 ? "today " : i === 1 ? "tomorrow " : ""}${name} ${label} = ${iso}`);
  }
  return out.join("\n");
}

/** Next calendar date (YYYY-MM-DD) that falls on this weekday, today included. */
export function nextDateForDow(now: number, tz: string, dow: number): string {
  const p = zonedParts(now, tz);
  for (let i = 0; i < 7; i++) {
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    if (t.getUTCDay() === dow) return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function dayLabel(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
