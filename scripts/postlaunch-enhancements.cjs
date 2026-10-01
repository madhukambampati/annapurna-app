const fs = require('fs');

function replaceOnce(file, oldText, newText) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`Expected block not found in ${file}: ${oldText.slice(0, 120)}`);
  s = s.replace(oldText, newText);
  fs.writeFileSync(file, s);
}

function insertBeforeOnce(file, anchor, text) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(anchor)) throw new Error(`Anchor not found in ${file}: ${anchor}`);
  s = s.replace(anchor, text + anchor);
  fs.writeFileSync(file, s);
}

// ---------------------------------------------------------------------------
// 1) Normal orders now require owner approval before entering To cook.
// Custom/catering already has an owner quote/approval step, so that flow stays unchanged.
// ---------------------------------------------------------------------------
replaceOnce('src/agent.ts',
`    out.push("Reply YES to confirm, or tell me what to change.");`,
`    out.push("Reply YES to submit this order for Annapurna confirmation, or tell me what to change.");`);

replaceOnce('src/agent.ts',
`    const order = store.insertOrder({
      waId, name, items, pickup: draft.pickup_local, flags, status: flags.length ? "hold" : "cook", notes, createdAt: now,
    });`,
`    // Every normal website order is reviewed by Annapurna before it enters the kitchen.
    // Existing safety flags remain visible; ordinary orders get an explicit approval flag.
    const approvalFlags = flags.length ? flags : ["Awaiting owner approval"];
    const order = store.insertOrder({
      waId, name, items, pickup: draft.pickup_local, flags: approvalFlags, status: "hold", notes, createdAt: now,
    });`);

replaceOnce('src/agent.ts',
`    if (flags.length) {
      out.replies.push(\`Thank you\${who ? \` \${who}\` : ""}! I've noted order #\${order.id}:\\n\${listing}\\nWe need to confirm it first (\${flags.join("; ").toLowerCase()}). Annapurna Home Foods will reach out to you here in this chat.\`);
    } else {
      out.replies.push(\`Thank you\${who ? \` \${who}\` : ""}! Order #\${order.id}\${main ? \` (extras for order #\${main.id})\` : ""} is confirmed:\\n\${listing}\\nTotal: \${money(t)}\\nPickup: \${formatWhen(draft.pickup_local)} at \${s.address}\`);
    }
    await this.d.notifier.notify(
      flags.length ? \`Order #\${order.id} needs you\` : main ? \`Extras for order #\${main.id} (new order #\${order.id})\` : \`New order #\${order.id}\`,
      \`\${name}: \${items.map(itemLabel).join(", ")}. Pickup \${formatWhen(draft.pickup_local)}. \${money(t)}\${flags.length ? \`. HOLD: \${flags.join("; ")}\` : ""}\`,
    );`,
`    const reviewNote = flags.length ? \` Review needed: \${flags.join("; ").toLowerCase()}.\` : "";
    out.replies.push(
      \`Thank you\${who ? \` \${who}\` : ""}! Order #\${order.id}\${main ? \` (extras for order #\${main.id})\` : ""} has been submitted for Annapurna confirmation:\\n\${listing}\\nTotal: \${money(t)}\\nPickup: \${formatWhen(draft.pickup_local)} at \${s.address}\\nWe'll confirm it here before we start cooking.\${reviewNote}\`
    );
    await this.d.notifier.notify(
      \`Order #\${order.id} needs approval\`,
      \`\${name}: \${items.map(itemLabel).join(", ")}. Pickup \${formatWhen(draft.pickup_local)}. \${money(t)}. REVIEW: \${approvalFlags.join("; ")}\`,
    );`);

// ---------------------------------------------------------------------------
// 2) Update/version check so already-open tabs can offer a safe refresh.
// The version is derived from served customer assets, so it changes automatically with UI deploys.
// ---------------------------------------------------------------------------
replaceOnce('src/server.ts',
`  const clientIp = (req: IncomingMessage): string => {`,
`  const appVersion = (): string => {
    const js = asset("app.js");
    const html = asset("index.html");
    return sha(String(js ?? "") + "\\0" + String(html ?? "")).slice(0, 12);
  };

  const clientIp = (req: IncomingMessage): string => {`);

