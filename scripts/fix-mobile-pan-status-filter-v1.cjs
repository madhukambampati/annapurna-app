const fs = require('fs');

function replaceOnce(src, needle, replacement, label) {
  if (!src.includes(needle)) throw new Error(`Missing ${label}`);
  return src.replace(needle, replacement);
}

// Customer viewport: prevent the whole page from drifting horizontally on iOS while
// preserving intentional horizontal scrollers inside the app.
{
  const path = 'public/index.html';
  let s = fs.readFileSync(path, 'utf8');
  if (!s.includes('id="viewportPanFixV1"')) {
    const css = `\n<style id="viewportPanFixV1">\n/* Keep the document pinned to the viewport on touch devices. Internal scrollers still work. */\nhtml{width:100%;max-width:100%;overflow-x:hidden;overscroll-behavior-x:none}\nbody{width:100%;max-width:100vw;overflow-x:hidden;overscroll-behavior-x:none}\nbody.customer-mode{position:relative}\n.customer-mode .app{width:100%;max-width:min(820px,100vw);overflow-x:hidden}\n.customer-mode .top,.customer-mode .customer-home,.customer-mode .chat,.customer-mode .msgs,.customer-mode .composer,.customer-mode .sheet{min-width:0;max-width:100%}\n</style>\n`;
    s = replaceOnce(s, '</head>', css + '</head>', 'customer </head>');
    fs.writeFileSync(path, s);
  }
}

// Owner viewport: same protection for the desk, especially on iPhone Safari.
{
  const path = 'public/desk.html';
  let s = fs.readFileSync(path, 'utf8');
  if (!s.includes('id="ownerViewportPanFixV1"')) {
    const css = `\n<style id="ownerViewportPanFixV1">\nhtml{width:100%;max-width:100%;overflow-x:hidden;overscroll-behavior-x:none}\nbody.owner-mode{width:100%;max-width:min(1180px,100vw);overflow-x:hidden;overscroll-behavior-x:none;box-sizing:border-box}\nbody.owner-mode #panel,body.owner-mode .owner-page-title,body.owner-mode .owner-filters,body.owner-mode .order-lanes,body.owner-mode .owner-lane,body.owner-mode .cols,body.owner-mode .ticket{min-width:0;max-width:100%}\n</style>\n`;
    s = replaceOnce(s, '</head>', css + '</head>', 'owner </head>');
    fs.writeFileSync(path, s);
  }
}

