import type { Config } from "./config.js";

/**
 * TypeSafe (System One / Jev) answers small typed questions about each customer message.
 * The judgments are used only for routing. They never write a reply and never touch the order.
 */

export type Intent = "order" | "question" | "owner_topic" | "smalltalk" | "other";

export interface TurnContext {
  lastShopMessage: string | null;
  message: string;
  /** The shop has read an order back and is waiting for a yes. */
  awaitingConfirmation: boolean;
  /** The customer has an order that is already placed. */
  hasPlacedOrder: boolean;
}

export interface Judgment {
  intent: { label: Intent; prob: number; confidence: number };
  /** 0..1 that the customer asks to cancel, change or refund an order that is already placed. */
  cancelPlaced: number;
  /** 0..1 that the customer clearly said yes to the read-back. null when not asked. */
  agrees: number | null;
  source: "typesafe" | "heuristic";
}

export interface Judge {
  judge(ctx: TurnContext): Promise<Judgment>;
}

/* ---------- TypeSafe ---------- */

interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
interface NoulAnswer {
  type: "noul";
  noul: number;
}
interface SystemOneResponse {
  model?: string;
  answers: Record<string, ChoiceAnswer | NoulAnswer>;
}

const INTENTS: Intent[] = ["order", "question", "owner_topic", "smalltalk", "other"];

export function buildState(ctx: TurnContext): string {
  const status = ctx.awaitingConfirmation
    ? "The shop has just read an order summary back to the customer and is waiting for them to say yes."
    : ctx.hasPlacedOrder
      ? "The customer already has an order placed with the shop."
      : "There is no order yet.";
  return [
    `Shop's previous message: ${ctx.lastShopMessage ? JSON.stringify(ctx.lastShopMessage) : "(none, this is the first message)"}`,
    `Customer's new message: ${JSON.stringify(ctx.message)}`,
    `Situation: ${status}`,
  ].join("\n");
}

export function buildQuestions(ctx: TurnContext): Record<string, unknown> {
  const q: Record<string, unknown> = {
    intent: {
      type: "choice",
      instructions:
        "What is the customer's new message mainly about? A home kitchen sells combos, weekly meal plans and weekend deals for pickup.",
      criteria: {
        order: "Wants to order food, or is adding to, removing from or changing an order that is still being put together (items, quantity, pickup day or time, name).",
        question: "Asks about the menu, prices, what is included, opening days, location or pickup, without ordering yet.",
        owner_topic: "Asks about payment, delivery, refunds, allergies or dietary needs, custom dishes, bulk orders or catering (but NOT spice level or small tweaks like less spicy, medium spice, no onion, which are normal order details), or complains about food.",
        smalltalk: "Greeting, thanks or a friendly message that needs no action.",
        other: "Anything else, or the meaning is unclear.",
      },
    },
    cancels_placed_order: {
      type: "noul",
      instructions:
        "The customer asks to cancel, change or get a refund for an order that was ALREADY placed and confirmed. Editing an order that is still being put together does not count.",
    },
  };
  if (ctx.awaitingConfirmation) {
    q.agrees_to_summary = {
      type: "noul",
      instructions:
        "The customer's new message clearly says yes to the order summary the shop just sent, with no change, question or condition attached.",
    };
  }
  return q;
}