replaceOnce('src/server.ts',
`        if (m === "GET" && path === "/web/menu") {`,
`        if (m === "GET" && path === "/web/version") {
          limit(\`version:\${ip}\`, 120, 60_000);
          return send(req, res, 200, { version: appVersion() });
        }

        if (m === "GET" && path === "/web/menu") {`);

// ---------------------------------------------------------------------------
// 3) Customer UI: render pending-owner-approval as a proper receipt card,
// add update banner polling, and clarify that resume access is browser-bound.
// ---------------------------------------------------------------------------
replaceOnce('public/app.js',
`  var token = "", lastId = 0, busy = false, seen = {}, orders = [], pollTimer = 0;`,
`  var token = "", lastId = 0, busy = false, seen = {}, orders = [], pollTimer = 0;
  var appVersion = "", versionTimer = 0;`);

replaceOnce('public/app.js',
`  function confirmed(m) {
    var lines = m.text.split("\\n");`,
`  function confirmed(m) {
    var submitted = /has been submitted for Annapurna confirmation:/.test(m.text);
    var lines = m.text.split("\\n");`);

replaceOnce('public/app.js',
`    var card = h("div", { class: "b agent sum", "data-id": m.id || "" },
      h("div", { class: "cfhead" }, mascot("sm jump"), h("h3", {}, "Order " + (num ? "#" + num[1] + " " : "") + "confirmed" + (/extras for order #(\\d+)/.test(lines[0]) ? " · extras for #" + /extras for order #(\\d+)/.exec(lines[0])[1] : ""))),`,
`    var card = h("div", { class: "b agent sum" + (submitted ? " pending-approval" : ""), "data-id": m.id || "" },
      h("div", { class: "cfhead" }, mascot("sm" + (submitted ? "" : " jump")), h("h3", {}, "Order " + (num ? "#" + num[1] + " " : "") + (submitted ? "submitted" : "confirmed") + (/extras for order #(\\d+)/.test(lines[0]) ? " · extras for #" + /extras for order #(\\d+)/.exec(lines[0])[1] : ""))),`);

replaceOnce('public/app.js',
`    if (isFresh(m) && !REDUCED) card.append(confetti());`,
`    if (isFresh(m) && !REDUCED && !submitted) card.append(confetti());`);

replaceOnce('public/app.js',
`    if (m.who === "agent" && /^[^\\n]*Order #\\d+(?: \\([^)]*\\))? is confirmed:/.test(m.text)) return confirmed(m);`,
`    if (m.who === "agent" && /^[^\\n]*Order #\\d+(?: \\([^)]*\\))? (?:is confirmed|has been submitted for Annapurna confirmation):/.test(m.text)) return confirmed(m);`);

replaceOnce('public/app.js',
`        h("p", {}, "Finished for now? End this session to return to the welcome screen. On this device, enter the same contact later to resume your chat and placed orders."),`,
`        h("p", {}, "Finished for now? End this session to return to the welcome screen. Your saved chat can resume only from this browser using its private saved session, and you must enter the same contact."),`);

insertBeforeOnce('public/app.js',
`  /* ---------- wiring ---------- */`,
`  /* ---------- deployed-version watch ---------- */
  function showUpdateBanner() {
    if ($("appUpdate")) return;
    var bar = h("div", { class: "app-update", id: "appUpdate", role: "status", "aria-live": "polite" },
      h("span", {}, h("b", {}, "Annapurna was updated."), " Refresh to get the latest version."),
      h("button", { type: "button", class: "btn sm", onclick: function () { window.location.reload(); } }, "Refresh"),
      h("button", { type: "button", class: "app-update-close", "aria-label": "Dismiss update notice", onclick: function () { bar.remove(); } }, "×"));
    document.body.append(bar);
  }
  function checkVersion() {
    fetch("/web/version", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.version) return;
      if (!appVersion) { appVersion = j.version; return; }
      if (j.version !== appVersion) showUpdateBanner();
    }).catch(function () { /* best effort */ });
  }
  function startVersionWatch() {
    checkVersion();
    if (versionTimer) clearInterval(versionTimer);
    versionTimer = setInterval(checkVersion, 5 * 60 * 1000);
  }

`);

