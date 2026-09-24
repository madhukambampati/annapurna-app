import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { buildQuestions, buildState, FallbackJudge, HeuristicJudge, parseResponse, TypeSafeJudge, type TurnContext } from "../src/judge.js";
import { ClaudeLlm, extractJson, LlmError } from "../src/llm.js";

const ctx = (o: Partial<TurnContext> = {}): TurnContext => ({ lastShopMessage: "Hi!", message: "yes", awaitingConfirmation: false, hasPlacedOrder: false, ...o });

/* ---------- extractJson ---------- */

test("extractJson handles plain, fenced, wrapped and brace-in-string replies", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go:\n{"a":{"b":"x } y"}} thanks'), { a: { b: "x } y" } });
  assert.throws(() => extractJson("no json here"), (e: unknown) => e instanceof LlmError && e.code === "invalid_json");
  assert.throws(() => extractJson('{"a":'), (e: unknown) => e instanceof LlmError);
});

/* ---------- Claude client ---------- */

function fakeFetch(responses: Array<{ status?: number; body?: unknown } | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("unexpected extra call");
    if (r instanceof Error) throw r;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const anth = (text: string) => ({ body: { content: [{ type: "text", text }] } });
const cfg = { ...loadConfig({ ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "m1" }), llmTimeoutMs: 500 };

test("ClaudeLlm sends the right request and parses the reply", async () => {
  const f = fakeFetch([anth('{"reply":"hi"}')]);
  const out = await new ClaudeLlm(cfg, f.fn).json("SYS", "USER");
  assert.deepEqual(out, { reply: "hi" });
  const c = f.calls[0]!;
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  const h = c.init.headers as Record<string, string>;
  assert.equal(h["x-api-key"], "k");
  assert.equal(h["anthropic-version"], "2023-06-01");
  const body = JSON.parse(String(c.init.body));
  assert.equal(body.model, "m1");
  assert.equal(body.system, "SYS");
  assert.deepEqual(body.messages, [{ role: "user", content: "USER" }]);
});

test("ClaudeLlm retries once on a malformed reply, not on HTTP errors", async () => {
  const f1 = fakeFetch([anth("sorry, no json"), anth('{"ok":true}')]);
  assert.deepEqual(await new ClaudeLlm(cfg, f1.fn).json("s", "u"), { ok: true });
  assert.equal(f1.calls.length, 2);

  const f2 = fakeFetch([{ status: 529, body: {} }, anth("{}")]);
  await assert.rejects(new ClaudeLlm(cfg, f2.fn).json("s", "u"), (e: unknown) => e instanceof LlmError && e.code === "http");
  assert.equal(f2.calls.length, 1);

  const f3 = fakeFetch([anth("bad"), anth("still bad")]);
  await assert.rejects(new ClaudeLlm(cfg, f3.fn).json("s", "u"), (e: unknown) => e instanceof LlmError && e.code === "invalid_json");
  assert.equal(f3.calls.length, 2);
});

test("ClaudeLlm times out", async () => {
  const slow = ((_u: string, init: RequestInit) =>
    new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch;
  await assert.rejects(new ClaudeLlm({ ...cfg, llmTimeoutMs: 30 }, slow).json("s", "u"), (e: unknown) => e instanceof LlmError && e.code === "timeout");
});

/* ---------- TypeSafe ---------- */

const tsCfg = { ...loadConfig({ TYPESAFE_API_KEY: "tk" }), judgeTimeoutMs: 500 };
const tsAnswer = (extra: Record<string, unknown> = {}) => ({
  body: {
    model: "jev-1.13.0",
    answers: {
      intent: { type: "choice", choice: "order", confidence: 0.8, probabilities: { order: 0.9, question: 0.05, owner_topic: 0.03, smalltalk: 0.01, other: 0.01 } },
      cancels_placed_order: { type: "noul", noul: 0.04 },
      ...extra,
    },
  },
});

test("TypeSafe request: endpoint, auth, model, state, and only asks 'agrees' while awaiting confirmation", async () => {
  const f = fakeFetch([tsAnswer(), tsAnswer({ agrees_to_summary: { type: "noul", noul: 0.97 } })]);
  const judge = new TypeSafeJudge(tsCfg, f.fn);

  const a = await judge.judge(ctx({ message: "2 kheema fry please" }));
  assert.equal(a.agrees, null);
  const b1 = JSON.parse(String(f.calls[0]!.init.body));
  assert.equal(f.calls[0]!.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal((f.calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer tk");
  assert.equal(b1.model, "jev-latest");
  assert.deepEqual(Object.keys(b1.questions).sort(), ["cancels_placed_order", "intent"]);
  assert.equal(b1.questions.intent.type, "choice");
  assert.equal(b1.questions.cancels_placed_order.type, "noul");
  assert.match(b1.state, /Customer's new message: "2 kheema fry please"/);

  const b = await judge.judge(ctx({ awaitingConfirmation: true }));
  assert.equal(b.agrees, 0.97);
  const b2 = JSON.parse(String(f.calls[1]!.init.body));
  assert.deepEqual(Object.keys(b2.questions).sort(), ["agrees_to_summary", "cancels_placed_order", "intent"]);
  assert.match(b2.state, /waiting for them to say yes/);
});

test("TypeSafe response is mapped to a Judgment", () => {
  const j = parseResponse(tsAnswer().body as never, ctx());
  assert.deepEqual(j.intent, { label: "order", prob: 0.9, confidence: 0.8 });
  assert.equal(j.cancelPlaced, 0.04);
  assert.equal(j.source, "typesafe");
  // An unknown label collapses to "other" rather than being trusted.
  const weird = tsAnswer();
  (weird.body.answers.intent as { choice: string }).choice = "made_up";
  assert.equal(parseResponse(weird.body as never, ctx()).intent.label, "other");
  assert.throws(() => parseResponse({ answers: {} } as never, ctx()));
});

test("question and state builders never leak more than the last two messages", () => {
  const s = buildState(ctx({ lastShopMessage: 'He said "hi"', message: "ok" }));
  assert.match(s, /He said \\"hi\\"/); // quoted safely
  assert.equal(Object.keys(buildQuestions(ctx())).length, 2);
});

test("FallbackJudge uses the rules when TypeSafe errors or returns junk", async () => {
  const errors: unknown[] = [];
  const f = fakeFetch([{ status: 500, body: {} }, { body: { answers: {} } }]);
  const judge = new FallbackJudge(new TypeSafeJudge(tsCfg, f.fn), new HeuristicJudge(), (e) => errors.push(e));
  const a = await judge.judge(ctx({ message: "yes", awaitingConfirmation: true }));
  assert.equal(a.source, "heuristic");
  assert.equal(a.agrees, 0.95);
  const b = await judge.judge(ctx({ message: "hello" }));
  assert.equal(b.source, "heuristic");
  assert.equal(errors.length, 2);
});

/* ---------- heuristic rules ---------- */

test("HeuristicJudge: yes only counts when it is a plain yes", async () => {
  const j = new HeuristicJudge();
  const aw = (message: string) => j.judge(ctx({ message, awaitingConfirmation: true }));
  for (const yes of ["yes", "Yes!", "ok", "Okay", "confirm", "avunu", "sare", "yes please"]) assert.ok((await aw(yes)).agrees! >= 0.9, yes);
  for (const no of ["yes but make it 3", "no", "not yet", "wait change the time", "yes, and also add raita", "ok but pickup at 7"]) assert.ok((await aw(no)).agrees! < 0.5, no);
  assert.equal((await j.judge(ctx({ message: "yes" }))).agrees, null);
});

test("HeuristicJudge: cancel, owner topics, questions, greetings", async () => {
  const j = new HeuristicJudge();
  assert.ok((await j.judge(ctx({ message: "please cancel my order", hasPlacedOrder: true }))).cancelPlaced >= 0.6);
  assert.ok((await j.judge(ctx({ message: "please cancel my order", hasPlacedOrder: false }))).cancelPlaced < 0.6);
  assert.equal((await j.judge(ctx({ message: "do you deliver to Waterloo?" }))).intent.label, "owner_topic");
  assert.equal((await j.judge(ctx({ message: "I have a nut allergy" }))).intent.label, "owner_topic");
  assert.equal((await j.judge(ctx({ message: "what's on the menu?" }))).intent.label, "question");
  assert.equal((await j.judge(ctx({ message: "Hi" }))).intent.label, "smalltalk");
  assert.equal((await j.judge(ctx({ message: "2 kheema fry friday 6pm" }))).intent.label, "order");
});

test("HeuristicJudge: 'I want to see ...' and 'Whats on Monday' are questions, real orders are not", async () => {
  const j = new HeuristicJudge();
  const ctx = (message: string) => ({ message, awaitingConfirmation: false, hasPlacedOrder: false } as unknown as TurnContext);
  for (const q of [
    "I want to see the Full meal Plan Whats on Monday Tuesday like that",
    "I want to see your Full Menu Can you share me thoose detailds",
    "show me the menu",
    "what's in the weekly plan",
  ]) assert.equal((await j.judge(ctx(q))).intent.label, "question", q);
  for (const o of ["I want to order the full meal plan", "1 kheema fry combo friday 6pm", "I'll take the breakfast plan", "can I order a combo?"]) {
    assert.equal((await j.judge(ctx(o))).intent.label, "order", o);
  }
});

test("HeuristicJudge: acknowledgements and 'already confirmed' are small talk, not new orders", async () => {
  const j = new HeuristicJudge();
  const ctx = (message: string, awaitingConfirmation = false) => ({ message, awaitingConfirmation, hasPlacedOrder: true } as unknown as TurnContext);
  for (const m of ["Ok great", "okay", "great", "I have already confirmed my order", "it is already confirmed"]) {
    assert.equal((await j.judge(ctx(m))).intent.label, "smalltalk", m);
  }
  // while a read-back is waiting, "ok" is still a yes
  assert.ok((await j.judge(ctx("ok", true))).agrees! >= 0.9);
});

test("HeuristicJudge: spice level and small tweaks are ordinary order turns", async () => {
  const j = new HeuristicJudge();
  for (const m of ["medium spice", "less spicy please", "regular", "no onion and less oil"]) {
    const r = await j.judge({ message: m, awaitingConfirmation: false, hasPlacedOrder: false } as TurnContext);
    assert.equal(r.intent.label, "order", m);
  }
});
