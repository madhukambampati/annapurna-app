import type { Config } from "./config.js";
import type { Judgment } from "./judge.js";

/**
 * Pure routing. Takes what TypeSafe said plus the state of the conversation and decides which
 * path the turn takes. Confidence gates live here so they can be tested and tuned in one place.
 */

export type Route =
  /** Read-back was confirmed. Code places the order. No model writes the confirmation. */
  | { kind: "confirm_order" }
  /** Probably a yes, but not sure enough to place the order. Ask once, plainly. */
  | { kind: "confirm_ask" }
  /** Customer wants to cancel or change a placed order. Alert Maddy. Never claim it is done. */
  | { kind: "cancel_placed" }
  /** Payment, delivery, refund, allergy, custom. Claude words a holding reply, Maddy is alerted. */
  | { kind: "owner_topic" }
  /** Unsure what the customer means. Claude asks one short question. */
  | { kind: "clarify"; hint: string }
  /** Ordinary order or question. Claude handles it, code checks the result. freeze = the customer only asked a question, so the order draft must not change. */
  | { kind: "normal"; freeze?: boolean };

export interface RouteState {
  awaitingConfirmation: boolean;
  /** The current draft matches the read-back that was shown. */
  readbackCurrent: boolean;
  hasPlacedOrder: boolean;
}

export function route(j: Judgment, st: RouteState, th: Config["thresholds"]): Route {
  if (st.awaitingConfirmation && st.readbackCurrent && j.agrees !== null && j.cancelPlaced < th.cancel) {
    if (j.agrees >= th.confirm) return { kind: "confirm_order" };
    if (j.agrees >= th.confirmMaybe) return { kind: "confirm_ask" };
  }
  if (st.hasPlacedOrder && j.cancelPlaced >= th.cancel) return { kind: "cancel_placed" };
  if (st.hasPlacedOrder && j.cancelPlaced >= th.cancelMaybe) {
    return { kind: "clarify", hint: "The customer may want to cancel or change an order that is already placed. Ask which they mean. Do not say anything is cancelled or changed." };
  }
  const trusted = j.intent.prob >= th.intentProb;
  if (trusted && j.intent.label === "owner_topic") return { kind: "owner_topic" };
  if (!trusted || j.intent.label === "other") {
    return { kind: "clarify", hint: "It is not clear what the customer wants. Ask one short, friendly question. Do not change the order draft." };
  }
  if (j.intent.label === "question" || j.intent.label === "smalltalk") return { kind: "normal", freeze: true };
  return { kind: "normal" };
}