replaceOnce('public/app.js',
`  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });`,
`  document.addEventListener("visibilitychange", function () { if (!document.hidden) { poll(); checkVersion(); } });`);

replaceOnce('public/app.js',
`  addCustomerActions();
  if (token) openHome(); else show("onboard");`,
`  addCustomerActions();
  startVersionWatch();
  if (token) openHome(); else show("onboard");`);

// Customer CSS: pending approval receipt, update notice, and extreme-width hardening.
insertBeforeOnce('public/index.html', '</head>', `
<style id="postLaunchEnhancementsV1">
.customer-mode .sum.pending-approval{border-color:var(--accent);box-shadow:0 12px 30px color-mix(in srgb,var(--accent) 16%,transparent)}
.customer-mode .sum.pending-approval h3{background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 86%,#8b5a2b),var(--accent));color:var(--on-accent)}
.app-update{position:fixed;z-index:120;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(560px,calc(100% - 24px));display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;border:1px solid color-mix(in srgb,var(--brand) 25%,var(--line));border-radius:16px;background:color-mix(in srgb,var(--surface) 96%,var(--brand-soft));box-shadow:0 16px 44px rgba(20,50,32,.20);font-size:13px;color:var(--ink)}
.app-update span{flex:1;min-width:0}.app-update .btn{min-height:38px;padding:8px 12px}.app-update-close{width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:var(--muted);font-size:22px;line-height:1}
@media(max-width:340px){
  .customer-mode .top{gap:4px;padding-inline:7px}
  .customer-mode .seal{width:31px;height:31px;border-radius:9px}
  .customer-mode .brand h1{font-size:15px;white-space:nowrap}
  .customer-mode .tabs{gap:0}
  .customer-mode .tab{min-width:39px;padding-inline:2px;font-size:9px}
  .customer-mode .tab .ic{width:17px;height:17px}
  .customer-mode .customer-actions{padding-inline:8px;gap:6px}
  .customer-mode .customer-action{padding:7px 9px;font-size:11.5px}
  .customer-mode .home-copy h2{font-size:30px}
  .customer-mode .home-hero{padding-inline:15px}
  .customer-mode .menu-seg{grid-template-columns:1fr 1fr!important;gap:5px!important}
  .customer-mode .dish{flex-direction:column!important}
  .customer-mode .dprice{width:100%!important;min-width:0!important;align-items:stretch!important;text-align:left!important}
  .app-update{align-items:stretch;flex-wrap:wrap}.app-update span{flex-basis:100%}.app-update .btn{flex:1}
}
@media(max-width:300px){
  .customer-mode .brand{max-width:96px}
  .customer-mode .brand h1{font-size:13.5px;overflow:hidden;text-overflow:ellipsis}
  .customer-mode .tab{min-width:36px;font-size:8.5px}
}
</style>
`);

// ---------------------------------------------------------------------------
// 4) Owner Desk V2: searchable/filterable orders and searchable chats.
// ---------------------------------------------------------------------------
replaceOnce('public/desk.js',
`let token = "";`,
`let token = "";
let orderQuery = "", orderStatusFilter = "all", chatQuery = "";`);

