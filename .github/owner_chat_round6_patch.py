from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"already fixed: {label}")
        return text
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    print(f"fixed: {label}")
    return text.replace(old, new, 1)

# ---------------- public/desk.js ----------------
p = Path("public/desk.js")
s = p.read_text()

start = s.index("function renderChats() {")
end = s.index("\n\n/* ---------- cook ---------- */", start)
old = s[start:end]
new = r'''function closeChat() {
  chat = { waId: "", messages: [], customer: null };
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function customerOrderBadge(waId) {
  const order = state.orders
    .filter((o) => o.waId === waId && o.status !== "cancelled")
    .sort((a, b) => b.id - a.id)[0];
  if (!order) return null;
  const labels = { hold: "Needs review", cook: "Confirmed", ready: "Ready", done: "Picked up" };
  return { id: order.id, status: order.status, label: labels[order.status] || order.status };
}

function renderChats() {
  const title = h("div", { class: "owner-page-title chat-title" },
    h("div", {}, h("h2", {}, "Customer chats"), h("p", { class: "sub" }, "Read conversations and reply as Annapurna.")),
    h("span", { class: "lane-count" }, String(state.customers.length)));

  const list = h("div", { class: "clist" },
    state.customers.length ? state.customers.map((c) => {
      const order = customerOrderBadge(c.waId);
      const last = c.last || null;
      return h("button", { class: "crow", "aria-current": String(c.waId === chat.waId), onclick: () => openChat(c.waId) },
        h("span", { class: "crow-top" },
          h("b", {}, c.name || "Customer"),
          last ? h("time", {}, timeOf(last.ts)) : null),
        h("small", { class: "crow-contact" }, c.contact || (isWeb(c.waId) ? "Website customer" : c.waId)),
        h("small", { class: "crow-preview" }, last ? last.text : "No messages yet"),
        order ? h("span", { class: "chat-order-tag status-" + order.status }, "#" + order.id + " · " + order.label) : null);
    }) : h("div", { class: "empty" }, "No chats yet."));

  let right;
  if (!chat.waId) {
    right = h("div", { class: "empty chat-empty" }, "Choose a customer to open the conversation.");
  } else {
    const currentOrder = customerOrderBadge(chat.waId);
    const customerName = chat.customer && chat.customer.name ? chat.customer.name : "Customer";
    const contact = chat.customer && chat.customer.contact ? chat.customer.contact : "";
    const initial = customerName.trim().charAt(0).toUpperCase() || "C";
    const ta = h("textarea", { placeholder: "Reply as Annapurna...", "aria-label": "Reply", maxlength: "1000", rows: "1" });
    const submit = h("button", { class: "pri chat-send", type: "submit", "aria-label": "Send reply" }, "Send");
    const form = h("form", { class: "reply chat-reply", onsubmit: (e) => {
      e.preventDefault();
      const t = ta.value;
      if (!t.trim()) return;
      ta.value = "";
      ta.style.height = "auto";
      sendReply(t);
    } }, ta, submit);
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(112, ta.scrollHeight) + "px";
    });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

    const head = h("header", { class: "chat-thread-head" },
      h("button", { class: "chat-back", type: "button", onclick: closeChat, "aria-label": "Back to customer chats" }, "←"),
      h("span", { class: "chat-avatar", "aria-hidden": "true" }, initial),
      h("span", { class: "chat-person" },
        h("b", {}, customerName),
        contact ? h("small", {}, contact) : h("small", {}, isWeb(chat.waId) ? "Website customer" : "Test customer")),
      currentOrder ? h("span", { class: "chat-order-tag status-" + currentOrder.status }, "#" + currentOrder.id + " · " + currentOrder.label) : null);

    const messages = h("div", { class: "msgs", id: "thread", role: "log", "aria-live": "polite" },
      chat.messages.map((m) => {
        const who = m.who === "cust" ? "Customer" : m.who === "owner" ? "You" : "Annu";
        return h("div", { class: "b " + m.who },
          h("small", {}, who + " · " + timeOf(m.ts)),
          h("span", { class: "chat-message-text" }, m.text));
      }));

    right = h("div", { class: "card thread" },
      head,
      messages,
      isWeb(chat.waId)
        ? h("div", { class: "chat-compose" }, h("small", {}, "Replies appear in the customer's chat."), form)
        : h("div", { class: "chat-compose test-only" }, h("small", {}, "Test customer — replies are not delivered anywhere.")));
  }
  return [title, h("div", { class: "chatgrid" + (chat.waId ? " has-thread" : "") }, list, right)];
}'''
s = s[:start] + new + s[end:]
print("fixed: owner chat master-detail rendering")