// Owner order filters: when a status is chosen, show that status as a focused result
// instead of leaving it collapsed under history or surrounded by unrelated empty lanes.
{
  const path = 'public/desk.js';
  let s = fs.readFileSync(path, 'utf8');

  const oldFilter = `  const apply = () => { orderQuery = q.value.trim(); orderStatusFilter = status.value; render(); };\n  return h("form", { class: "owner-filters", onsubmit: (e) => { e.preventDefault(); apply(); } },`;
  const newFilter = `  const apply = () => { orderQuery = q.value.trim(); orderStatusFilter = status.value; render(); };\n  status.addEventListener("change", apply);\n  return h("form", { class: "owner-filters", onsubmit: (e) => { e.preventDefault(); apply(); } },`;
  if (!s.includes('status.addEventListener("change", apply);')) {
    s = replaceOnce(s, oldFilter, newFilter, 'status filter apply block');
  }

  const start = s.indexOf('function renderOrders() {');
  const endMarker = '\n\n/* ---------- chats ---------- */';
  const end = s.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Missing renderOrders block');

  const replacement = `function renderOrders() {\n  const q = orderQuery.toLowerCase();\n  const orderPool = state.orders.filter(orderMatches);\n  const attentionAllowed = orderStatusFilter === "all" || orderStatusFilter === "hold";\n  const open = attentionAllowed\n    ? state.alerts.filter((a) => !a.done && (!q || [a.id, a.orderId, a.cust, a.contact, a.note].join(" ").toLowerCase().includes(q.replace(/^#/, ""))))\n    : [];\n  const held = orderPool.filter((o) => o.status === "hold");\n  const cooking = orderPool.filter((o) => o.status === "cook").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));\n  const ready = orderPool.filter((o) => o.status === "ready").sort((a, b) => String(a.pickup || "9").localeCompare(String(b.pickup || "9")));\n  const allDone = orderPool.filter((o) => o.status === "done");\n  const allCancelled = orderPool.filter((o) => o.status === "cancelled");\n  const done = allDone.slice(-12).reverse();\n  const cancelled = allCancelled.slice(-8).reverse();\n\n  const lane = (title, note, list, cls) => h("section", { class: "owner-lane " + cls },\n    h("div", { class: "owner-section-head" },\n      h("div", {}, h("h2", {}, title), h("p", { class: "sub" }, note)),\n      h("span", { class: "lane-count" }, String(list.length))),\n    list.length ? h("div", { class: "cols" }, list.map(ticket)) : h("div", { class: "empty" }, "Nothing here"));\n\n  const out = [\n    h("div", { class: "owner-page-title" },\n      h("div", {}, h("h2", {}, "Orders"), h("p", { class: "sub" }, "Accept, prepare and hand off customer orders.")),\n      h("div", { class: "owner-mini-counts" },\n        h("span", {}, cooking.length + " cooking"),\n        h("span", {}, ready.length + " ready"),\n        (open.length + held.length) ? h("span", { class: "hot" }, (open.length + held.length) + " need you") : null))\n  ];\n\n  out.push(orderFilterBar());\n\n  // A selected status is a true focused view. Do not hide cancelled/picked-up orders\n  // inside the collapsed history section, and do not show unrelated empty lanes.\n  if (orderStatusFilter !== "all") {\n    if (orderStatusFilter === "hold") {\n      if (open.length || held.length) {\n        out.push(h("section", { class: "owner-attention" },\n          h("div", { class: "owner-section-head" }, h("div", {}, h("h2", {}, "Needs approval"), h("p", { class: "sub" }, "Orders and requests waiting for your review."))),\n          open.map((a) => {\n            const o = a.orderId ? state.orders.find((x) => x.id === a.orderId) : null;\n            return h("div", { class: "need" },\n              h("span", {}, h("b", {}, a.cust + (a.contact ? " · " + a.contact : "")), h("small", {}, a.note)),\n              h("span", { class: "need-actions" },\n                isWeb(a.waId) ? h("button", { onclick: () => openChat(a.waId) }, "Open chat") : null,\n                o && ["hold", "cook", "ready"].includes(o.status) ? h("button", { class: "bad", onclick: () => cancelOrder(o, () => act(\`/api/alerts/\${a.id}/done\`)) }, "Cancel #" + o.id) : null,\n                h("button", { onclick: () => act(\`/api/alerts/\${a.id}/done\`) }, "Done")));\n          }),\n          held.length ? h("div", { class: "held-wrap" }, h("div", { class: "cols" }, held.map(ticket))) : null));\n      } else {\n        out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No orders need approval"), h("span", {}, "There are no held orders matching this filter.")));\n      }\n      return out;\n    }\n\n    const focused = {\n      cook: ["To cook", "Confirmed and waiting to be prepared.", cooking, "lane-cook"],\n      ready: ["Ready for pickup", "Packed and waiting for the customer.", ready, "lane-ready"],\n      done: ["Picked up", "Completed orders.", allDone.slice().reverse(), "lane-done"],\n      cancelled: ["Cancelled orders", "All cancelled orders matching your search.", allCancelled.slice().reverse(), "lane-cancelled"]\n    }[orderStatusFilter];\n\n    if (focused && focused[2].length) out.push(lane(focused[0], focused[1], focused[2], focused[3]));\n    else out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No matching orders"), h("span", {}, "Try another search or clear the filter.")));\n    return out;\n  }\n\n  if (open.length || held.length) {\n    out.push(h("section", { class: "owner-attention" },\n      h("div", { class: "owner-section-head" }, h("div", {}, h("h2", {}, "Needs you"), h("p", { class: "sub" }, "Customer requests and orders waiting for your approval."))),\n      open.map((a) => {\n        const o = a.orderId ? state.orders.find((x) => x.id === a.orderId) : null;\n        return h("div", { class: "need" },\n          h("span", {}, h("b", {}, a.cust + (a.contact ? " · " + a.contact : "")), h("small", {}, a.note)),\n          h("span", { class: "need-actions" },\n            isWeb(a.waId) ? h("button", { onclick: () => openChat(a.waId) }, "Open chat") : null,\n            o && ["hold", "cook", "ready"].includes(o.status) ? h("button", { class: "bad", onclick: () => cancelOrder(o, () => act(\`/api/alerts/\${a.id}/done\`)) }, "Cancel #" + o.id) : null,\n            h("button", { onclick: () => act(\`/api/alerts/\${a.id}/done\`) }, "Done")));\n      }),\n      held.length ? h("div", { class: "held-wrap" },\n        h("p", { class: "sub" }, "Held orders need approval before they enter the kitchen."),\n        h("div", { class: "cols" }, held.map(ticket))) : null));\n  }\n\n  if (!orderPool.length && !open.length) {\n    out.push(h("div", { class: "empty owner-empty-large" }, h("b", {}, "No orders yet"), h("span", {}, "Customer orders will appear here as soon as they are submitted.")));\n    return out;\n  }\n\n  out.push(h("div", { class: "order-lanes" },\n    lane("To cook", "Confirmed and waiting to be prepared.", cooking, "lane-cook"),\n    lane("Ready for pickup", "Packed and waiting for the customer.", ready, "lane-ready")));\n\n  if (done.length || cancelled.length) {\n    out.push(h("details", { class: "history" },\n      h("summary", {}, "Order history · " + (done.length + cancelled.length) + " recent"),\n      done.length ? h("section", {}, h("h3", {}, "Picked up"), h("div", { class: "cols" }, done.map(ticket))) : null,\n      cancelled.length ? h("section", {}, h("h3", {}, "Cancelled"), h("div", { class: "cols" }, cancelled.map(ticket))) : null));\n  }\n  return out;\n}`;

  s = s.slice(0, start) + replacement + s.slice(end);
  fs.writeFileSync(path, s);
}

console.log('Applied viewport lock and focused owner status filtering.');
