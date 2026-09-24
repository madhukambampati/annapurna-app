import type { Config } from "./config.js";

/** Claude writes the words. It never decides that an order is confirmed. */
export interface Llm {
  json(system: string, user: string): Promise<unknown>;
}

export class LlmError extends Error {
  constructor(message: string, readonly code: "http" | "invalid_json" | "timeout" | "empty") {
    super(message);
  }
}

/** Pull the first JSON object out of a model reply, tolerating code fences and stray text. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  if (start < 0) throw new LlmError("no JSON object in reply", "invalid_json");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        throw new LlmError("reply JSON did not parse", "invalid_json");
      }
    }
  }
  throw new LlmError("unterminated JSON in reply", "invalid_json");
}

export class ClaudeLlm implements Llm {
  constructor(
    private readonly cfg: Pick<Config, "anthropicKey" | "anthropicModel" | "anthropicUrl" | "llmTimeoutMs">,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async json(system: string, user: string): Promise<unknown> {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.cfg.llmTimeoutMs);
      try {
        const res = await this.fetchImpl(this.cfg.anthropicUrl, {
          method: "POST",
          headers: {
            "x-api-key": this.cfg.anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.cfg.anthropicModel,
            max_tokens: 1024,
            system,
            messages: [{ role: "user", content: user }],
          }),
          signal: ctl.signal,
        });
        if (!res.ok) throw new LlmError(`Anthropic HTTP ${res.status}`, "http");
        const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        if (!text.trim()) throw new LlmError("empty reply", "empty");
        return extractJson(text);
      } catch (e) {
        last = e instanceof Error && e.name === "AbortError" ? new LlmError("timed out", "timeout") : e;
        // Only a malformed reply is worth one more try. HTTP errors and timeouts are not.
        if (!(last instanceof LlmError && (last.code === "invalid_json" || last.code === "empty"))) throw last;
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  }
}
