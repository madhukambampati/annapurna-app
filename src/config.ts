export interface Config {
  port: number;
  dbPath: string;
  ownerToken: string;
  anthropicKey: string;
  anthropicModel: string;
  anthropicUrl: string;
  llmTimeoutMs: number;
  typesafeKey: string;
  typesafeUrl: string;
  typesafeModel: string;
  judgeTimeoutMs: number;
  notifyUrl: string;
  /** Developer chat at /sim/*, no login. Keep OFF on a public server. */
  simulator: boolean;
  /** Public customer website chat at / and /web/*. */
  web: {
    enabled: boolean;
    /** How many reverse proxies sit in front (Fly, Render, Caddy = 1). Used to read the client IP. 0 = no proxy. */
    proxyHops: number;
    /** New chat sessions per IP per hour. */
    sessionsPerIpHour: number;
    /** Messages per customer per minute / per day. */
    msgPerMinute: number;
    msgPerDay: number;
    /** All customers together per day. Hard stop on the Claude bill. */
    globalPerDay: number;
    /** Sessions expire after this many days without use. */
    sessionDays: number;
  };
  /** Routing thresholds. See README, "How routing works". */
  thresholds: {
    /** Top intent probability needed to trust the intent label. */
    intentProb: number;
    /** Noul value at or above which the customer is treated as cancelling a placed order. */
    cancel: number;
    /** Noul value below which cancel is treated as "maybe" and a question is asked. */
    cancelMaybe: number;
    /** Noul value needed to place an order automatically after the read-back. */
    confirm: number;
    /** Noul value at or above which we ask "shall I place it?" instead of guessing. */
    confirmMaybe: number;
    /** After this many unclear turns in a row Maddy is alerted. */
    unclearStreak: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    port: num(env.PORT, 3000),
    dbPath: env.DB_PATH || "annapurna.db",
    ownerToken: env.OWNER_TOKEN || "",
    anthropicKey: env.ANTHROPIC_API_KEY || "",
    anthropicModel: env.CLAUDE_MODEL || "claude-sonnet-5",
    anthropicUrl: env.ANTHROPIC_URL || "https://api.anthropic.com/v1/messages",
    llmTimeoutMs: num(env.LLM_TIMEOUT_MS, 30000),
    typesafeKey: env.TYPESAFE_API_KEY || "",
    typesafeUrl: env.TYPESAFE_URL || "https://api.typesafe.ai/v1/systemone",
    typesafeModel: env.TYPESAFE_MODEL || "jev-latest",
    judgeTimeoutMs: num(env.JUDGE_TIMEOUT_MS, 8000),
    notifyUrl: env.NOTIFY_URL || "",
    simulator: env.SIMULATOR === "on",
    web: {
      enabled: env.WEB !== "off",
      proxyHops: num(env.PROXY_HOPS, 0),
      sessionsPerIpHour: num(env.WEB_SESSIONS_PER_IP_HOUR, 6),
      msgPerMinute: num(env.WEB_MSG_PER_MINUTE, 8),
      msgPerDay: num(env.WEB_MSG_PER_DAY, 80),
      globalPerDay: num(env.WEB_GLOBAL_PER_DAY, 1500),
      sessionDays: num(env.WEB_SESSION_DAYS, 60),
    },
    thresholds: {
      intentProb: num(env.TH_INTENT_PROB, 0.6),
      cancel: num(env.TH_CANCEL, 0.6),
      cancelMaybe: num(env.TH_CANCEL_MAYBE, 0.3),
      confirm: num(env.TH_CONFIRM, 0.9),
      confirmMaybe: num(env.TH_CONFIRM_MAYBE, 0.5),
      unclearStreak: num(env.TH_UNCLEAR_STREAK, 2),
    },
  };
}