s = replace_once(
    s,
    '$("tabs").replaceChildren(...tabs.map(([k, t]) => h("button", { role: "tab", "aria-selected": String(selected(k)), onclick: () => { tab = k; cook = null; render(); } }, t, k === "orders" && need ? h("span", { class: "badge" }, need) : null)));',
    '$("tabs").replaceChildren(...tabs.map(([k, t]) => h("button", { role: "tab", "aria-selected": String(selected(k)), onclick: () => { tab = k; cook = null; if (k === "chats") chat = { waId: "", messages: [], customer: null }; render(); } }, t, k === "orders" && need ? h("span", { class: "badge" }, need) : null)));',
    "Chats nav opens the customer list",
)

s = replace_once(
    s,
    'function render() {\n  renderTabs();',
    'function render() {\n  document.body.classList.toggle("chat-open-mobile", tab === "chats" && !!chat.waId);\n  renderTabs();',
    "toggle full-screen mobile chat mode",
)

p.write_text(s)

# ---------------- public/desk.html ----------------
p = Path("public/desk.html")
s = p.read_text()
chat_css = r'''
<style id="ownerChatMobileV2">
/* OWNER CHAT MOBILE V2 — list first, dedicated conversation second */
body.owner-mode .chatgrid{overflow:hidden}
body.owner-mode .clist{gap:7px}
body.owner-mode .crow{padding:11px 12px;text-align:left}
.crow-top{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
.crow-top b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.crow-top time{flex:none;color:var(--muted);font-size:10px;font-weight:600}
.crow-contact,.crow-preview{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crow-contact{margin-top:2px}
.crow-preview{margin-top:3px;color:var(--cream)!important;opacity:.82}
.chat-order-tag{display:inline-flex;align-items:center;max-width:100%;margin-top:7px;padding:3px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);font-size:10px;font-weight:800;white-space:nowrap}
.chat-order-tag.status-hold{color:var(--owner-orange)}
.chat-order-tag.status-cook{color:var(--owner-green-2)}
.chat-order-tag.status-ready{color:#2f8fb0}
.chat-thread-head{display:flex;align-items:center;gap:10px;min-height:58px;padding:2px 2px 10px;border-bottom:1px solid var(--line)}
.chat-back{display:none;width:38px;height:38px;padding:0;border:0!important;border-radius:50%!important;background:var(--panel2)!important;font-size:22px;line-height:1}
.chat-avatar{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:50%;background:var(--owner-green);color:#fff;font-weight:900}
.chat-person{display:flex;flex-direction:column;min-width:0;flex:1}
.chat-person b,.chat-person small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-person small{color:var(--muted);font-size:11px}
.chat-thread-head>.chat-order-tag{margin:0 0 0 auto}
body.owner-mode .thread{overflow:hidden}
body.owner-mode .thread>.msgs{padding:12px 5px;gap:9px}
body.owner-mode .thread .b{max-width:78%;padding:9px 12px;line-height:1.42;box-shadow:none}
body.owner-mode .thread .b.cust{border-radius:16px 16px 16px 5px}
body.owner-mode .thread .b.agent,body.owner-mode .thread .b.owner{border-radius:16px 16px 5px 16px}
body.owner-mode .thread .b small{margin-bottom:3px;font-size:10px;opacity:.82}
.chat-message-text{display:block}
.chat-compose{padding-top:9px;border-top:1px solid var(--line)}
.chat-compose>small{display:block;margin:0 0 5px;color:var(--muted);font-size:10px}
body.owner-mode form.chat-reply{margin:0;padding:0;border:0;align-items:flex-end}
body.owner-mode form.chat-reply textarea{min-height:44px;height:44px;max-height:112px;padding:10px 12px;border-radius:14px;line-height:1.35}
.chat-send{min-height:44px;border-radius:14px!important}

@media(max-width:760px){
  body.owner-mode .chatgrid{display:block;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
  body.owner-mode .clist{max-height:none;padding:0;border:0}
  body.owner-mode .chatgrid:not(.has-thread) .chat-empty{display:none}
  body.owner-mode .chatgrid.has-thread .clist{display:none}
  body.owner-mode .crow{min-height:76px;padding:12px 13px;border:1px solid var(--line);border-radius:15px;background:var(--panel);box-shadow:0 5px 14px rgba(30,45,35,.035)}
  body.owner-mode .crow[aria-current=true]{background:var(--panel)}

  body.owner-mode.chat-open-mobile{max-width:none;height:100dvh;margin:0;padding:0;overflow:hidden;background:var(--panel)}
  body.owner-mode.chat-open-mobile .owner-head,
  body.owner-mode.chat-open-mobile #tabs,
  body.owner-mode.chat-open-mobile .chat-title{display:none!important}
  body.owner-mode.chat-open-mobile #err{position:fixed;z-index:90;left:10px;right:10px;top:10px}
  body.owner-mode.chat-open-mobile #panel{height:100dvh;overflow:hidden}
  body.owner-mode.chat-open-mobile .chatgrid{height:100dvh;margin:0;background:var(--panel)}
  body.owner-mode.chat-open-mobile .thread{display:flex;height:100dvh;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:var(--panel);box-shadow:none}
  body.owner-mode.chat-open-mobile .chat-thread-head{flex:none;min-height:68px;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;background:var(--panel);box-shadow:0 1px 0 var(--line);z-index:2}
  body.owner-mode.chat-open-mobile .chat-back{display:inline-grid;place-items:center;flex:none}
  body.owner-mode.chat-open-mobile .chat-avatar{width:40px;height:40px}
  body.owner-mode.chat-open-mobile .chat-thread-head>.chat-order-tag{max-width:112px;overflow:hidden;text-overflow:ellipsis}
  body.owner-mode.chat-open-mobile .thread>.msgs{min-height:0;padding:14px 12px 18px;gap:10px;overscroll-behavior:contain;background:linear-gradient(180deg,color-mix(in srgb,var(--panel2) 35%,var(--panel)),var(--panel))}
  body.owner-mode.chat-open-mobile .thread .b{max-width:84%;padding:10px 12px;font-size:15px}
  body.owner-mode.chat-open-mobile .chat-compose{flex:none;padding:7px 10px calc(8px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--panel);box-shadow:0 -8px 22px rgba(20,35,26,.05)}
  body.owner-mode.chat-open-mobile .chat-compose>small{display:none}
  body.owner-mode.chat-open-mobile form.chat-reply{gap:8px}
  body.owner-mode.chat-open-mobile form.chat-reply textarea{font-size:16px}
}
</style>
'''
if 'id="ownerChatMobileV2"' not in s:
    s = s.replace("</head>", chat_css + "\n</head>", 1)
    print("fixed: owner chat responsive styling")
