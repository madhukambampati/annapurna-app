"use strict";
const $ = (id) => document.getElementById(id);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHIPS = ["What's on the menu?", "2 chicken kheema fry combos, buy 1 get 1, pickup Friday 6pm", "Full meal plan for 2 people, pickup Monday 5pm", "yes", "I want to cancel my order"];
const THEME_KEY = "annapurna-theme";

let state = { orders: [], alerts: [], menu: [], settings: {}, customers: [], features: {}, ownerLaunchAt: 0 };
let tab = "dashboard";
let cook = null;
let chat = { waId: "", messages: [], customer: null };
let sim = { from: "+15195550101", name: "", msgs: [] };
let token = "";
let orderQuery = "", orderStatusFilter = "all", chatQuery = "";

function ownerTimeTheme() {
  const hour = new Date().getHours();
  return (hour >= 19 || hour < 7) ? "dark" : "light";
}
function applyOwnerTheme(theme, remember = false) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", value);
  if (remember) { try { localStorage.setItem(THEME_KEY, value); } catch { /* storage blocked */ } }
  const btn = $("ownerThemeToggle");
  if (btn) {
    const dark = value === "dark";
    btn.textContent = dark ? "☀️" : "🌙";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = dark ? "Light mode" : "Dark mode";
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", value === "dark" ? "#0b120d" : "#1d6b4d");
}
function initOwnerTheme() {
  let saved = "";
  try { saved = localStorage.getItem(THEME_KEY) || ""; } catch { /* storage blocked */ }
  const manual = saved === "light" || saved === "dark";
  applyOwnerTheme(manual ? saved : ownerTimeTheme());
  const btn = $("ownerThemeToggle");
  if (btn) btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || ownerTimeTheme();
    applyOwnerTheme(current === "dark" ? "light" : "dark", true);
  });
  if (!manual) window.setInterval(() => {
    let currentSaved = "";
    try { currentSaved = localStorage.getItem(THEME_KEY) || ""; } catch { /* ignore */ }
    if (currentSaved !== "light" && currentSaved !== "dark") applyOwnerTheme(ownerTimeTheme());
  }, 60000);
}

try { token = localStorage.getItem("annapurna-owner") || ""; } catch { /* storage blocked */ }
initOwnerTheme();

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
function localDateKey(ts, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}
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

/* ---------- cancel with a reason for the customer ---------- */
const CANCEL_REASONS = [
  "Sorry, this dish is sold out for that day.",
  "Sorry, we can't make it for that pickup time.",
  "Sorry, we are closed that day.",
  "Cancelled as you asked. Hope to cook for you next time!",
];
function cancelOrder(o, after) {
  const ta = h("textarea", { rows: 3, maxlength: 300, placeholder: "Message to the customer (optional)", "aria-label": "Reason for the customer" });
  const dlg = h("dialog", { class: "cancel" },
    h("h3", {}, "Cancel order #" + o.id + " for " + o.name + "?"),
    h("p", { class: "sub" }, "Tell the customer why. It is sent to their chat with the cancel message."),
    h("div", { class: "reasons" }, CANCEL_REASONS.map((r) => h("button", { type: "button", onclick: () => { ta.value = r; ta.focus(); } }, r))),
    ta,
    h("div", { class: "row" },
      h("button", { type: "button", class: "ghost", onclick: () => dlg.close() }, "Keep order"),
      h("button", { type: "button", class: "pri danger", onclick: async () => {
        dlg.close();
        await act(`/api/orders/${o.id}/status`, { status: "cancelled", reason: ta.value.trim() });
        if (after) after();
      } }, "Cancel order")));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  ta.focus();
}

