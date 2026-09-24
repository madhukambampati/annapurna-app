"use strict";
const $ = (id) => document.getElementById(id);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHIPS = ["What's on the menu?", "2 chicken kheema fry combos, buy 1 get 1, pickup Friday 6pm", "Full meal plan for 2 people, pickup Monday 5pm", "yes", "I want to cancel my order"];

let state = { orders: [], alerts: [], menu: [], settings: {}, customers: [], features: {} };
let tab = "orders";
let cook = null;
let chat = { waId: "", messages: [], customer: null };
let sim = { from: "+15195550101", name: "", msgs: [] };
let token = "";
try { token = localStorage.getItem("annapurna-owner") || ""; } catch { /* storage blocked */ }

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

function saveToken(t) {
  token = t;
  try { localStorage.setItem("annapurna-owner", t); } catch { /* ignore */ }
}

async function api(path, opts = {}, retried = false) {
  const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) } });
  if (r.status === 401 && !retried) {
    const t = prompt("Owner token (the OWNER_TOKEN you set on the server)") || "";
    if (t) {
      saveToken(t);
      return api(path, opts, true);
    }
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
  return j;
}

function showErr(e) {
  const el = $("err");
  el.hidden = !e;
  el.textContent = e ? e.message || String(e) : "";
}

const money = (n) => (n == null ? "Price TBC" : "$" + Math.round(n * 100) / 100);
const label = (it) => it.pack === "bogo" ? `${it.qty} x ${it.name} (Buy 1 Get 1)` : it.pack === "plan" ? `${it.qty} x ${it.name} (${it.qty} ${it.qty > 1 ? "people" : "person"})` : `${it.qty} x ${it.name}`;
const totalOf = (items) => items.some((i) => i.amt == null) ? null : items.reduce((a, i) => a + i.amt, 0);
function when(p) {
  if (!p) return "No pickup time";
  const [d, t] = p.split("T");
  const dt = new Date(d + "T" + t + ":00Z");
  return dt.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }) + " · " + dt.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
}
const timeOf = (ts) => new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const isWeb = (id) => String(id).startsWith("web:");

/* ---------- data ---------- */
async function refresh() {
  try {
    state = await api("/api/state");
    showErr(null);
  } catch (e) {
    showErr(e);
    return;
  }
  const a = document.activeElement;
  if (a && $("panel").contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) {
    renderTabs();
    return; // do not wipe a field that is being edited
  }
  if (tab === "chats" && chat.waId) await loadThread(true);
  render();
}

async function act(path, body, method = "POST") {
  try {
    await api(path, { method, body: JSON.stringify(body || {}) });
    showErr(null);
  } catch (e) {
    showErr(e);
  }
  cook = null;
  refresh();
}

/* ---------- orders ---------- */
function ticket(o) {
  const b = (to, txt, ghost) => h("button", { class: ghost ? "ghost" : "", onclick: () => act(`/api/orders/${o.id}/status`, { status: to }) }, txt);
  return h("article", { class: "ticket" },
    h("div", {}, h("b", {}, o.name), " #" + o.id),
    o.contact ? h("div", { class: "contact" }, o.contact) : null,
    h("div", { class: "when" }, when(o.pickup)),
    h("ul", {}, o.items.map((i) => h("li", {}, label(i))), o.notes ? h("li", {}, "Note: " + o.notes) : null),
    h("div", { class: "row" }, h("b", {}, money(totalOf(o.items))), o.flags.map((f) => h("span", { class: "flag" }, f))),
    h("div", { class: "row" },
      o.status === "hold" ? [b("cook", "Accept"), b("cancelled", "Decline", true)] : null,
      o.status === "cook" ? [b("ready", "Mark ready"), b("cancelled", "Cancel", true)] : null,
      o.status === "ready" ? [b("done", "Picked up"), b("cook", "Back", true)] : null,
      isWeb(o.waId) ? h("button", { class: "ghost", onclick: () => openChat(o.waId) }, "Chat") : null));
}