else:
    print("already fixed: owner chat responsive styling")
p.write_text(s)

# ---------------- public/app.js ----------------
p = Path("public/app.js")
s = p.read_text()
s = replace_once(
    s,
    'h("button", { class: "btn", type: "button", onclick: function () { send("Yes, confirm"); } }, icon("check"), "Yes, place order"),',
    'h("button", { class: "btn", type: "button", onclick: function () { send("Yes, confirm", m.id ? "confirm:" + m.id : undefined); } }, icon("check"), "Yes, place order"),',
    "confirmation uses a stable request id",
)
s = replace_once(
    s,
    'function send(text) {\n    text = (text || "").trim();',
    'function send(text, requestId) {\n    text = (text || "").trim();',
    "send accepts request id",
)
s = replace_once(
    s,
    'api("POST", "/web/message", { text: text }).then(function (j) {',
    'api("POST", "/web/message", { text: text, requestId: requestId || undefined }).then(function (j) {',
    "send request id to server",
)
s = replace_once(
    s,
    'function setBusy(b) {\n    busy = b;\n    $("sendBtn").disabled = b;',
    'function setBusy(b) {\n    busy = b;\n    $("sendBtn").disabled = b;\n    msgsEl.querySelectorAll(".sum .acts button").forEach(function (x) { x.disabled = b; });',
    "disable confirmation controls while sending",
)
p.write_text(s)

# ---------------- src/server.ts ----------------
p = Path("src/server.ts")
s = p.read_text()
not_found_helper = r'''
function sendNotFoundPage(req: IncomingMessage, res: ServerResponse): void {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Annapurna Home Foods</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#efe8d8;color:#1b2a21;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.box{width:min(520px,calc(100% - 32px));box-sizing:border-box;padding:34px 28px;text-align:center;background:#fffdf8;border:1px solid #e6dcc6;border-radius:24px;box-shadow:0 18px 50px rgba(30,45,35,.10)}img{width:68px;height:68px;border-radius:18px}h1{margin:16px 0 8px;font:700 30px/1.1 Georgia,serif;color:#1d6b4d}p{margin:0 0 20px;color:#56645a}a{display:inline-block;padding:11px 18px;border-radius:12px;background:#1d6b4d;color:white;text-decoration:none;font-weight:700}</style></head><body><main class="box"><img src="/icon.svg" alt=""><h1>That page isn't here</h1><p>The link may be old or mistyped. Return to Annapurna Home Foods to continue.</p><a href="/">Back to home</a></main></body></html>`;
  res.writeHead(404, { ...baseHeaders(req), "content-type": "text/html; charset=utf-8" });
  res.end(html);
}
'''
if "function sendNotFoundPage(" not in s:
    marker = "\nasync function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {"
    if marker not in s:
        raise SystemExit("missing target: not found helper insertion")
    s = s.replace(marker, "\n" + not_found_helper + marker, 1)
    print("fixed: branded browser 404 helper")
