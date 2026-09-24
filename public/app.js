(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TOKEN_KEY = "annapurna-token";
  var NAME_KEY = "annapurna-name";
  var CHIPS = ["What's on the menu?", "Tell me about the weekly plans", "What weekend combos are running?"];
  var STATUS = {
    hold: ["Waiting for Maddy to confirm", ""],
    cook: ["Being prepared", ""],
    ready: ["Ready for pickup", "ready"],
    done: ["Picked up", "done"],
    cancelled: ["Cancelled", "cancelled"]
  };

  var token = "", lastId = 0, busy = false, seen = {}, orders = [], pollTimer = 0, sheetOpen = "";

  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else if (v !== undefined) localStorage.setItem(k, v); else return localStorage.getItem(k); } catch (e) { /* private mode */ } return null; }

  /* tiny DOM helper: text only, never innerHTML, so customer text can never run as HTML */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      if (k === "class") el.className = a[k];
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), a[k]);
      else if (a[k] === true) el.setAttribute(k, "");
      else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (Array.isArray(kid)) kid.forEach(function (x) { if (x != null) el.append(x.nodeType ? x : document.createTextNode(String(x))); });
      else if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function api(method, path, body) {
    var headers = { "content-type": "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    return fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || "Something went wrong. Please try again.");
          e.status = r.status; e.retryAfter = Number(r.headers.get("retry-after")) || 0;
          throw e;
        }
        return j;
      });
    });
  }

  function money(n) { return n == null ? "Ask Maddy" : "$" + (Math.round(n * 100) / 100); }
  function clock(ts) { try { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }

  /* ---------- screens ---------- */
  function show(which) {
    $("onboard").hidden = which !== "onboard";
    $("chat").hidden = which !== "chat";
    $("btnOrders").hidden = which !== "chat";
  }

  function toBoarding(msg) {
    token = ""; store(TOKEN_KEY, null);
    stopPolling();
    show("onboard");
    $("startErr").textContent = msg || "";
  }

  /* ---------- chat ---------- */
  var msgsEl = $("msgs");

  function bubble(m, pending) {
    var kids = [];
    if (m.who === "owner") kids.push(h("span", { class: "who" }, "Maddy"));
    kids.push(m.text);
    kids.push(h("time", {}, m.ts ? clock(m.ts) : ""));
    return h("div", { class: "b " + m.who + (pending ? " pending" : ""), "data-id": m.id || "" }, kids);
  }

  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  function renderEmptyHello() {
    if (msgsEl.children.length) return;
    msgsEl.append(h("div", { class: "hello", id: "hello" }, "Namaste" + (store(NAME_KEY) ? ", " + store(NAME_KEY) : "") + "! Ask about our menu or tell me what you'd like to order. I'll check everything with you before Maddy cooks it."));
  }

  function addMessages(list) {
    var added = false;
    list.forEach(function (m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      if (m.id > lastId) lastId = m.id;
      var hello = $("hello"); if (hello) hello.remove();
      msgsEl.append(bubble(m));
      added = true;
    });
    if (added) scrollDown();
    return added;
  }

  function setBusy(b) {
    busy = b;
    $("sendBtn").disabled = b;
    var t = $("typing");
    if (b && !t) { msgsEl.append(h("div", { class: "typing", id: "typing", "aria-label": "Assistant is typing" }, h("i"), h("i"), h("i"))); scrollDown(); }
    if (!b && t) t.remove();
  }

  function toast(text) {
    var old = msgsEl.querySelector(".toast"); if (old) old.remove();
    var t = h("div", { class: "toast", role: "status" }, text);
    msgsEl.append(t); scrollDown();
    setTimeout(function () { t.remove(); }, 6000);
  }

  function errText(e) {
    if (e.status === 429) return "That's a lot of messages. Please wait " + (e.retryAfter || 30) + " seconds.";
    if (e.status === 503) return e.message;
    return e.message || "Couldn't send. Please try again.";
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    var pend = bubble({ who: "cust", text: text, ts: Date.now() }, true);
    var hello = $("hello"); if (hello) hello.remove();
    msgsEl.append(pend); scrollDown();
    $("text").value = ""; resizeBox();
    setBusy(true);
    api("POST", "/web/message", { text: text }).then(function (j) {
      pend.remove();
      addMessages(j.messages || []);
      if (j.orderId) loadOrders();
    }).catch(function (e) {
      pend.remove();
      if (e.status === 401) { toBoarding(e.message); return; }
      $("text").value = text; resizeBox();
      toast(errText(e));
    }).then(function () { setBusy(false); $("text").focus(); });
  }

  function resizeBox() {
    var t = $("text"); t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px";
  }

  function poll() {
    if (document.hidden || !token || busy) return;
    api("GET", "/web/history?after=" + lastId).then(function (j) { addMessages(j.messages || []); }).catch(function (e) { if (e.status === 401) toBoarding(e.message); });
    loadOrders();
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(poll, 7000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = 0; }

  function openChat() {
    show("chat");
    msgsEl.replaceChildren(); seen = {}; lastId = 0;
    renderEmptyHello();
    api("GET", "/web/history?after=0").then(function (j) { addMessages(j.messages || []); if (j.name) store(NAME_KEY, j.name); }).catch(function (e) { if (e.status === 401) toBoarding("Your chat expired. Please start a new one."); });
    loadOrders();
    startPolling();
  }

  /* ---------- orders ---------- */
  function loadOrders() {
    if (!token) return;
    api("GET", "/web/orders").then(function (j) {
      orders = j.orders || [];
      var active = orders.filter(function (o) { return o.status === "hold" || o.status === "cook" || o.status === "ready"; }).length;
      var dot = $("ordDot"); dot.hidden = !active; dot.textContent = String(active);
      if (sheetOpen === "orders") renderOrders();
    }).catch(function () { /* polling is best effort */ });
  }

  function renderOrders() {
    var body = $("sheetBody"); body.replaceChildren();
    if (!orders.length) { body.append(h("p", { class: "tiny" }, "No orders yet. Once Maddy confirms an order it shows up here.")); return; }
    orders.forEach(function (o) {
      var st = STATUS[o.status] || [o.status, ""];
      body.append(h("div", { class: "ord" },
        h("div", {}, h("b", {}, "Order #" + o.id + " "), h("span", { class: "st " + st[1] }, st[0])),
        h("ul", {}, o.items.map(function (x) { return h("li", {}, x); })),
        h("div", { class: "tiny" }, "Pickup: " + o.pickupText + (o.status === "ready" || o.status === "cook" ? " at " + o.address : "")),
        h("div", {}, h("b", {}, o.total == null ? "Total to be confirmed by Maddy" : "Total: " + money(o.total)))
      ));
    });
  }

  /* ---------- sheets ---------- */
  function openSheet(kind, title) {
    sheetOpen = kind;
    $("sheetTitle").textContent = title;
    $("veil").hidden = false;
    $("sheetClose").focus();
  }
  function closeSheet() { sheetOpen = ""; $("veil").hidden = true; }

  function showMenu() {
    openSheet("menu", "Menu");
    var body = $("sheetBody"); body.replaceChildren(h("p", { class: "tiny" }, "Loading..."));
    fetch("/web/menu").then(function (r) { return r.json(); }).then(function (m) {
      body.replaceChildren();
      var groups = [["plan", "Weekly plans (per person per week)"], ["combo", "Weekend combos"], ["item", "Other"]];
      groups.forEach(function (g) {
        var list = (m.items || []).filter(function (x) { return x.kind === g[0]; });
        if (!list.length) return;
        body.append(h("h3", {}, g[1]));
        list.forEach(function (x) {
          var price = [];
          if (x.kind === "plan") price.push(h("span", {}, money(x.plan)));
          else {
            price.push(h("span", {}, money(x.single)));
            if (x.kind === "combo") price.push(h("small", {}, "Buy 1 Get 1: " + money(x.bogo)));
          }
          var off = !x.live;
          var kids = [h("div", {}, h("b", {}, x.name), x.desc ? h("small", {}, x.desc) : null, off ? h("small", {}, "Not running this weekend") : null)];
          var right = h("div", {});
          var pr = h("div", { class: "price" }, price);
          right.append(pr);
          if (!off && !(x.kind === "combo" && x.single == null && x.bogo == null)) {
            right.append(h("button", { class: "hbtn", type: "button", onclick: function () { closeSheet(); $("text").value = "I'd like to order the " + x.name; resizeBox(); $("text").focus(); } }, "Order"));
          }
          kids.push(right);
          body.append(h("div", { class: "item" + (off ? " off" : "") }, kids));
        });
      });
      if ((m.weekly || []).length) {
        body.append(h("h3", {}, "Weekly plan, day by day"));
        var wk = h("div", { class: "ord" });
        m.weekly.forEach(function (line) {
          var i = line.indexOf(": ");
          if (i > 0 && i < 40) wk.append(h("p", { class: "wk" }, h("b", {}, line.slice(0, i + 1) + " "), line.slice(i + 2)));
          else wk.append(h("p", { class: "wk tiny" }, line));
        });
        body.append(wk);
      }
      body.append(h("p", { class: "tiny" }, "Pickup " + (m.pickupDays || []).join(", ") + ". Please order at least " + m.noticeHrs + " hours ahead. Prices in CAD."));
      if ($("chat").hidden) {
        body.append(h("button", { class: "btn", type: "button", onclick: closeSheet }, "Start an order"));
      }
    }).catch(function () { body.replaceChildren(h("p", { class: "err" }, "Couldn't load the menu. Please try again.")); });
  }

  function showOrders() { openSheet("orders", "Your orders"); renderOrders(); loadOrders(); }

  function deleteChat() {
    if (!confirm("Delete this chat from our system? Orders already placed stay so Maddy can cook them.")) return;
    api("DELETE", "/web/me").then(function () { store(NAME_KEY, null); toBoarding("Your chat was deleted."); }).catch(function (e) { toast(errText(e)); });
  }

  /* ---------- wiring ---------- */
  $("chips").append.apply($("chips"), CHIPS.map(function (c) { return h("button", { type: "button", onclick: function () { send(c); } }, c); }));
  $("chips").append(h("button", { type: "button", onclick: deleteChat }, "Delete my chat"));

  $("btnMenu").addEventListener("click", showMenu);
  $("btnOrders").addEventListener("click", showOrders);
  $("startMenu").addEventListener("click", showMenu);
  $("sheetClose").addEventListener("click", closeSheet);
  $("veil").addEventListener("click", function (e) { if (e.target === $("veil")) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("veil").hidden) closeSheet(); });

  $("composer").addEventListener("submit", function (e) { e.preventDefault(); send($("text").value); });
  $("text").addEventListener("input", resizeBox);
  $("text").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($("text").value); }
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });

  $("startForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("startErr"); err.textContent = "";
    var name = $("fName").value.trim(), contact = $("fContact").value.trim();
    if (!name) { err.textContent = "Please enter your name."; return; }
    if (!contact) { err.textContent = "Please enter a phone number or email."; return; }
    if (!$("fConsent").checked) { err.textContent = "Please tick the box to continue."; return; }
    $("startBtn").disabled = true;
    api("POST", "/web/session", { name: name, contact: contact, consent: true }).then(function (j) {
      token = j.token; store(TOKEN_KEY, token); store(NAME_KEY, j.name || name);
      openChat();
    }).catch(function (e2) { err.textContent = e2.status === 429 ? "Too many new chats from this network. Please try again later." : e2.message; })
      .then(function () { $("startBtn").disabled = false; });
  });

  /* ---------- start ---------- */
  token = store(TOKEN_KEY) || "";
  if (token) openChat(); else show("onboard");
})();