/* ---------- dashboard ---------- */
function renderDashboard() {
  const activeAlerts = state.alerts.filter((a) => !a.done).length;
  const held = state.orders.filter((o) => o.status === "hold").length;
  const cooking = state.orders.filter((o) => o.status === "cook").length;
  const ready = state.orders.filter((o) => o.status === "ready").length;
  const done = state.orders.filter((o) => o.status === "done").length;
  const active = state.orders.filter((o) => ["hold","cook","ready"].includes(o.status));
  const launchAt = Number(state.ownerLaunchAt) || 0;
  const tz = state.settings && state.settings.tz ? state.settings.tz : "America/Toronto";
  const today = localDateKey(Date.now(), tz);
  const sales = state.orders
    .filter((o) => !["hold", "cancelled"].includes(o.status) && Number(o.createdAt || 0) >= launchAt && localDateKey(o.createdAt, tz) === today)
    .reduce((sum, o) => {
      const t = totalOf(o.items);
      return sum + (t == null ? 0 : t);
    }, 0);

  const kpis = h("section", { class: "owner-kpis", "aria-label": "Kitchen overview" },
    h("div", { class: "owner-kpi kpi-cook", style: "--tone:#1d6b4d", "data-icon": "♨" }, h("small", {}, "To cook"), h("strong", {}, cooking), h("span", {}, "Confirmed orders")),
    h("div", { class: "owner-kpi kpi-ready", style: "--tone:#2f8fb0", "data-icon": "✓" }, h("small", {}, "Ready"), h("strong", {}, ready), h("span", {}, "Waiting for pickup")),
    h("div", { class: "owner-kpi kpi-attn", style: "--tone:#e7882b", "data-icon": "!" }, h("small", {}, "Needs attention"), h("strong", {}, activeAlerts + held), h("span", {}, "Alerts + held orders")),
    h("div", { class: "owner-kpi kpi-sales", style: "--tone:#8b5a2b", "data-icon": "$" }, h("small", {}, "Today's sales"), h("strong", {}, money(sales)), h("span", {}, "Fresh orders today"))
  );

  const out = [
    h("div", {}, h("h2", {}, "Kitchen overview"), h("p", { class: "sub" }, "What needs your attention right now.")),
    kpis
  ];

  if (activeAlerts + held) {
    out.push(h("div", { class: "owner-callout" },
      h("div", {}, h("strong", {}, (activeAlerts + held) + " item" + (activeAlerts + held === 1 ? "" : "s") + " need you"), h("span", {}, "Review held orders or customer requests before cooking.")),
      h("button", { class: "pri", onclick: () => { tab = "orders"; render(); } }, "Review now")));
  }

  out.push(h("h2", {}, "Active orders"));
  if (!active.length) out.push(h("div", { class: "empty" }, "No active orders right now."));
  else out.push(h("div", { class: "cols" }, active
    .sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")))
    .slice(0, 6)
    .map(ticket)));

  out.push(h("h2", {}, "Quick actions"),
    h("div", { class: "card owner-quick-actions" },
      h("button", { class: "quick quick-orders", onclick: () => { tab = "orders"; render(); } }, "Manage orders"),
      h("button", { class: "quick quick-kitchen", onclick: () => { tab = "cook"; cook = null; render(); } }, "Open kitchen list"),
      h("button", { class: "quick quick-chats", onclick: () => { tab = "chats"; render(); } }, "Customer chats"),
      h("button", { class: "quick quick-menu", onclick: () => { tab = "menu"; render(); } }, "Update menu")));
  return out;
}