else:
    print("already fixed: branded browser 404 helper")

s = replace_once(
    s,
    '          const text = typeof b.text === "string" ? b.text.trim() : "";\n          if (!text) throw new HttpError(400, "Message is empty.");',
    '          const text = typeof b.text === "string" ? b.text.trim() : "";\n          const requestId = cleanText(b.requestId, 120);\n          if (requestId && !/^[A-Za-z0-9:_-]+$/.test(requestId)) throw new HttpError(400, "Invalid request id.");\n          if (!text) throw new HttpError(400, "Message is empty.");',
    "validate web message request id",
)
s = replace_once(
    s,
    '          const out = await agent.handle({ from: waId, name: c.name, text });',
    '          const out = await agent.handle({ from: waId, name: c.name, text, messageId: requestId ? `${waId}:${requestId}` : undefined });',
    "deduplicate repeated web message requests",
)
s = replace_once(
    s,
    '      if (e instanceof HttpError) {\n        return send(req, res, e.status, { error: e.message }, e.retryAfter ? { "retry-after": String(e.retryAfter) } : {});\n      }',
    '      if (e instanceof HttpError) {\n        const errorPath = new URL(req.url ?? "/", "http://x").pathname;\n        const browserRoute = !errorPath.startsWith("/api/") && !errorPath.startsWith("/web/") && !errorPath.startsWith("/sim/");\n        if (e.status === 404 && (req.method ?? "GET") === "GET" && browserRoute) return sendNotFoundPage(req, res);\n        return send(req, res, e.status, { error: e.message }, e.retryAfter ? { "retry-after": String(e.retryAfter) } : {});\n      }',
    "serve branded 404 for browser routes",
)
p.write_text(s)

# ---------------- tests ----------------
p = Path("test/web.test.ts")
s = p.read_text()
anchor = '''  test("Round 5: large explicit quantity bypasses the model and creates no phantom order", () =>'''
new_test = r'''  test("Round 6: rapid duplicate confirmation requests create exactly one real order", () =>
    withRig(async ({ t, start, say, call }) => {
      const token = await start("Double Tap", "double@example.com");
      t.llm.push(modelReply({ reply: "Ready to review.", items: [{ id: "bagara_chicken_fry", qty: 1, pack: "bogo", asked_for: "bagara chicken fry" }], pickup: "2026-09-26T18:00", stage: "awaiting_confirmation" }));
      const review = await say(token, "1 Bagara Rice and Chicken Fry combo BOGO Saturday 6 PM");
      const readback = review.json.messages.find((m: any) => m.who === "agent" && /Please check your order/.test(m.text));
      assert.ok(readback?.id);
      const body = { text: "Yes, confirm", requestId: `confirm:${readback.id}` };
      const [a, b] = await Promise.all([
        call("POST", "/web/message", { token, body }),
        call("POST", "/web/message", { token, body }),
      ]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      const orders = (await call("GET", "/web/orders", { token })).json.orders;
      assert.equal(orders.length, 1);
      assert.equal(orders[0].total, 22);
      const confirmations = t.store.getMessages(t.store.listCustomers()[0]!.waId, 100).filter((m: any) => /Order #\d+.*is confirmed/.test(m.text));
      assert.equal(confirmations.length, 1);
    }));

'''
if "Round 6: rapid duplicate confirmation requests" not in s:
    if anchor not in s:
        raise SystemExit("missing target: Round 6 web test anchor")
    s = s.replace(anchor, new_test + anchor, 1)
    print("fixed: Round 6 double-confirm regression test")
else:
    print("already fixed: Round 6 double-confirm regression test")
p.write_text(s)

p = Path("test/server.test.ts")
s = p.read_text()
s = replace_once(
    s,
    '''  test("unknown routes 404, and errors do not leak internals", async () => {\n    assert.equal((await call("/nope")).status, 404);\n    assert.equal((await call("/api/nope", { token: "secret" })).status, 404);\n  });''',
    '''  test("unknown browser routes get a branded 404; API routes stay JSON", async () => {\n    const page = await call("/nope");\n    assert.equal(page.status, 404);\n    assert.equal(page.json, null);\n    assert.match(page.text, /Annapurna Home Foods/);\n    assert.match(page.text, /That page isn't here/);\n    const api = await call("/api/nope", { token: "secret" });\n    assert.equal(api.status, 404);\n    assert.deepEqual(api.json, { error: "Not found" });\n  });''',
    "branded 404 regression test",
)
p.write_text(s)

print("Round 6 patch prepared.")
