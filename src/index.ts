import { Agent } from "./agent.js";
import { loadConfig } from "./config.js";
import { FallbackJudge, HeuristicJudge, TypeSafeJudge, type Judge } from "./judge.js";
import { ClaudeLlm, type Llm } from "./llm.js";
import { ConsoleNotifier, WebhookNotifier } from "./notify.js";
import { createServer } from "./server.js";
import { Store } from "./store.js";

const cfg = loadConfig();

// The website is public, so the owner desk must never be open. Dev override: ALLOW_OPEN_DESK=yes.
if (cfg.web.enabled && !cfg.ownerToken && process.env.ALLOW_OPEN_DESK !== "yes") {
  console.error("Refusing to start: OWNER_TOKEN is not set, so anyone could open your order desk.");
  console.error("Set OWNER_TOKEN to a long random string (openssl rand -hex 24). For local testing only: ALLOW_OPEN_DESK=yes");
  process.exit(1);
}
if (cfg.ownerToken && cfg.ownerToken.length < 16) {
  console.error("Refusing to start: OWNER_TOKEN is too short (use at least 16 characters).");
  process.exit(1);
}
const store = new Store(cfg.dbPath);

const judge: Judge = cfg.typesafeKey
  ? new FallbackJudge(new TypeSafeJudge(cfg), new HeuristicJudge(), (e) => console.error("TypeSafe failed, using rules for this turn:", e instanceof Error ? e.message : e))
  : new HeuristicJudge();

const llm: Llm = cfg.anthropicKey
  ? new ClaudeLlm(cfg)
  : {
      async json() {
        throw new Error("ANTHROPIC_API_KEY is not set");
      },
    };

const agent = new Agent({ store, judge, llm, cfg, notifier: cfg.notifyUrl ? new WebhookNotifier(cfg.notifyUrl) : new ConsoleNotifier() });
const server = createServer({ agent, store, cfg });

server.listen(cfg.port, () => {
  console.log(`Annapurna order agent on http://localhost:${cfg.port}`);
  console.log(`  Customer site  : ${cfg.web.enabled ? "on at /  (chat, menu, orders)" : "off (WEB=off)"}`);
  console.log(`  Owner desk     : /desk  ${cfg.ownerToken ? "(protected by OWNER_TOKEN)" : "(OPEN, dev override)"}`);
  console.log(`  Claude replies : ${cfg.anthropicKey ? `on (${cfg.anthropicModel})` : "OFF, set ANTHROPIC_API_KEY"}`);
  console.log(`  Judgment       : ${cfg.typesafeKey ? `TypeSafe (${cfg.typesafeModel}), rules as fallback` : "rules only (set TYPESAFE_API_KEY to use TypeSafe)"}`);
  console.log(`  Client IP      : ${cfg.web.proxyHops > 0 ? `from X-Forwarded-For, ${cfg.web.proxyHops} proxy hop(s)` : "direct connection (set PROXY_HOPS behind a host proxy, see DEPLOY.md, or rate limits see one IP)"}`);
  console.log(`  Limits         : ${cfg.web.msgPerMinute}/min and ${cfg.web.msgPerDay}/day per customer, ${cfg.web.globalPerDay}/day for everyone`);
  console.log(`  Simulator      : ${cfg.simulator ? "ON (no login, do not use on a public server)" : "off"}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