insertBeforeOnce('public/desk.js',
`/* ---------- orders ---------- */`,
`function orderFilterBar() {
  const q = h("input", { type: "search", value: orderQuery, placeholder: "Order #, customer, contact, dish...", "aria-label": "Search orders" });
  const status = h("select", { "aria-label": "Filter order status" },
    [["all","All statuses"],["hold","Needs approval"],["cook","To cook"],["ready","Ready"],["done","Picked up"],["cancelled","Cancelled"]].map(([v,l]) => h("option", { value: v, selected: orderStatusFilter === v }, l)));
  const apply = () => { orderQuery = q.value.trim(); orderStatusFilter = status.value; render(); };
  return h("form", { class: "owner-filters", onsubmit: (e) => { e.preventDefault(); apply(); } },
    q, status,
    h("button", { class: "pri", type: "submit" }, "Apply"),
    (orderQuery || orderStatusFilter !== "all") ? h("button", { class: "ghost", type: "button", onclick: () => { orderQuery = ""; orderStatusFilter = "all"; render(); } }, "Clear") : null);
}
function orderMatches(o) {
  if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) return false;
  const q = orderQuery.toLowerCase();
  if (!q) return true;
  const text = [o.id, o.name, o.contact, o.notes, o.status].concat((o.items || []).map((i) => [i.name, i.id].join(" "))).join(" ").toLowerCase();
  return text.includes(q.replace(/^#/, "")) || String(o.id) === q.replace(/^#/, "");
}

`);

replaceOnce('public/desk.js',
`function renderOrders() {
  const open = state.alerts.filter((a) => !a.done);
  const held = state.orders.filter((o) => o.status === "hold");
  const cooking = state.orders.filter((o) => o.status === "cook").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
  const ready = state.orders.filter((o) => o.status === "ready").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
  const done = state.orders.filter((o) => o.status === "done").slice(-12).reverse();
  const cancelled = state.orders.filter((o) => o.status === "cancelled").slice(-8).reverse();`,
`function renderOrders() {
  const q = orderQuery.toLowerCase();
  const orderPool = state.orders.filter(orderMatches);
  const open = state.alerts.filter((a) => !a.done && (!q || [a.id, a.orderId, a.cust, a.contact, a.note].join(" ").toLowerCase().includes(q.replace(/^#/, ""))));
  const held = orderPool.filter((o) => o.status === "hold");
  const cooking = orderPool.filter((o) => o.status === "cook").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
  const ready = orderPool.filter((o) => o.status === "ready").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
  const done = orderPool.filter((o) => o.status === "done").slice(-12).reverse();
  const cancelled = orderPool.filter((o) => o.status === "cancelled").slice(-8).reverse();`);

replaceOnce('public/desk.js',
`  if (open.length || held.length) {`,
`  out.push(orderFilterBar());

  if (open.length || held.length) {`);

replaceOnce('public/desk.js',
`  if (!state.orders.length) {
    out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No orders yet"), h("span", {}, "Customer orders will appear here as soon as they are confirmed.")));
    return out;
  }`,
`  if (!orderPool.length && !open.length) {
    const filtered = orderQuery || orderStatusFilter !== "all";
    out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, filtered ? "No matching orders" : "No orders yet"), h("span", {}, filtered ? "Try another search or clear the filter." : "Customer orders will appear here as soon as they are submitted.")));
    return out;
  }`);

insertBeforeOnce('public/desk.js',
`function renderChats() {`,
`function chatFilterBar() {
  const q = h("input", { type: "search", value: chatQuery, placeholder: "Search customer, contact or message...", "aria-label": "Search customer chats" });
  return h("form", { class: "owner-filters chat-filters", onsubmit: (e) => { e.preventDefault(); chatQuery = q.value.trim(); render(); } },
    q,
    h("button", { class: "pri", type: "submit" }, "Search"),
    chatQuery ? h("button", { class: "ghost", type: "button", onclick: () => { chatQuery = ""; render(); } }, "Clear") : null);
}

`);

replaceOnce('public/desk.js',
`function renderChats() {
  const title = h("div", { class: "owner-page-title chat-title" },`,
`function renderChats() {
  const q = chatQuery.toLowerCase();
  const filteredCustomers = state.customers.filter((c) => !q || [c.name, c.contact, c.last && c.last.text].join(" ").toLowerCase().includes(q));
  const title = h("div", { class: "owner-page-title chat-title" },`);

replaceOnce('public/desk.js',
`    h("span", { class: "lane-count" }, String(state.customers.length)));`,
`    h("span", { class: "lane-count" }, String(filteredCustomers.length)));`);

replaceOnce('public/desk.js',
`    state.customers.length ? state.customers.map((c) => {`,
`    filteredCustomers.length ? filteredCustomers.map((c) => {`);

