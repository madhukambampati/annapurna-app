import { Agent } from "../src/agent.js";
import { loadConfig } from "../src/config.js";
import type { Judge, Judgment, TurnContext } from "../src/judge.js";
import type { Llm } from "../src/llm.js";
import { MemoryNotifier } from "../src/notify.js";
import { Store } from "../src/store.js";
import { localToEpoch } from "../src/time.js";

export const TZ = "America/Toronto";
/** Wednesday 2026-09-23, noon in Kitchener. Friday is 2026-09-25, Saturday 2026-09-26. */
export const NOW = localToEpoch("2026-09-23T12:00", TZ);
export const FRI_6PM = "2026-09-25T18:00";

export type JudgeFn = (ctx: TurnContext) => Partial<Judgment> | Promise<Partial<Judgment>>;

export function judgment(over: Partial<Judgment> = {}, ctx?: TurnContext): Judgment {
  return {
    intent: { label: "order", prob: 0.95, confidence: 0.9 },
    cancelPlaced: 0.02,
    agrees: ctx?.awaitingConfirmation ? 0.03 : null,
    source: "typesafe",
    ...over,
  };
}

export class FakeJudge implements Judge {
  calls: TurnContext[] = [];
  constructor(public fn: JudgeFn = () => ({})) {}
  async judge(ctx: TurnContext): Promise<Judgment> {
    this.calls.push(ctx);
    return judgment(await this.fn(ctx), ctx);
  }
}

export class ScriptedLlm implements Llm {
  prompts: string[] = [];
  private queue: Array<unknown | Error | ((prompt: string) => unknown)> = [];
  delayMs = 0;
  push(...r: Array<unknown | Error | ((prompt: string) => unknown)>): this {
    this.queue.push(...r);
    return this;
  }
  async json(_system: string, user: string): Promise<unknown> {
    this.prompts.push(user);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const next = this.queue.shift();
    if (next === undefined) throw new Error("ScriptedLlm: no more replies queued");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? (next as (p: string) => unknown)(user) : next;
  }
}

export interface ModelReplyOpts {
  reply?: string;
  items?: Array<{ id: string; qty: number; pack?: string; asked_for?: string }>;
  pickup?: string | null;
  name?: string | null;
  notes?: string;
  stage?: string;
  needs_owner?: boolean;
  owner_note?: string;
}

/** A model reply in the JSON contract. */
export function modelReply(o: ModelReplyOpts = {}): unknown {
  return {
    reply: o.reply ?? "Sure!",
    draft: { items: o.items ?? [], pickup_local: o.pickup ?? null, customer_name: o.name ?? null, notes: o.notes ?? "" },
    stage: o.stage ?? "collecting",
    needs_owner: o.needs_owner ?? false,
    owner_note: o.owner_note ?? "",
  };
}

export function setup(opts: { judge?: JudgeFn; now?: number } = {}) {
  const store = new Store(":memory:");
  const llm = new ScriptedLlm();
  const judge = new FakeJudge(opts.judge);
  const notifier = new MemoryNotifier();
  const cfg = loadConfig({});
  let now = opts.now ?? NOW;
  const agent = new Agent({ store, judge, llm, notifier, cfg, now: () => now });
  return {
    store, llm, judge, notifier, cfg, agent,
    setNow: (t: number) => { now = t; },
    say: (text: string, from = "+15195550101", extra: { name?: string; messageId?: string } = {}) => agent.handle({ from, text, ...extra }),
  };
}