function renderOrders() {
  const open = state.alerts.filter((a) => !a.done);
  const held = state.orders.filter((o) => o.status === "hold");
  const out = [];
  if (open.length || held.length) {
    out.push(h("h2", {}, "Needs you"));
    for (const a of open) {
      const o = a.orderId ? state.orders.find((x) => x.id === a.orderId) : null;
      out.push(h("div", { class: "need" },
        h("span", {}, h("b", {}, a.cust + (a.contact ? " (" + a.contact + ")" : "") + ": "), a.note),
        h("span", {},
          isWeb(a.waId) ? h("button", { onclick: () => openChat(a.waId) }, "Open chat") : null, " ",
          o && ["hold", "cook", "ready"].includes(o.status) ? h("button", { class: "bad", onclick: async () => { await act(`/api/orders/${o.id}/status`, { status: "cancelled" }); act(`/api/alerts/${a.id}/done`); } }, "Cancel order #" + o.id) : null, " ",
          h("button", { onclick: () => act(`/api/alerts/${a.id}/done`) }, "Done"))));
    }
    if (held.length) out.push(h("p", { class: "sub" }, "These orders broke a rule or wait for you. Accept them to send to the kitchen."), h("div", { class: "cols" }, held.map(ticket)));
  }
  if (!state.orders.length) {
    out.push(h("div", { class: "empty" }, "No orders yet. Orders customers place will show up here."));
    return out;
  }
  const cols = [["cook", "To cook"], ["ready", "Ready for pickup"], ["done", "Picked up"]];
  out.push(h("div", { class: "cols" }, cols.map(([s, t]) => {
    let list = state.orders.filter((o) => o.status === s).sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
    if (s === "done") list = list.slice(-8).reverse();
    return h("div", {}, h("h2", {}, t + " (" + list.length + ")"), list.length ? list.map(ticket) : h("div", { class: "empty" }, "Nothing here"));
  })));
  return out;
}

/* ---------- chats ---------- */
async function loadThread(quiet) {
  if (!chat.waId) return;
  try {
    const j = await api("/api/customers/" + encodeURIComponent(chat.waId) + "/messages");
    chat.messages = j.messages;
    chat.customer = j.customer;
  } catch (e) {
    if (!quiet) showErr(e);
  }
}
async function openChat(waId) {
  chat = { waId, messages: [], customer: null };
  tab = "chats";
  await loadThread();
  render();
  const box = $("thread");
  if (box) box.scrollTop = box.scrollHeight;
}
async function sendReply(text) {
  text = text.trim();
  if (!text || !chat.waId) return;
  try {
    await api("/api/customers/" + encodeURIComponent(chat.waId) + "/reply", { method: "POST", body: JSON.stringify({ text }) });
    showErr(null);
  } catch (e) {
    showErr(e);
    return;
  }
  await loadThread();
  render();
  const box = $("thread");
  if (box) box.scrollTop = box.scrollHeight;
}
function renderChats() {
  const list = h("div", { class: "clist" },
    state.customers.length ? state.customers.map((c) => h("button", { class: "crow", "aria-current": String(c.waId === chat.waId), onclick: () => openChat(c.waId) },
      h("b", {}, c.name || "Customer"), h("small", {}, (c.contact || c.waId) + " · " + (c.last ? c.last.text : "")))) : h("div", { class: "empty" }, "No chats yet."));
  let right;
  if (!chat.waId) right = h("div", { class: "empty" }, "Pick a chat on the left.");
  else {
    const ta = h("textarea", { placeholder: "Reply to the customer...", "aria-label": "Reply", maxlength: "1000" });
    const form = h("form", { class: "reply", onsubmit: (e) => { e.preventDefault(); const t = ta.value; ta.value = ""; sendReply(t); } }, ta, h("button", { class: "pri", type: "submit" }, "Send"));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    right = h("div", { class: "card thread" },
      h("div", {}, h("b", {}, chat.customer ? chat.customer.name : ""), " ", h("span", { class: "sub" }, chat.customer ? chat.customer.contact : "")),
      h("div", { class: "msgs", id: "thread" }, chat.messages.map((m) => h("div", { class: "b " + m.who }, h("small", {}, (m.who === "cust" ? "Customer" : m.who === "agent" ? "Assistant" : "You") + " · " + timeOf(m.ts)), m.text))),
      isWeb(chat.waId) ? [h("p", { class: "sub" }, "Your reply appears in the customer's chat on the website."), form] : h("p", { class: "sub" }, "This is a test customer, replies are not delivered anywhere."));
  }
  return h("div", { class: "chatgrid" }, list, right);
}

