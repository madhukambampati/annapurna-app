/**
 * Small in-memory fixed-window rate limiter. Enough for one server process.
 * If this ever runs on several servers, move the counters to a shared store.
 */
export interface HitResult {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when ok is false. */
  retryAfter: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now, private readonly maxKeys = 50_000) {}

  /** Count one hit for key. Returns ok=false once the window's limit is passed. */
  hit(key: string, limit: number, windowMs: number): HitResult {
    const t = this.now();
    this.sweep(t);
    let e = this.hits.get(key);
    if (!e || e.resetAt <= t) {
      if (!e && this.hits.size >= this.maxKeys) return { ok: false, retryAfter: 60 }; // under attack: refuse new keys
      e = { count: 0, resetAt: t + windowMs };
      this.hits.set(key, e);
    }
    e.count++;
    return { ok: e.count <= limit, retryAfter: Math.max(1, Math.ceil((e.resetAt - t) / 1000)) };
  }

  /** Check without counting. */
  peek(key: string, limit: number): boolean {
    const e = this.hits.get(key);
    return !e || e.resetAt <= this.now() || e.count < limit;
  }

  private sweep(t: number): void {
    if (t - this.lastSweep < 60_000) return;
    this.lastSweep = t;
    for (const [k, e] of this.hits) if (e.resetAt <= t) this.hits.delete(k);
  }
}
