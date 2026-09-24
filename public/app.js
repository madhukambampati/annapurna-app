(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TOKEN_KEY = "annapurna-token";
  var NAME_KEY = "annapurna-name";
  var CHIPS = ["What's on the menu?", "Tell me about the weekly plans", "What weekend combos are running?"];
  var STATUS = {
    hold: ["Waiting for our OK", "hold"],
    cook: ["Confirmed", "cook"],
    ready: ["Ready for pickup", "ready"],
    done: ["Picked up", "done"],
    cancelled: ["Cancelled", "cancelled"]
  };
  var STEP_OF = { hold: 0, cook: 1, ready: 2, done: 3 };
  var STEPS = ["Received", "Confirmed", "Ready", "Picked up"];
  var SVGNS = "http://www.w3.org/2000/svg";
  var ICONS = {
    bowl: ["M4 11h16c0 5-3.6 8-8 8s-8-3-8-8z", "M9 7c-1-1 1-2 0-3M13 7c-1-1 1-2 0-3", "M8 21h8"],
    check: ["M5 12.5 9.5 17 19 7.5"],
    clock: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
    insta: ["M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z", "M16 11.4a4 4 0 1 1-7.9 1.2 4 4 0 0 1 7.9-1.2z", "M17.5 6.5v.01"],
    phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
    person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
    trash: ["M5 7h14M10 11v6M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
    plus: ["M12 5v14M5 12h14"]
  };

  var token = "", lastId = 0, busy = false, seen = {}, orders = [], pollTimer = 0;
  var sheetOpen = "", lastFocus = null, menuData = null, handoff = null, confirmingDelete = false;

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
      if (Array.isArray(kid)) kid.forEach(function (x) { if (x != null && x !== false) el.append(x.nodeType ? x : document.createTextNode(String(x))); });
      else if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function icon(name) {
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true");
    (ICONS[name] || []).forEach(function (d) { var p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); s.append(p); });
    return s;
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

  function money(n) { return n == null ? "Ask us" : "$" + (Math.round(n * 100) / 100); }
  function clock(ts) { try { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }


  /* ---------- Annu, the tiffin mascot ---------- */
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function mascot(cls) {
    var tpl = $("tplMascot");
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) return h("span");
    var n = tpl.content.firstElementChild.cloneNode(true);
    n.setAttribute("class", "mascot" + (cls ? " " + cls : ""));
    return n;
  }
  function hop(m) {
    if (!m) return;
    m.classList.remove("jump"); void m.getBoundingClientRect(); m.classList.add("jump");
    setTimeout(function () { m.classList.remove("jump"); }, 900);
  }
  var GREETS = ["Namaste! I'm Annu.", "Hungry? Let's get you some food.", "Fresh from our Kitchener kitchen.", "Tell me what you'd like. I'll do the rest."];
  var TAPS = ["Hehe, that tickles!", "Ready when you are!", "Pulao or kheema today?", "Psst, ask me about weekend combos."];
  function initHero() {
    var slot = $("heroMascot"), bub = $("bubble");
    if (!slot || slot.firstChild) return;
    var m = mascot("pop");
    slot.append(m);
    var gi = 0, ti = 0;
    function say(t) {
      if (REDUCED) { bub.textContent = t; return; }
      bub.classList.add("swap");
      setTimeout(function () { bub.textContent = t; bub.classList.remove("swap"); }, 250);
    }
    if (!REDUCED) setInterval(function () {
      if ($("onboard").hidden || document.hidden) return;
      gi = (gi + 1) % GREETS.length; say(GREETS[gi]);
    }, 4200);
    slot.addEventListener("click", function () { hop(m); ti = (ti + 1) % TAPS.length; say(TAPS[ti]); });
    /* the pupils follow the finger or mouse */
    if (!REDUCED) document.addEventListener("pointermove", function (e) {
      if ($("onboard").hidden) return;
      var r = m.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.6);
      var d = Math.max(1, Math.hypot(dx, dy)), k = Math.min(1, d / 160) * 3.2;
      var tx = (dx / d) * k, ty = (dy / d) * k;
      Array.prototype.forEach.call(m.querySelectorAll(".pupil"), function (p) { p.style.transform = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px)"; });
    }, { passive: true });
  }

  /* ---------- screens ---------- */
  function show(which) {
    $("onboard").hidden = which !== "onboard";
    $("chat").hidden = which !== "chat";
    $("btnOrders").hidden = which !== "chat";
    if (which !== "chat") setHandoff(null);
  }

  function toBoarding(msg) {
    token = ""; store(TOKEN_KEY, null);
    stopPolling();
    show("onboard");
    $("startErr").textContent = msg || "";
  }

  /* ---------- chat ---------- */
  var msgsEl = $("msgs");

  /* The read-back is drawn as a summary card. The text stays the same, only the look changes. */
  function summary(m) {
    var lines = m.text.split("\n");
    var items = [], rows = [], warn = "";
    lines.slice(1).forEach(function (l) {
      if (/^- /.test(l)) {
        var body = l.slice(2), i = body.lastIndexOf(": ");
        items.push(i > 0 ? [body.slice(0, i), body.slice(i + 2)] : [body, ""]);
      } else if (/^(Total|Pickup|Note): /.test(l)) {
        var j = l.indexOf(": ");
        rows.push([l.slice(0, j), l.slice(j + 2)]);
      } else if (/needs to confirm this order first/.test(l)) warn = l;
    });
    var card = h("div", { class: "b agent sum", "data-id": m.id || "", "data-sum": "1" },
      h("h3", {}, "Check your order"),
      h("ul", {}, items.map(function (it) { return h("li", {}, h("span", {}, it[0]), h("span", { class: "pr" }, it[1])); })),
      rows.map(function (r) { return h("div", { class: "row" + (r[0] === "Total" ? " total" : "") }, h("span", {}, r[0]), h("span", {}, r[1])); }),
      warn ? h("div", { class: "warnrow" }, warn) : null,
      h("div", { class: "acts" },
        h("button", { class: "btn", type: "button", onclick: function () { send("Yes, confirm"); } }, icon("check"), "Yes, place order"),
        h("button", { class: "btn ghost", type: "button", onclick: function () { $("text").value = "I'd like to change "; resizeBox(); $("text").focus(); } }, "Change something")),
      h("time", {}, m.ts ? clock(m.ts) : ""));
    return card;
  }

  /* A placed order is drawn as a receipt card. */
  function confirmed(m) {
    var lines = m.text.split("\n");
    var num = /Order #(\d+)/.exec(lines[0]);
    var items = [], rows = [];
    lines.slice(1).forEach(function (l) {
      if (/^- /.test(l)) items.push(l.slice(2));
      else if (/^(Total|Pickup): /.test(l)) { var j = l.indexOf(": "); rows.push([l.slice(0, j), l.slice(j + 2)]); }
    });
    return h("div", { class: "b agent sum", "data-id": m.id || "" },
      h("div", { class: "cfhead" }, mascot("sm jump"), h("h3", {}, "Order " + (num ? "#" + num[1] + " " : "") + "confirmed")),
      h("ul", {}, items.map(function (it) { return h("li", {}, h("span", {}, it)); })),
      rows.map(function (r) { return h("div", { class: "row" + (r[0] === "Total" ? " total" : "") }, h("span", {}, r[0]), h("span", {}, r[1])); }),
      h("time", {}, m.ts ? clock(m.ts) : ""));
  }

  function bubble(m, pending) {
    if (m.who === "agent" && /^Please check your order:/.test(m.text)) return summary(m);
    if (m.who === "agent" && /^[^\n]*Order #\d+ is confirmed:/.test(m.text)) return confirmed(m);
    var kids = [];
    if (m.who === "owner") kids.push(h("span", { class: "who" }, "Annapurna"));
    kids.push(m.text);
    kids.push(h("time", {}, m.ts ? clock(m.ts) : ""));
    return h("div", { class: "b " + m.who + (pending ? " pending" : ""), "data-id": m.id || "" }, kids);
  }

  /* Yes / Change buttons only make sense on the newest message. */
  function refreshActions() {
    var last = msgsEl.querySelector(".b:last-of-type");
    msgsEl.querySelectorAll(".sum .acts").forEach(function (a) { a.hidden = a.parentNode !== last; });
  }

  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  function renderEmptyHello() {
    if (msgsEl.children.length) return;
    var nm = store(NAME_KEY);
    msgsEl.append(h("div", { class: "hello", id: "hello" },
      mascot("pop"),
      h("b", {}, "Namaste" + (nm ? ", " + nm : "") + "!"),
      "Ask about the menu, or tell me what you'd like. I'll check everything with you before we cook."));
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
    if (added) { scrollDown(); refreshActions(); refreshChips(); }
    return added;
  }

  function refreshChips() { $("chips").hidden = msgsEl.querySelectorAll(".b").length > 3; }

  function setBusy(b) {
    busy = b;
    $("sendBtn").disabled = b;
    var t = $("typing");
    if (b && !t) { msgsEl.append(h("div", { class: "typing", id: "typing", "aria-label": "Assistant is typing" }, mascot("sm busy"), h("i"), h("i"), h("i"))); scrollDown(); }
    if (!b && t) t.remove();
    refreshActions();
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

  /* "Talk to a person" status, visible on every screen until the team replies. */
  function setHandoff(hf) {
    handoff = hf;
    var bar = $("handoffBar");
    bar.hidden = !hf;
    if (hf) $("handoffText").textContent = "Request sent at " + clock(hf.at) + ". We'll reply in this chat.";
    if (!$("chat").hidden) scrollDown();
    if (sheetOpen === "help") renderHelp();
  }

  function poll() {
    if (document.hidden || !token || busy) return;
    api("GET", "/web/history?after=" + lastId).then(function (j) { addMessages(j.messages || []); setHandoff(j.handoff || null); }).catch(function (e) { if (e.status === 401) toBoarding(e.message); });
    loadOrders();
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(poll, 7000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = 0; }

  function openChat() {
    show("chat");
    msgsEl.replaceChildren(); seen = {}; lastId = 0;
    renderEmptyHello(); refreshChips();
    api("GET", "/web/history?after=0").then(function (j) { addMessages(j.messages || []); setHandoff(j.handoff || null); if (j.name) store(NAME_KEY, j.name); }).catch(function (e) { if (e.status === 401) toBoarding("Your chat expired. Please start a new one."); });
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
    if (!orders.length) { body.append(h("div", { class: "card2" }, h("h3", {}, "No orders yet"), h("p", {}, "Once you confirm an order in the chat, you can follow it here."))); return; }
    orders.forEach(function (o) {
      var st = STATUS[o.status] || [o.status, ""];
      var step = STEP_OF[o.status];
      body.append(h("article", { class: "ord" },
        h("div", {}, h("b", {}, "Order #" + o.id + " "), h("span", { class: "st " + st[1] }, st[0])),
        step == null ? null : h("ol", { class: "steps4", "aria-label": "Progress" }, STEPS.map(function (s, i) { return h("li", { class: i <= step ? "on" : "" }, s); })),
        h("ul", {}, o.items.map(function (x) { return h("li", {}, x); })),
        h("div", { class: "tiny" }, "Pickup: " + o.pickupText + (o.status === "ready" || o.status === "cook" ? " at " + o.address : "")),
        h("div", { class: "tot" }, o.total == null ? "Total to be confirmed by Annapurna Home Foods" : "Total: " + money(o.total))
      ));
    });
  }

  /* ---------- sheets: focus stays inside, Escape closes, focus goes back to where it was ---------- */
  function openSheet(kind, title, opener) {
    lastFocus = opener || document.activeElement;
    sheetOpen = kind;
    $("sheetTitle").textContent = title;
    $("veil").hidden = false;
    $("app").setAttribute("inert", "");
    document.body.classList.add("noscroll");
    $("sheetClose").focus();
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = ""; confirmingDelete = false;
    $("veil").hidden = true;
    $("app").removeAttribute("inert");
    document.body.classList.remove("noscroll");
    var f = lastFocus; lastFocus = null;
    if (f && document.contains(f) && typeof f.focus === "function") f.focus();
  }
  function sheetFocusables() {
    return Array.prototype.filter.call($("sheet").querySelectorAll("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])"), function (el) {
      return !el.disabled && !el.hidden && el.offsetParent !== null;
    });
  }
  $("veil").addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (e.key !== "Tab") return;
    var f = sheetFocusables();
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], cur = document.activeElement, inside = $("sheet").contains(cur);
    if (e.shiftKey && (cur === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (cur === last || !inside)) { e.preventDefault(); first.focus(); }
  });
  /* If focus ever lands outside the open dialog (screen reader, click on the page), pull it back in. */
  document.addEventListener("focusin", function (e) {
    if (sheetOpen && !$("sheet").contains(e.target)) $("sheetClose").focus();
  });

  /* ---------- menu ---------- */
  function dish(x) {
    var off = !x.live;
    var noPrice = x.kind === "combo" && x.single == null && x.bogo == null;
    var price = h("div", { class: "dprice" });
    if (x.kind === "plan") price.append(h("span", { class: "lab" }, "Per person, per week"), h("span", { class: "amt" }, money(x.plan)));
    else {
      price.append(h("span", { class: "lab" }, x.kind === "combo" ? "Single" : "Price"), h("span", { class: "amt" }, money(x.single)));
      if (x.kind === "combo" && x.bogo != null) price.append(h("span", { class: "lab" }, "Buy 1 Get 1"), h("span", { class: "amt alt" }, money(x.bogo)));
    }
    if (!off && !noPrice) {
      price.append(h("button", { class: "btn sm", type: "button", onclick: function () { closeSheet(); $("text").value = "I'd like to order the " + x.name; resizeBox(); $("text").focus(); } }, "Add to order"));
    }
    return h("article", { class: "dish" + (off ? " off" : "") },
      h("div", { class: "dmain" },
        h("h3", { class: "dname" }, x.name),
        x.desc ? h("p", { class: "desc" }, x.desc) : null,
        h("span", { class: "pill" + (off ? " off" : "") }, x.availability || (off ? "Not running right now" : "Available"))),
      price);
  }

  function menuPanels(m) {
    var byKind = function (k) { return (m.items || []).filter(function (x) { return x.kind === k; }); };
    var panels = [];
    var combos = byKind("combo"), plans = byKind("plan"), other = byKind("item");
    if (combos.length) panels.push(["Weekend combos", h("div", { class: "panel" },
      h("p", { class: "lead" }, "Cooked fresh for weekend pickup. Order at least " + m.noticeHrs + " hours ahead."),
      combos.map(dish))]);
    if (plans.length || other.length) panels.push(["Weekly plans", h("div", { class: "panel" },
      h("p", { class: "lead" }, "Meals for the whole week, per person. Prices in CAD."),
      plans.concat(other).map(dish))]);
    if ((m.weekly || []).length) {
      panels.push(["Day by day", h("div", { class: "panel" },
        h("p", { class: "lead" }, "What is on the plan each weekday."),
        m.weekly.map(function (line) {
          var i = line.indexOf(": ");
          return i > 0 && i < 40 ? h("div", { class: "day" }, h("b", {}, line.slice(0, i)), h("p", {}, line.slice(i + 2))) : h("div", { class: "note" }, line);
        }))]);
    }
    return panels;
  }

  function showMenu(e) {
    openSheet("menu", "Menu", e && e.currentTarget);
    var body = $("sheetBody"); body.replaceChildren(h("p", { class: "tiny" }, "Loading..."));
    fetch("/web/menu").then(function (r) { return r.json(); }).then(function (m) {
      menuData = m;
      if (sheetOpen !== "menu") return;
      body.replaceChildren();
      var panels = menuPanels(m);
      var seg = h("div", { class: "seg", role: "tablist", "aria-label": "Menu sections" });
      var holder = h("div", { class: "panels" });
      var tabs = [];
      var select = function (i, focus) {
        tabs.forEach(function (t, k) { t.setAttribute("aria-selected", k === i ? "true" : "false"); t.tabIndex = k === i ? 0 : -1; });
        holder.replaceChildren(panels[i][1]);
        if (focus) tabs[i].focus();
      };
      panels.forEach(function (p, i) {
        var t = h("button", { type: "button", role: "tab", onclick: function () { select(i); } }, p[0]);
        t.addEventListener("keydown", function (ev) {
          if (ev.key === "ArrowRight") { ev.preventDefault(); select((i + 1) % panels.length, true); }
          if (ev.key === "ArrowLeft") { ev.preventDefault(); select((i + panels.length - 1) % panels.length, true); }
        });
        tabs.push(t); seg.append(t);
      });
      var live = (m.items || []).some(function (x) { return x.kind === "combo" && x.live; });
      if (panels.length > 1) body.append(seg);
      body.append(holder);
      body.append(h("p", { class: "tiny" }, "Plan pickup " + (m.pickupDays || []).join(", ") + ". Everything is cooked fresh at " + (m.address || "our kitchen") + "."));
      if ($("chat").hidden) body.append(h("button", { class: "btn", type: "button", onclick: function () { closeSheet(); if ($("fName")) $("fName").focus(); } }, "Start an order"));
      if (panels.length) select(live || panels.length === 1 ? 0 : Math.min(1, panels.length - 1));
    }).catch(function () { if (sheetOpen === "menu") body.replaceChildren(h("p", { class: "err" }, "Couldn't load the menu. Please try again.")); });
  }

  function showOrders(e) { openSheet("orders", "Your orders", e && e.currentTarget); renderOrders(); loadOrders(); }

  /* ---------- help: a person, contact details, delete my chat ---------- */
  function renderHelp() {
    var body = $("sheetBody"); body.replaceChildren();
    var c = (menuData && menuData.contact) || {};
    if (token) {
      body.append(h("section", { class: "card2" },
        h("h3", {}, "Talk to a person"),
        h("p", {}, "Prefer a real person? Send us a request and we'll reply right here in this chat."),
        handoff ? h("div", { class: "status", role: "status" }, icon("clock"), h("span", {}, "Request sent at " + clock(handoff.at) + ". We'll reply in this chat.")) : null,
        h("button", { class: "btn", id: "handoffBtn", type: "button", disabled: !!handoff, onclick: requestHuman }, icon("person"), handoff ? "Request sent" : "Ask for a person")));
    }
    var links = [];
    if (c.instagram) links.push(h("a", { class: "btn ghost", href: "https://www.instagram.com/" + encodeURIComponent(c.instagram) + "/", target: "_blank", rel: "noopener noreferrer" }, icon("insta"), "Instagram"));
    if (c.phone) links.push(h("a", { class: "btn ghost", href: "tel:" + c.phone.replace(/[^\d+]/g, "") }, icon("phone"), c.phone));
    if (links.length) body.append(h("section", { class: "card2" }, h("h3", {}, "Find us"), h("div", { class: "links" }, links)));
    if (token) {
      body.append(h("section", { class: "card2" },
        h("h3", {}, "Your data"),
        h("p", {}, "You can remove this chat from our system. Orders that were already placed stay so we can cook them."),
        confirmingDelete
          ? h("div", { class: "links" },
              h("button", { class: "btn warn", type: "button", onclick: deleteChat }, icon("trash"), "Yes, delete my chat"),
              h("button", { class: "btn ghost", type: "button", onclick: function () { confirmingDelete = false; renderHelp(); } }, "Keep it"))
          : h("button", { class: "btn ghost", type: "button", onclick: function () { confirmingDelete = true; renderHelp(); var b = $("sheetBody").querySelector(".btn.warn"); if (b) b.focus(); } }, icon("trash"), "Delete my chat")));
    }
    if (!token) body.append(h("p", { class: "tiny" }, "Start a chat to ask for a person, or use the links above."));
  }

  function showHelp(e) {
    openSheet("help", "Help", e && e.currentTarget);
    renderHelp();
    if (!menuData) fetch("/web/menu").then(function (r) { return r.json(); }).then(function (m) { menuData = m; if (sheetOpen === "help") renderHelp(); }).catch(function () { /* links are optional */ });
  }

  function requestHuman() {
    var b = $("handoffBtn"); if (b) b.disabled = true;
    api("POST", "/web/handoff").then(function (j) {
      addMessages(j.messages || []);
      setHandoff(j.handoff || null);
      var again = $("handoffBtn"); if (again) again.focus();
    }).catch(function (e) { if (e.status === 401) { closeSheet(); toBoarding(e.message); return; } if (b) b.disabled = false; toast(errText(e)); });
  }

  function deleteChat() {
    api("DELETE", "/web/me").then(function () { store(NAME_KEY, null); closeSheet(); toBoarding("Your chat was deleted."); }).catch(function (e) { confirmingDelete = false; renderHelp(); toast(errText(e)); });
  }

  /* ---------- wiring ---------- */
  CHIPS.forEach(function (c) { $("chips").append(h("button", { type: "button", onclick: function () { send(c); } }, c)); });

  $("btnMenu").addEventListener("click", showMenu);
  $("btnOrders").addEventListener("click", showOrders);
  $("btnHelp").addEventListener("click", showHelp);
  $("startMenu").addEventListener("click", showMenu);
  $("sheetClose").addEventListener("click", closeSheet);
  $("veil").addEventListener("click", function (e) { if (e.target === $("veil")) closeSheet(); });

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
  initHero();
  if (token) openChat(); else show("onboard");
})();