/* ---------- cook ---------- */
function renderCook() {
  if (!cook) {
    api("/api/cook").then((c) => { cook = c; render(); }).catch(showErr);
    return h("div", { class: "empty" }, "Loading...");
  }
  const out = [h("h2", {}, "Cook list"), h("p", { class: "sub" }, "From orders in To cook.")];
  if (!cook.days.length) out.push(h("div", { class: "empty" }, "Nothing to cook yet."));
  for (const d of cook.days) {
    out.push(h("div", { class: "card" }, h("h2", {}, d.label),
      h("table", {}, h("tr", {}, h("th", {}, "Dish"), h("th", {}, "Qty"), h("th", {}, "For")),
        d.dishes.map((x) => h("tr", {}, h("td", {}, x.name), h("td", {}, x.qty + (x.plan ? (x.qty === 1 ? " person" : " people") : (x.qty === 1 ? " meal" : " meals"))), h("td", {}, x.who.join(", ")))))));
  }
  out.push(h("h2", {}, "Buy list"));
  if (cook.buy.length) {
    out.push(h("div", { class: "card" }, h("table", {}, cook.buy.map((r) => h("tr", {}, h("td", {}, r.name), h("td", {}, r.text.split(": ").slice(1).join(": "))))),
      h("p", {}, h("button", { onclick: () => navigator.clipboard && navigator.clipboard.writeText(cook.buy.map((r) => r.text).join("\n")) }, "Copy list"))));
  }
  if (cook.missingRecipe.length) out.push(h("p", { class: "sub" }, "No ingredients set for: " + cook.missingRecipe.join(", ") + ". Add them in the Menu tab."));
  if (!cook.buy.length && cook.days.length) out.push(h("div", { class: "empty" }, "Set ingredients per dish (Menu tab) to get a buy list."));
  return out;
}

/* ---------- menu ---------- */
function patchMenu(id, body) {
  return api("/api/menu/" + id, { method: "PATCH", body: JSON.stringify(body) }).then(() => showErr(null)).catch(showErr).finally(() => { cook = null; refresh(); });
}
function priceCell(m, f) {
  if ((f === "bogo" && m.kind !== "combo") || (f === "single" && m.kind === "plan") || (f === "plan" && m.kind !== "plan")) return h("td", {}, "");
  const inp = h("input", { type: "number", min: "0", step: "0.5", value: m[f] == null ? "" : m[f], "aria-label": f + " price " + m.name });
  inp.addEventListener("change", () => patchMenu(m.id, { [f]: inp.value === "" ? null : Number(inp.value) }));
  return h("td", {}, inp);
}
function renderMenu() {
  return [
    h("h2", {}, "Menu"),
    h("p", { class: "sub" }, "The assistant quotes only what is here. Switch a weekend combo off when it is not running. Dishes with no price are sent to you to confirm."),
    h("div", { class: "card", style: "overflow-x:auto" }, h("table", {},
      h("tr", {}, ["Item", "Single $", "Buy 1 Get 1 $", "Plan $", "Running", ""].map((t) => h("th", {}, t))),
      state.menu.map((m) => h("tr", {},
        h("td", {}, m.name,
          h("details", {}, h("summary", {}, "Ingredients per portion"),
            (() => {
              const ta = h("textarea", { "aria-label": "Ingredients for " + m.name, placeholder: "Chicken | 250 | g\nOnion | 1 | pc" }, m.recipe || "");
              ta.addEventListener("change", () => patchMenu(m.id, { recipe: ta.value }));
              return ta;
            })())),
        priceCell(m, "single"), priceCell(m, "bogo"), priceCell(m, "plan"),
        h("td", {}, m.kind === "combo" ? h("input", { type: "checkbox", checked: m.live, "aria-label": "Running: " + m.name, onchange: (e) => patchMenu(m.id, { live: e.target.checked }) }) : ""),
        h("td", {}, m.verify ? h("span", { class: "flag" }, "check price") : ""))))),
  ];
}