export class TypeSafeJudge implements Judge {
  constructor(
    private readonly cfg: Pick<Config, "typesafeKey" | "typesafeUrl" | "typesafeModel" | "judgeTimeoutMs">,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async judge(ctx: TurnContext): Promise<Judgment> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.judgeTimeoutMs);
    try {
      const res = await this.fetchImpl(this.cfg.typesafeUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.typesafeKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.cfg.typesafeModel, state: buildState(ctx), questions: buildQuestions(ctx) }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`TypeSafe HTTP ${res.status}`);
      return parseResponse((await res.json()) as SystemOneResponse, ctx);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseResponse(r: SystemOneResponse, ctx: TurnContext): Judgment {
  const a = r?.answers;
  const intent = a?.intent;
  const cancel = a?.cancels_placed_order;
  if (!intent || intent.type !== "choice" || !cancel || cancel.type !== "noul") throw new Error("TypeSafe response missing answers");
  const label = INTENTS.includes(intent.choice as Intent) ? (intent.choice as Intent) : "other";
  const prob = Number(intent.probabilities?.[intent.choice] ?? 0);
  const agree = a?.agrees_to_summary;
  return {
    intent: { label, prob, confidence: Number(intent.confidence ?? 0) },
    cancelPlaced: Number(cancel.noul),
    agrees: ctx.awaitingConfirmation && agree && agree.type === "noul" ? Number(agree.noul) : null,
    source: "typesafe",
  };
}

/* ---------- offline fallback ---------- */

const YES = /^(y|yes|yep|yeah|yup|ya|ok|okay|k|confirm|confirmed|sure|done|correct|right|go ahead|proceed|please confirm|yes please|yes confirm|avunu|avnu|sare|sarey|ok sir|okay sir)$/i;
const BLOCKERS = /\b(no|not|don'?t|dont|but|wait|change|instead|actually|cancel|however|only|except|without)\b/i;
const CANCEL = /\b(cancel|cancellation|refund|raddu|don'?t want (it|this|the order)|no longer)\b|change (my|the) order/i;
const OWNER = /\b(pay|payment|e-?transfer|interac|cash|deliver|delivery|refund|allerg\w*|gluten|nuts?|jain|vegan|custom|catering|bulk|party|complain\w*|stale|cold)\b/i;
const QUESTION = /\b(menu|price|prices|cost|how much|what|what'?s|whats|which|when|where|address|timing|timings|hours|entha|undi|unda|ela|include\w*|see|show|share|tell me|details?|info|explain|describe|list)\b|\?/i;
const ORDER_WORDS = /\b(order|buy|book|place|i'?ll (have|take)|i will (have|take)|get me)\b/i;
const HELLO = /^(hi|hii+|hello|hey|namaste|namaskaram|thanks|thank you|thx|ok thanks|good (morning|evening)|(ok|okay|great|cool|nice|fine|alright|perfect|awesome|super|got it|noted)( (great|thanks|thank you|nice|cool|perfect))?)\b[\s!.]*$/i;
const ALREADY = /\balready\b.*\b(confirm\w*|order\w*|plac\w*|paid|done)\b|\b(order|it) (is|was|has been) (confirmed|placed|done)\b/i;

/** Simple rules. Used when there is no TypeSafe key or TypeSafe is down. Deliberately cautious. */
export class HeuristicJudge implements Judge {
  async judge(ctx: TurnContext): Promise<Judgment> {
    const text = ctx.message.trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    const yes = words <= 5 && YES.test(text.replace(/[!.\s]+$/g, "")) && !BLOCKERS.test(text);
    let label: Intent = "order";
    let prob = 0.6;
    if (HELLO.test(text) || (ALREADY.test(text) && !ctx.awaitingConfirmation)) [label, prob] = ["smalltalk", 0.85];
    else if (OWNER.test(text)) [label, prob] = ["owner_topic", 0.75];
    else if (QUESTION.test(text) && !/\d/.test(text) && !ORDER_WORDS.test(text)) [label, prob] = ["question", 0.75];
    else if (ctx.awaitingConfirmation && yes) [label, prob] = ["order", 0.9];
    return {
      intent: { label, prob, confidence: prob - 0.1 },
      cancelPlaced: CANCEL.test(text) && ctx.hasPlacedOrder ? 0.85 : CANCEL.test(text) ? 0.4 : 0.05,
      agrees: ctx.awaitingConfirmation ? (yes ? 0.95 : 0.05) : null,
      source: "heuristic",
    };
  }
}

/** TypeSafe first, heuristic if it errors or times out. */
export class FallbackJudge implements Judge {
  constructor(
    private readonly primary: Judge,
    private readonly fallback: Judge,
    private readonly onError: (e: unknown) => void = () => {},
  ) {}
  async judge(ctx: TurnContext): Promise<Judgment> {
    try {
      return await this.primary.judge(ctx);
    } catch (e) {
      this.onError(e);
      return this.fallback.judge(ctx);
    }
  }
}