function orderFilterBar() {
  const q = h("input", { type: "search", value: orderQuery, placeholder: "Order #, customer, contact, dish...", "aria-label": "Search orders" });
  const status = h("select", { "aria-label": "Filter order status" },
    [["all","All statuses"],["hold","Needs approval"],["cook","To cook"],["ready","Ready"],["done","Picked up"],["cancelled","Cancelled"]].map(([v,l]) => h("option", { value: v, selected: orderStatusFilter === v }, l)));
  const apply = () => { orderQuery = q.value.trim(); orderStatusFilter = status.value; render(); };
  status.addEventListener("change", apply);
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

/* ---------- orders ---------- */
function ticket(o) {
  const b = (to, txt, ghost) => h("button", { class: ghost ? "ghost" : "", onclick: () => {
    if (to === "cancelled") return cancelOrder(o);
    if (to === "ready") {
      if (!window.confirm(`Mark order #${o.id} ready? The customer will immediately be told to come pick it up.`)) return;
      return act(`/api/orders/${o.id}/status`, { status: to, confirm: true });
    }
    if (to === "done") {
      if (!window.confirm(`Mark order #${o.id} picked up? This closes the order and sends the thank-you message.`)) return;
      return act(`/api/orders/${o.id}/status`, { status: to, confirm: true });
    }
    return act(`/api/orders/${o.id}/status`, { status: to });
  } }, txt);
  const tones = { hold: "#e7882b", cook: "#1d6b4d", ready: "#2f8fb0", done: "#6f7c73", cancelled: "#c94f45" };
  const isCustom = o.items.some((i) => String(i.id || "").startsWith("custom:"));
  return h("article", { class: "ticket" + (isCustom ? " custom-ticket" : ""), style: "--ticket-tone:" + (tones[o.status] || "#1d6b4d") },
    h("div", { class: "ticket-title" }, h("b", {}, o.name), " #" + o.id, isCustom ? h("span", { class: "flag custom-flag" }, "Custom") : null),
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
  const q = orderQuery.toLowerCase();
  const orderPool = state.orders.filter(orderMatches);
  const attentionAllowed = orderStatusFilter === "all" || orderStatusFilter === "hold";
  const open = attentionAllowed
    ? state.alerts.filter((a) => !a.done && (!q || [a.id, a.orderId, a.cust, a.contact, a.note].join(" ").toLowerCase().includes(q.replace(/^#/, ""))))
    : [];
  const held = orderPool.filter((o) => o.status === "hold");
  const cooking = orderPool.filter((o) => o.status === "cook").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
  const ready = orderPool.filter((o) => o.status === "ready").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));
  const allDone = orderPool.filter((o) => o.status === "done");
  const allCancelled = orderPool.filter((o) => o.status === "cancelled");
  const done = allDone.slice(-12).reverse();
  const cancelled = allCancelled.slice(-8).reverse();

  const lane = (title, note, list, cls) => h("section", { class: "owner-lane " + cls },
    h("div", { class: "owner-section-head" },
      h("div", {}, h("h2", {}, title), h("p", { class: "sub" }, note)),
      h("span", { class: "lane-count" }, String(list.length))),
    list.length ? h("div", { class: "cols" }, list.map(ticket)) : h("div", { class: "empty" }, "Nothing here"));

  const out = [
    h("div", { class: "owner-page-title" },
      h("div", {}, h("h2", {}, "Orders"), h("p", { class: "sub" }, "Accept, prepare and hand off customer orders.")),
      h("div", { class: "owner-mini-counts" },
        h("span", {}, cooking.length + " cooking"),
        h("span", {}, ready.length + " ready"),
        (open.length + held.length) ? h("span", { class: "hot" }, (open.length + held.length) + " need you") : null))
  ];

  out.push(orderFilterBar());

  // A selected status is a true focused view. Do not hide cancelled/picked-up orders
  // inside the collapsed history section, and do not show unrelated empty lanes.
  if (orderStatusFilter !== "all") {
    if (orderStatusFilter === "hold") {
      if (open.length || held.length) {
        out.push(h("section", { class: "owner-attention" },
          h("div", { class: "owner-section-head" }, h("div", {}, h("h2", {}, "Needs approval"), h("p", { class: "sub" }, "Orders and requests waiting for your review."))),
          open.map((a) => {
            const o = a.orderId ? state.orders.find((x) => x.id === a.orderId) : null;
            return h("div", { class: "need" },
              h("span", {}, h("b", {}, a.cust + (a.contact ? " · " + a.contact : "")), h("small", {}, a.note)),
              h("span", { class: "need-actions" },
                isWeb(a.waId) ? h("button", { onclick: () => openChat(a.waId) }, "Open chat") : null,
                o && ["hold", "cook", "ready"].includes(o.status) ? h("button", { class: "bad", onclick: () => cancelOrder(o, () => act(`/api/alerts/${a.id}/done`)) }, "Cancel #" + o.id) : null,
                h("button", { onclick: () => act(`/api/alerts/${a.id}/done`) }, "Done")));
          }),
          held.length ? h("div", { class: "held-wrap" }, h("div", { class: "cols" }, held.map(ticket))) : null));
      } else {
        out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No orders need approval"), h("span", {}, "There are no held orders matching this filter.")));
      }
      return out;
    }

    const focused = {
      cook: ["To cook", "Confirmed and waiting to be prepared.", cooking, "lane-cook"],
      ready: ["Ready for pickup", "Packed and waiting for the customer.", ready, "lane-ready"],
      done: ["Picked up", "Completed orders.", allDone.slice().reverse(), "lane-done"],
      cancelled: ["Cancelled orders", "All cancelled orders matching your search.", allCancelled.slice().reverse(), "lane-cancelled"]
    }[orderStatusFilter];

    if (focused && focused[2].length) out.push(lane(focused[0], focused[1], focused[2], focused[3]));
    else out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No matching orders"), h("span", {}, "Try another search or clear the filter.")));
    return out;
  }

  if (open.length || held.length) {
    out.push(h("section", { class: "owner-attention" },
      h("div", { class: "owner-section-head" }, h("div", {}, h("h2", {}, "Needs you"), h("p", { class: "sub" }, "Customer requests and orders waiting for your approval."))),
      open.map((a) => {
        const o = a.orderId ? state.orders.find((x) => x.id === a.orderId) : null;
        return h("div", { class: "need" },
          h("span", {}, h("b", {}, a.cust + (a.contact ? " · " + a.contact : "")), h("small", {}, a.note)),
          h("span", { class: "need-actions" },
            isWeb(a.waId) ? h("button", { onclick: () => openChat(a.waId) }, "Open chat") : null,
            o && ["hold", "cook", "ready"].includes(o.status) ? h("button", { class: "bad", onclick: () => cancelOrder(o, () => act(`/api/alerts/${a.id}/done`)) }, "Cancel #" + o.id) : null,
            h("button", { onclick: () => act(`/api/alerts/${a.id}/done`) }, "Done")));
      }),
      held.length ? h("div", { class: "held-wrap" },
        h("p", { class: "sub" }, "Held orders need approval before they enter the kitchen."),
        h("div", { class: "cols" }, held.map(ticket))) : null));
  }

  if (!orderPool.length && !open.length) {
    out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No orders yet"), h("span", {}, "Customer orders will appear here as soon as they are submitted.")));
    return out;
  }

  out.push(h("div", { class: "order-lanes" },
    lane("To cook", "Confirmed and waiting to be prepared.", cooking, "lane-cook"),
    lane("Ready for pickup", "Packed and waiting for the customer.", ready, "lane-ready")));

  if (done.length || cancelled.length) {
    out.push(h("details", { class: "history" },
      h("summary", {}, "Order history · " + (done.length + cancelled.length) + " recent"),
      done.length ? h("section", {}, h("h3", {}, "Picked up"), h("div", { class: "cols" }, done.map(ticket))) : null,
      cancelled.length ? h("section", {}, h("h3", {}, "Cancelled"), h("div", { class: "cols" }, cancelled.map(ticket))) : null));
  }
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
  if (/^(?:ok(?:ay)?|yes|no|sure|thanks|thank you)\b/i.test(text) && text.split(/\s+/).length <= 4 && !window.confirm("This reply is very short and will appear to the customer exactly as written: “" + text + "”. Send it?")) return;
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
function closeChat() {
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

function chatFilterBar() {
  const q = h("input", { type: "search", value: chatQuery, placeholder: "Search customer, contact or message...", "aria-label": "Search customer chats" });
  return h("form", { class: "owner-filters chat-filters", onsubmit: (e) => { e.preventDefault(); chatQuery = q.value.trim(); render(); } },
    q,
    h("button", { class: "pri", type: "submit" }, "Search"),
    chatQuery ? h("button", { class: "ghost", type: "button", onclick: () => { chatQuery = ""; render(); } }, "Clear") : null);
}

function renderChats() {
  const q = chatQuery.toLowerCase();
  const filteredCustomers = state.customers.filter((c) => !q || [c.name, c.contact, c.last && c.last.text].join(" ").toLowerCase().includes(q));
  const title = h("div", { class: "owner-page-title chat-title" },
    h("div", {}, h("h2", {}, "Customer chats"), h("p", { class: "sub" }, "Read conversations and reply as Annapurna.")),
    h("span", { class: "lane-count" }, String(filteredCustomers.length)));

  const list = h("div", { class: "clist" },
    filteredCustomers.length ? filteredCustomers.map((c) => {
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
      chat.messages.length ? chat.messages.map((m) => {
        const who = m.who === "cust" ? "Customer" : m.who === "owner" ? "You" : "Vindhu";
        return h("div", { class: "b " + m.who },
          h("small", {}, who + " · " + timeOf(m.ts)),
          h("span", { class: "chat-message-text" }, m.text));
      }) : h("div", { class: "empty" }, "No chat messages are available. The customer may have deleted this chat or started a new session."));

    right = h("div", { class: "card thread" },
      head,
      messages,
      isWeb(chat.waId)
        ? h("div", { class: "chat-compose" }, h("small", {}, "Replies appear in the customer's chat."), form)
        : h("div", { class: "chat-compose test-only" }, h("small", {}, "Test customer — replies are not delivered anywhere.")));
  }
  return [title, chatFilterBar(), h("div", { class: "chatgrid" + (chat.waId ? " has-thread" : "") }, list, right)];
}

/* ---------- cook ---------- */
function renderCook() {
  if (!cook) {
    api("/api/cook").then((c) => { cook = c; render(); }).catch(showErr);
    return h("div", { class: "empty owner-loading" }, "Preparing kitchen list...");
  }
  const out = [
    h("div", { class: "owner-page-title" },
      h("div", {}, h("h2", {}, "Kitchen"), h("p", { class: "sub" }, "Everything currently in To cook, grouped for prep.")),
      h("span", { class: "owner-kitchen-mark", "aria-hidden": "true" }, "♨"))
  ];
  if (!cook.days.length) out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "Kitchen is clear"), h("span", {}, "Accepted orders will appear here.")));
  for (const d of cook.days) {
    out.push(h("section", { class: "card kitchen-day" },
      h("div", { class: "owner-section-head" }, h("div", {}, h("h2", {}, d.label), h("p", { class: "sub" }, d.dishes.length + " dish" + (d.dishes.length === 1 ? "" : "es") + " to prepare"))),
      h("div", { class: "table-wrap" }, h("table", {}, h("tr", {}, h("th", {}, "Dish"), h("th", {}, "Qty"), h("th", {}, "For")),
        d.dishes.map((x) => h("tr", {}, h("td", {}, h("b", {}, x.name)), h("td", {}, x.qty + (x.plan ? (x.qty === 1 ? " person" : " people") : (x.qty === 1 ? " meal" : " meals"))), h("td", {}, x.who.join(", "))))))));
  }
  out.push(h("div", { class: "owner-section-head buy-head" }, h("div", {}, h("h2", {}, "Buy list"), h("p", { class: "sub" }, "Calculated from ingredient recipes on active cook orders."))));
  if (cook.buy.length) {
    out.push(h("div", { class: "card buy-card" },
      h("div", { class: "table-wrap" }, h("table", {}, cook.buy.map((r) => h("tr", {}, h("td", {}, h("b", {}, r.name)), h("td", {}, r.text.split(": ").slice(1).join(": "))))),
      h("div", { class: "buy-actions" }, h("button", { class: "pri", onclick: () => navigator.clipboard && navigator.clipboard.writeText(cook.buy.map((r) => r.text).join("\n")) }, "Copy buy list")))));
  }
  if (cook.missingRecipe.length) out.push(h("div", { class: "owner-note" }, "Ingredients are not set for: " + cook.missingRecipe.join(", ") + ". Add them in Menu."));
  if (!cook.buy.length && cook.days.length) out.push(h("div", { class: "empty" }, "Set ingredients per dish in Menu to automatically build the buy list."));
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
    h("div", { class: "owner-page-title" },
      h("div", {}, h("button", { class: "owner-back", onclick: () => { tab = "more"; render(); } }, "← More"), h("h2", {}, "Menu"), h("p", { class: "sub" }, "Prices, availability and ingredients used by the ordering assistant."))),
    h("p", { class: "owner-note" }, "The assistant quotes only what is here. Switch a weekend combo off when it is not running. Dishes with no price are sent to you to confirm."),
    h("div", { class: "card", style: "overflow-x:auto" }, h("table", {},
      h("tr", {}, ["Item", "Single $", "Buy 1 Get 1 $", "Plan $", "Running", ""].map((t) => h("th", {}, t))),
      state.menu.map((m) => h("tr", {},
        h("td", {}, m.name,
          m.days && m.days.length ? h("div", { class: "sub" }, "Pickup only: " + m.days.map((d) => DAYS[d]).join(", ")) : null,
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
  const comboDays = h("div", { class: "days" }, DAYS.map((d, i) => h("label", {}, h("input", { type: "checkbox", value: String(i), checked: (s.comboDays || []).includes(i) }), d)));
  const insta = h("input", { type: "text", value: s.contactInstagram || "", maxlength: "40", id: "setInsta", placeholder: "annapurna_hometaste" });
  const phone = h("input", { type: "text", value: s.contactPhone || "", maxlength: "30", id: "setPhone", placeholder: "Leave empty to show no phone number" });
  const msg = h("span", { class: "ok" });
  const ipBox = h("p", { class: "sub" }, "Checking your address...");
  api("/api/whoami").then((j) => {
    ipBox.textContent = "The server sees you as " + j.ip + " (PROXY_HOPS=" + j.proxyHops + "). Compare with your real public IP. If it shows your host's address instead, or the same address for everyone, fix PROXY_HOPS or the rate limits will treat all customers as one person.";
  }).catch(() => { ipBox.textContent = ""; });
  const save = async () => {
    const picked = [...days.querySelectorAll("input:checked")].map((x) => Number(x.value));
    const pickedCombo = [...comboDays.querySelectorAll("input:checked")].map((x) => Number(x.value));
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ noticeHrs: Number(notice.value), address: addr.value, days: picked, comboDays: pickedCombo, contactInstagram: insta.value, contactPhone: phone.value, notes: notes.value, weeklyMenu: weekly.value }) });
      msg.textContent = "Saved.";
      showErr(null);
    } catch (e) {
      msg.textContent = "";
      showErr(e);
    }
  };
  return [
    h("div", { class: "owner-page-title" },
      h("div", {}, h("button", { class: "owner-back", onclick: () => { tab = "more"; render(); } }, "← More"), h("h2", {}, "Business rules"), h("p", { class: "sub" }, "Pickup, contact and assistant settings."))),
    h("p", { class: "owner-note" }, "Time zone: " + s.tz + ". The assistant and the checks in code both use these."),
    h("div", { class: "card grid2" },
      h("label", {}, "Minimum notice (hours)", notice),
      h("label", {}, "Pickup address", addr),
      h("div", {}, h("div", { class: "sub" }, "Pickup days for weekly plans"), days),
      h("div", {}, h("div", { class: "sub" }, "Pickup days for weekend combos"), comboDays),
      h("label", {}, "Instagram handle shown to customers", insta),
      h("label", {}, "Phone number shown to customers (optional)", phone),
      h("label", {}, "Weekly plan shown to customers (one day per line, like Monday: ...)", weekly),
      h("label", {}, "Notes for the assistant (box sizes, rules, anything it should know. Customers do not see this.)", notes),
      h("div", {}, h("button", { class: "pri", onclick: save }, "Save"), " ", msg)),
    h("h2", {}, "Rate-limit check"),
    ipBox,
  ];
}

/* ---------- more / settings hub ---------- */
function renderMore() {
  const cards = [
    h("button", { class: "more-card", onclick: () => { tab = "menu"; render(); } },
      h("span", { class: "more-icon", "aria-hidden": "true" }, "☰"),
      h("span", {}, h("b", {}, "Menu management"), h("small", {}, "Prices, availability and ingredients"))),
    h("button", { class: "more-card", onclick: () => { tab = "rules"; render(); } },
      h("span", { class: "more-icon", "aria-hidden": "true" }, "⚙"),
      h("span", {}, h("b", {}, "Business rules"), h("small", {}, "Pickup days, notice, address and contact")))
  ];
  if (state.features && state.features.simulator) {
    cards.push(h("button", { class: "more-card", onclick: () => { tab = "sim"; render(); } },
      h("span", { class: "more-icon", "aria-hidden": "true" }, "◉"),
      h("span", {}, h("b", {}, "Test chat"), h("small", {}, "Run simulator messages without a customer"))));
  }
  return [
    h("div", { class: "owner-page-title" }, h("div", {}, h("h2", {}, "More"), h("p", { class: "sub" }, "Menu, business rules and testing tools."))),
    h("div", { class: "more-grid" }, cards)
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
  return [
    h("div", { class: "owner-page-title" }, h("div", {}, h("button", { class: "owner-back", onclick: () => { tab = "more"; render(); } }, "← More"), h("h2", {}, "Test chat"), h("p", { class: "sub" }, "Simulator only — no customer receives these messages."))),
    h("div", { class: "card thread" },
    h("div", { style: "display:flex;gap:6px" }, from, name),
    h("div", { class: "msgs" }, sim.msgs.map((m) => h("div", { class: m.cls === "meta" ? "meta" : "b " + m.cls }, m.text))),
    h("div", { style: "display:flex;gap:6px;overflow-x:auto;padding:6px 0" }, CHIPS.map((c) => h("button", { type: "button", onclick: () => simSend(c) }, c))),
    form)];
}

/* ---------- shell ---------- */
function renderTabs() {
  const need = state.orders.filter((o) => o.status === "hold").length + state.alerts.filter((a) => !a.done).length;
  const tabs = [["dashboard", "Dashboard"], ["orders", "Orders"], ["cook", "Kitchen"], ["chats", "Chats"], ["more", "More"]];
  const selected = (k) => k === tab || (k === "more" && ["menu", "rules", "sim"].includes(tab));
  $("tabs").replaceChildren(...tabs.map(([k, t]) => h("button", { role: "tab", "aria-selected": String(selected(k)), onclick: () => { tab = k; cook = null; if (k === "chats") chat = { waId: "", messages: [], customer: null }; render(); } }, t, k === "orders" && need ? h("span", { class: "badge" }, need) : null)));
}
function render() {
  document.body.classList.toggle("chat-open-mobile", tab === "chats" && !!chat.waId);
  renderTabs();
  const body = tab === "dashboard" ? renderDashboard() : tab === "orders" ? renderOrders() : tab === "chats" ? renderChats() : tab === "cook" ? renderCook() : tab === "menu" ? renderMenu() : tab === "rules" ? renderRules() : tab === "more" ? renderMore() : renderSim();
  $("panel").replaceChildren(...[body].flat());
  const box = $("thread");
  if (box) box.scrollTop = box.scrollHeight;
}

const ownerBrandHome = $("ownerBrandHome");
if (ownerBrandHome) ownerBrandHome.addEventListener("click", () => {
  tab = "dashboard";
  cook = null;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

refresh();
setInterval(refresh, 8000);
