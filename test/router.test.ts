import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { route } from "../src/router.js";
import { judgment } from "./helpers.js";

const th = loadConfig({}).thresholds;
const base = { awaitingConfirmation: false, readbackCurrent: false, hasPlacedOrder: false };
const awaiting = { awaitingConfirmation: true, readbackCurrent: true, hasPlacedOrder: false };

test("confidence gates for confirming an order", () => {
  assert.equal(route(judgment({ agrees: 0.97 }), awaiting, th).kind, "confirm_order");
  assert.equal(route(judgment({ agrees: 0.9 }), awaiting, th).kind, "confirm_order"); // boundary is inclusive
  assert.equal(route(judgment({ agrees: 0.89 }), awaiting, th).kind, "confirm_ask");
  assert.equal(route(judgment({ agrees: 0.5 }), awaiting, th).kind, "confirm_ask");
  assert.equal(route(judgment({ agrees: 0.49 }), awaiting, th).kind, "normal");
});

test("a yes never places an order unless the read-back is still current", () => {
  assert.equal(route(judgment({ agrees: 0.99 }), { ...awaiting, readbackCurrent: false }, th).kind, "normal");
  assert.equal(route(judgment({ agrees: 0.99 }), base, th).kind, "normal");
  assert.equal(route(judgment({ agrees: null }), awaiting, th).kind, "normal");
});

test("a yes that also looks like a cancel is not treated as a confirmation", () => {
  assert.notEqual(route(judgment({ agrees: 0.95, cancelPlaced: 0.8 }), awaiting, th).kind, "confirm_order");
});

test("cancel or change of a placed order goes to Maddy, with a question when unsure", () => {
  const placed = { ...base, hasPlacedOrder: true };
  assert.equal(route(judgment({ cancelPlaced: 0.95 }), placed, th).kind, "cancel_placed");
  assert.equal(route(judgment({ cancelPlaced: 0.6 }), placed, th).kind, "cancel_placed");
  assert.equal(route(judgment({ cancelPlaced: 0.45 }), placed, th).kind, "clarify");
  assert.equal(route(judgment({ cancelPlaced: 0.1 }), placed, th).kind, "normal");
  // With nothing placed there is nothing to cancel: normal chat.
  assert.equal(route(judgment({ cancelPlaced: 0.95 }), base, th).kind, "normal");
});

test("owner topics and unclear turns", () => {
  assert.equal(route(judgment({ intent: { label: "owner_topic", prob: 0.8, confidence: 0.7 } }), base, th).kind, "owner_topic");
  assert.equal(route(judgment({ intent: { label: "owner_topic", prob: 0.4, confidence: 0.3 } }), base, th).kind, "clarify");
  assert.equal(route(judgment({ intent: { label: "other", prob: 0.9, confidence: 0.9 } }), base, th).kind, "clarify");
  assert.equal(route(judgment({ intent: { label: "question", prob: 0.7, confidence: 0.6 } }), base, th).kind, "normal");
  assert.equal(route(judgment({ intent: { label: "smalltalk", prob: 0.9, confidence: 0.8 } }), base, th).kind, "normal");
});

test("thresholds come from config", () => {
  const strict = loadConfig({ TH_CONFIRM: "0.99" }).thresholds;
  assert.equal(route(judgment({ agrees: 0.95 }), awaiting, strict).kind, "confirm_ask");
});

test("questions and small talk freeze the order draft; real orders do not", () => {
  const q = route(judgment({ intent: { label: "question", prob: 0.9, confidence: 0.8 } }), base, th);
  assert.deepEqual(q, { kind: "normal", freeze: true });
  assert.deepEqual(route(judgment({ intent: { label: "smalltalk", prob: 0.9, confidence: 0.8 } }), base, th), { kind: "normal", freeze: true });
  assert.deepEqual(route(judgment(), base, th), { kind: "normal" });
});