/* ---------- rules ---------- */
function renderRules() {
  const s = state.settings;
  const notice = h("input", { type: "number", min: "0", step: "0.5", value: s.noticeHrs, id: "setNotice" });
  const addr = h("input", { type: "text", value: s.address, maxlength: "200", id: "setAddr" });
  const notes = h("textarea", { id: "setNotes", rows: "5", maxlength: "6000" }, s.notes || "");
  const weekly = h("textarea", { id: "setWeekly", rows: "8", maxlength: "3000" }, s.weeklyMenu || "");
  const days = h("div", { class: "days" }, DAYS.map((d, i) => h("label", {}, h("input", { type: "checkbox", value: String(i), checked: (s.days || []).includes(i) }), d)));
  const msg = h("span", { class: "ok" });
  const ipBox = h("p", { class: "sub" }, "Checking your address...");
  api("/api/whoami").then((j) => {
    ipBox.textContent = "The server sees you as " + j.ip + " (PROXY_HOPS=" + j.proxyHops + "). Compare with your real public IP. If it shows your host's address instead, or the same address for everyone, fix PROXY_HOPS or the rate limits will treat all customers as one person.";
  }).catch(() => { ipBox.textContent = ""; });
  const save = async () => {
    const picked = [...days.querySelectorAll("input:checked")].map((x) => Number(x.value));
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ noticeHrs: Number(notice.value), address: addr.value, days: picked, notes: notes.value, weeklyMenu: weekly.value }) });
      msg.textContent = "Saved.";
      showErr(null);
    } catch (e) {
      msg.textContent = "";
      showErr(e);
    }
  };
  return [
    h("h2", {}, "Rules"),
    h("p", { class: "sub" }, "Time zone: " + s.tz + ". The assistant and the checks in code both use these."),
    h("div", { class: "card grid2" },
      h("label", {}, "Minimum notice (hours)", notice),
      h("label", {}, "Pickup address", addr),
      h("div", {}, h("div", { class: "sub" }, "Pickup days"), days),
      h("label", {}, "Weekly plan shown to customers (one day per line, like Monday: ...)", weekly),
      h("label", {}, "Notes for the assistant (box sizes, rules, anything it should know. Customers do not see this.)", notes),
      h("div", {}, h("button", { class: "pri", onclick: save }, "Save"), " ", msg)),
    h("h2", {}, "Rate-limit check"),
    ipBox,
  ];
}

/* ---------- test chat (only when SIMULATOR=on) ---------- */
async function simSend(text) {
  text = (text || "").trim();
  if (!text || !sim.from) return;
  sim.msgs.push({ cls: "agent", text });
  try {
    const r = await fetch("/sim/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: sim.from, name: sim.name || undefined, text }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Request failed");
    for (const rep of j.replies) sim.msgs.push({ cls: "cust", text: rep });
    sim.msgs.push({ cls: "meta", text: "route: " + j.route + (j.issues.length ? " · fixed: " + j.issues.join(", ") : "") + (j.judged ? " · " + j.judged.source : "") });
    showErr(null);
  } catch (e) {
    showErr(e);
  }
  cook = null;
  refresh();
  render();
}
function renderSim() {
  const from = h("input", { value: sim.from, "aria-label": "Test customer id", onchange: (e) => { sim.from = e.target.value.trim(); sim.msgs = []; render(); } });
  const name = h("input", { value: sim.name, placeholder: "Name (optional)", "aria-label": "Test customer name", onchange: (e) => { sim.name = e.target.value.trim(); } });
  const ta = h("textarea", { "aria-label": "Message as the test customer", placeholder: "Message as the customer..." });
  const form = h("form", { class: "reply", onsubmit: (e) => { e.preventDefault(); const t = ta.value; ta.value = ""; simSend(t); } }, ta, h("button", { class: "pri", type: "submit" }, "Send"));
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  return h("div", { class: "card thread" },
    h("div", { style: "display:flex;gap:6px" }, from, name),
    h("div", { class: "msgs" }, sim.msgs.map((m) => h("div", { class: m.cls === "meta" ? "meta" : "b " + m.cls }, m.text))),
    h("div", { style: "display:flex;gap:6px;overflow-x:auto;padding:6px 0" }, CHIPS.map((c) => h("button", { type: "button", onclick: () => simSend(c) }, c))),
    form);
}

/* ---------- shell ---------- */
function renderTabs() {
  const need = state.orders.filter((o) => o.status === "hold").length + state.alerts.filter((a) => !a.done).length;
  const tabs = [["orders", "Orders"], ["chats", "Chats"], ["cook", "Cook and buy"], ["menu", "Menu"], ["rules", "Rules"]];
  if (state.features && state.features.simulator) tabs.push(["sim", "Test chat"]);
  $("tabs").replaceChildren(...tabs.map(([k, t]) => h("button", { role: "tab", "aria-selected": String(tab === k), onclick: () => { tab = k; cook = null; render(); } }, t, k === "orders" && need ? h("span", { class: "badge" }, need) : null)));
}
function render() {
  renderTabs();
  const body = tab === "orders" ? renderOrders() : tab === "chats" ? renderChats() : tab === "cook" ? renderCook() : tab === "menu" ? renderMenu() : tab === "rules" ? renderRules() : renderSim();
  $("panel").replaceChildren(...[body].flat());
  const box = $("thread");
  if (box) box.scrollTop = box.scrollHeight;
}

refresh();
setInterval(refresh, 8000);