replaceOnce('public/desk.js',
`  return [title, h("div", { class: "chatgrid" + (chat.waId ? " has-thread" : "") }, list, right)];`,
`  return [title, chatFilterBar(), h("div", { class: "chatgrid" + (chat.waId ? " has-thread" : "") }, list, right)];`);

insertBeforeOnce('public/desk.html', '</head>', `
<style id="ownerDeskSearchV2">
.owner-filters{display:grid;grid-template-columns:minmax(180px,1fr) minmax(150px,210px) auto auto;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:0 8px 22px rgba(20,50,32,.04)}
.owner-filters input,.owner-filters select{width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--line2);border-radius:11px;background:var(--page);color:var(--ink)}
.owner-filters .pri,.owner-filters .ghost{min-height:42px;white-space:nowrap}
.chat-filters{grid-template-columns:minmax(180px,1fr) auto auto}
@media(max-width:700px){.owner-filters,.chat-filters{grid-template-columns:1fr 1fr}.owner-filters input,.chat-filters input{grid-column:1/-1}}
@media(max-width:420px){.owner-filters,.chat-filters{grid-template-columns:1fr}.owner-filters input,.chat-filters input{grid-column:auto}.owner-filters .pri,.owner-filters .ghost{width:100%}}
</style>
`);

// ---------------------------------------------------------------------------
// 5) Regression coverage: browser-bound resume, version endpoint, and new approval flow.
// ---------------------------------------------------------------------------
replaceOnce('test/agent.test.ts',
`  assert.deepEqual([orders[0]!.status, orders[0]!.flags, orders[0]!.pickup, orders[0]!.name], ["cook", [], FRI_6PM, "Asha"]);
  assert.match(r2.replies[0]!, /Order #1 is confirmed/);`,
`  assert.deepEqual([orders[0]!.status, orders[0]!.flags, orders[0]!.pickup, orders[0]!.name], ["hold", ["Awaiting owner approval"], FRI_6PM, "Asha"]);
  assert.match(r2.replies[0]!, /Order #1 has been submitted for Annapurna confirmation/);`);

replaceOnce('test/agent.test.ts',
`  assert.equal(t.notifier.sent[0]!.title, "New order #1");`,
`  assert.equal(t.notifier.sent[0]!.title, "Order #1 needs approval");`);

replaceOnce('test/agent.test.ts',
`  assert.deepEqual([o.status, o.flags], ["cook", []]);`,
`  assert.deepEqual([o.status, o.flags], ["hold", ["Awaiting owner approval"]]);`);

replaceOnce('test/agent.test.ts',
`  assert.equal(t.store.getOrder(1)!.status, "cook");`,
`  assert.equal(t.store.getOrder(1)!.status, "hold");`);

replaceOnce('test/agent.test.ts',
`  assert.match(t.llm.prompts.at(-1)!, /ORDERS ALREADY PLACED BY THIS CUSTOMER: #1 \\(cook\\) 2 x Chicken Kheema Fry combo \\(Buy 1 Get 1\\)/);`,
`  assert.match(t.llm.prompts.at(-1)!, /ORDERS ALREADY PLACED BY THIS CUSTOMER: #1 \\(hold\\) 2 x Chicken Kheema Fry combo \\(Buy 1 Get 1\\)/);`);

replaceOnce('test/agent.test.ts',
`  assert.equal(o.status, "cook");
});

test("customer-facing wording never names Maddy"`,
`  assert.equal(o.status, "hold");
});

test("customer-facing wording never names Maddy"`);

replaceOnce('test/agent.test.ts',
`  assert.equal(t.store.listOrders()[0]!.status, "cook");
});

test("extras after the order is placed: read back as extras for that order and placed as a linked order"`,
`  assert.equal(t.store.listOrders()[0]!.status, "hold");
});

test("extras after the order is placed: read back as extras for that order and placed as a linked order"`);

replaceOnce('test/agent.test.ts',
`  assert.match(r2.replies[0]!, /Order #2 \\(extras for order #1\\) is confirmed/);
  const o = t.store.listOrders().find((x) => x.id === 2)!;
  assert.equal(o.status, "cook");
  assert.match(o.notes, /Extras for order #1/);
  assert.match(t.notifier.sent.at(-1)!.title, /Extras for order #1/);`,
`  assert.match(r2.replies[0]!, /Order #2 \\(extras for order #1\\) has been submitted for Annapurna confirmation/);
  const o = t.store.listOrders().find((x) => x.id === 2)!;
  assert.equal(o.status, "hold");
  assert.match(o.notes, /Extras for order #1/);
  assert.match(t.notifier.sent.at(-1)!.title, /Order #2 needs approval/);`);

replaceOnce('test/web.test.ts',
`      assert.deepEqual([o.json.orders[0].status, o.json.orders[0].total], ["cook", 56]);`,
`      assert.deepEqual([o.json.orders[0].status, o.json.orders[0].total], ["hold", 56]);`);

insertBeforeOnce('test/web.test.ts',
`  test("HSTS only when the proxy says https", () =>`,
`  test("customer app exposes a deploy version for safe refresh checks", () =>
    withRig(async ({ call }) => {
      const r = await call("GET", "/web/version");
      assert.equal(r.status, 200);
      assert.match(r.json.version, /^[0-9a-f]{12}$/);
    }));

`);

insertBeforeOnce('test/web.test.ts',
`  test("the raw token is never stored, only its hash", () =>`,
`  test("contact alone cannot resume another chat; resume requires this browser's saved bearer token", () =>
    withRig(async ({ t, call, start }) => {
      const first = await start("Asha", "asha@example.com");
      const noToken = await call("POST", "/web/resume", { body: { name: "Asha", contact: "asha@example.com", consent: true } });
      assert.equal(noToken.status, 401);
      const second = await start("Asha", "asha@example.com");
      assert.notEqual(first, second);
      assert.equal(t.store.listCustomers().length, 2);
      assert.equal((await call("GET", "/web/history", { token: second })).json.messages.length, 0);
    }));

`);

// Normal-order cancellation request now starts from hold until owner acceptance.
replaceOnce('test/web.test.ts',
`      assert.equal(t.store.getOrder(id)!.status, "cook");
      const alert = t.store.listAlerts(true).find((a) => a.orderId === id);`,
`      assert.equal(t.store.getOrder(id)!.status, "hold");
      const alert = t.store.listAlerts(true).find((a) => a.orderId === id);`);

// Lifecycle test: owner must accept the normal order before it can be marked ready.
replaceOnce('test/web.test.ts',
`      assert.equal((await call("POST", \`/api/orders/\${id}/status\`, { token: "secret", body: { status: "ready" } })).status, 400);
      assert.equal(t.store.getOrder(id)!.status, "cook");
      assert.equal((await call("POST", \`/api/orders/\${id}/status\`, { token: "secret", body: { status: "ready", confirm: true } })).status, 200);`,
`      assert.equal((await call("POST", \`/api/orders/\${id}/status\`, { token: "secret", body: { status: "ready" } })).status, 400);
      assert.equal(t.store.getOrder(id)!.status, "hold");
      assert.equal((await call("POST", \`/api/orders/\${id}/status\`, { token: "secret", body: { status: "cook" } })).status, 200);
      assert.equal(t.store.getOrder(id)!.status, "cook");
      assert.equal((await call("POST", \`/api/orders/\${id}/status\`, { token: "secret", body: { status: "ready", confirm: true } })).status, 200);`);

// Duplicate-submit regression should count a single submitted/confirmed order message.
replaceOnce('test/web.test.ts',
`      const confirmations = t.store.getMessages(t.store.listCustomers()[0]!.waId, 100).filter((m: any) => /Order #\\d+.*is confirmed/.test(m.text));`,
`      const confirmations = t.store.getMessages(t.store.listCustomers()[0]!.waId, 100).filter((m: any) => /Order #\\d+.*(?:submitted for Annapurna confirmation|is confirmed)/.test(m.text));`);

console.log('Post-launch enhancements patch applied.');
