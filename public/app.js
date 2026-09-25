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
    plus: ["M12 5v14M5 12h14"],
    bag: ["M6 8h12l-1 12H7z", "M9 8V7a3 3 0 0 1 6 0v1"],
    pin: ["M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
    heart: ["M12 20s-7.5-4.6-9.3-9.3C1.5 7.4 3.7 4.5 6.9 4.5c2 0 3.4 1.1 5.1 3 1.7-1.9 3.1-3 5.1-3 3.2 0 5.4 2.9 4.2 6.2C19.5 15.4 12 20 12 20z"],
    sun: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"],
    chili: ["M5.5 8.5c2.6-.8 5 .4 6.4 2.8 1.6 2.8 3.6 5.2 7.6 6.2.6.2.5 1-.1 1.2C13.6 21 7 18.6 5 13.2c-.6-1.7-.6-3.6.5-4.7z", "M5.5 8.5C5 6.5 6 4.5 8.5 4"]
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
    $("home").hidden = which !== "home";
    $("chat").hidden = which !== "chat";
    $("btnHome").hidden = which === "onboard";
    $("btnOrders").hidden = which === "onboard";
    [["btnHome","home"],["btnMenu","menu"],["btnOrders","orders"],["btnHelp","help"]].forEach(function (x) {
      var el = $(x[0]); if (el) el.setAttribute("aria-current", x[1] === which ? "true" : "false");
    });
    if (which === "onboard") setHandoff(null);
  }

  function toBoarding(msg) {
    token = ""; store(TOKEN_KEY, null);
    stopPolling();
    show("onboard");
    $("startErr").textContent = msg || "";
  }

  /* ---------- customer home ---------- */
  function initHome() {
    var slot = $("homeMascot");
    if (slot && !slot.firstChild) slot.append(mascot("pop"));
    var name = store(NAME_KEY);
    var greeting = $("homeGreeting");
    if (greeting) greeting.textContent = name ? "Namaste, " + name + ". What are you craving?" : "What are you craving today?";
  }

  function renderHomeActive() {
    var box = $("homeActive");
    if (!box) return;
    var active = orders.filter(function (o) { return o.status === "hold" || o.status === "cook" || o.status === "ready"; })
      .sort(function (a, b) {
        var p = { ready: 0, cook: 1, hold: 2 };
        return (p[a.status] == null ? 9 : p[a.status]) - (p[b.status] == null ? 9 : p[b.status]) || b.id - a.id;
      })[0];
    if (!active) { box.hidden = true; box.replaceChildren(); return; }
    var st = STATUS[active.status] || [active.status, active.status];
    var step = STEP_OF[active.status] == null ? 0 : STEP_OF[active.status];
    box.hidden = false;
    box.replaceChildren(
      h("div", { class: "home-active-head" },
        h("div", {}, h("span", { class: "eyebrow" }, "ACTIVE ORDER"), h("h3", {}, "Order #" + active.id), h("p", {}, active.pickupText || "Pickup time pending")),
        h("span", { class: "home-status" }, st[0])),
      h("div", { class: "home-active-progress", "aria-label": "Order progress" }, STEPS.map(function (_, i) { return h("span", { class: i <= step ? "on" : "" }); })),
      h("div", { class: "home-active-foot" },
        h("small", {}, active.status === "ready" ? "Your food is ready for pickup." : active.status === "cook" ? "Confirmed and being prepared." : "Waiting for Annapurna to review."),
        h("button", { type: "button", onclick: function (e) { showOrders({ currentTarget: e.currentTarget }); } }, "View order →"))
    );
  }

  function openHome() {
    show("home");
    initHome();
    var home = $("home");
    if (home) home.scrollTop = 0;
    loadMenu();
    loadOrders();
    startPolling();
  }

  /* ---------- chat ---------- */
  var msgsEl = $("msgs");
  msgsEl.addEventListener("scroll", function () { if (jumpBtn && !jumpBtn.hidden && nearBottom()) hideJump(); }, { passive: true });

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
      h("h3", {}, (/extras for order #(\d+)/.exec(lines[0]) ? "Check your extras for order #" + /extras for order #(\d+)/.exec(lines[0])[1] : "Check your order")),
      h("ul", {}, items.map(function (it) { return h("li", {}, h("span", {}, it[0]), h("span", { class: "pr" }, it[1])); })),
      rows.map(function (r) { return h("div", { class: "row" + (r[0] === "Total" ? " total" : "") }, h("span", {}, r[0]), h("span", {}, r[1])); }),
      warn ? h("div", { class: "warnrow" }, warn) : null,
      h("div", { class: "acts" },
        h("button", { class: "btn", type: "button", onclick: function () { send("Yes, confirm"); } }, icon("check"), "Yes, place order"),
        h("button", { class: "btn ghost", type: "button", onclick: function () { $("text").value = "I'd like to change "; resizeBox(); $("text").focus(); } }, "Change something")),
      h("time", {}, m.ts ? clock(m.ts) : ""));
    return card;
  }

  function isFresh(m) { return m.ts && Date.now() - new Date(m.ts).getTime() < 90000; }
  /* A small burst of turmeric, chilli and curry-leaf colours over a new confirmation. */
  function confetti() {
    var box = h("div", { class: "confetti", "aria-hidden": "true" });
    var cols = ["#f1a824", "#e0582f", "#2f9a68", "#f6d27a", "#b83527", "#7cc49b"];
    for (var i = 0; i < 22; i++) {
      var x = (Math.random() * 2 - 1) * 160, y = -60 - Math.random() * 120, r = Math.random() * 540 - 270;
      box.append(h("i", { style: "--x:" + x.toFixed(0) + "px;--y:" + y.toFixed(0) + "px;--r:" + r.toFixed(0) + "deg;--d:" + (Math.random() * 0.25).toFixed(2) + "s;background:" + cols[i % cols.length] + (i % 3 ? "" : ";border-radius:50%") }));
    }
    setTimeout(function () { box.remove(); }, 2600);
    return box;
  }

  /* "Your order #N is ready for pickup at ..." from the kitchen, as a card with directions. */
  function readyCard(m) {
    var r = /^Your order #(\d+) is ready for pickup at (.+?)\.?$/.exec(m.text.trim());
    if (m.who !== "owner" || !r) return null;
    return h("div", { class: "b owner ready" + (isFresh(m) ? " fresh" : ""), "data-id": m.id || "" },
      h("div", { class: "rhead" }, h("span", { class: "rbag" }, icon("bag")), h("div", {}, h("span", { class: "who" }, "Annapurna"), h("b", {}, "Order #" + r[1] + " is ready!"))),
      h("p", {}, "Come pick it up at " + r[2] + "."),
      h("a", { class: "btn sm", href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r[2]), target: "_blank", rel: "noopener noreferrer" }, icon("pin"), "Directions"),
      h("time", {}, m.ts ? clock(m.ts) : ""));
  }

  /* The thank-you after pickup: Annu waves, a few hearts float up. */
  function thanksCard(m) {
    if (m.who !== "agent" || !/^Thank you for your order/.test(m.text)) return null;
    var hearts = h("div", { class: "hearts", "aria-hidden": "true" });
    for (var i = 0; i < 5; i++) hearts.append(h("span", { style: "--i:" + i }, icon("heart")));
    return h("div", { class: "b agent thanks", "data-id": m.id || "" },
      h("div", { class: "thead" }, mascot("sm"), hearts),
      linkify(m.text),
      h("time", {}, m.ts ? clock(m.ts) : ""));
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
    var card = h("div", { class: "b agent sum", "data-id": m.id || "" },
      h("div", { class: "cfhead" }, mascot("sm jump"), h("h3", {}, "Order " + (num ? "#" + num[1] + " " : "") + "confirmed" + (/extras for order #(\d+)/.test(lines[0]) ? " \u00b7 extras for #" + /extras for order #(\d+)/.exec(lines[0])[1] : ""))),
      h("ul", {}, items.map(function (it) { return h("li", {}, h("span", {}, it)); })),
      rows.map(function (r) { return h("div", { class: "row" + (r[0] === "Total" ? " total" : "") }, h("span", {}, r[0]), h("span", {}, r[1])); }),
      h("time", {}, m.ts ? clock(m.ts) : ""));
    if (isFresh(m) && !REDUCED) card.append(confetti());
    return card;
  }


  /* ---------- dish cards: when a reply lists menu items, draw them as cards ---------- */
  /* Prices always come from the menu (code), never from the reply text. */
  function norm(t) { return String(t || "").toLowerCase().replace(/[*_`]/g, "").replace(/^[\s\-\u2022\u2013\u2014>]*(\d+[.)]\s*)?/, "").replace(/\s+/g, " ").trim(); }
  function matchDish(line) {
    if (!menuData || !menuData.items) return null;
    var l = norm(line);
    if (!l) return null;
    var best = null, bestLen = 0;
    menuData.items.forEach(function (it) {
      var names = [norm(it.name), norm(it.name).replace(/ combo$/, "")];
      names.forEach(function (n) {
        if (n.length > 5 && l.indexOf(n) === 0 && n.length > bestLen) { best = it; bestLen = n.length; }
      });
    });
    return best;
  }
  function fillComposer(text) {
    var t = $("text");
    t.value = text; t.dispatchEvent(new Event("input"));
    t.focus();
    try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) { /* older browsers */ }
  }
  function pill(price, label, cls, onTap) {
    return h("button", { type: "button", class: "ppill" + (cls ? " " + cls : ""), onclick: onTap, "aria-label": label + " " + money(price) + ", tap to order" },
      h("b", {}, money(price)), h("small", {}, label));
  }
  function dishCard(it, k) {
    var kids = [];
    if (it.kind === "plan") {
      kids.push(pill(it.plan, it.unit ? it.unit.replace(/^per /, "/ ").replace(/ per /g, " / ") : "plan", "", function () { fillComposer("I'd like the " + it.name + " for 1 person, starting "); }));
    } else {
      if (it.kind === "addon") kids.push(pill(it.single, "each", "", function () { fillComposer("Add 1 " + it.name); }));
      else if (it.single != null || it.bogo == null) kids.push(pill(it.single, "single", "", function () { fillComposer("1 " + it.name + ", single, pickup "); }));
      if (it.bogo != null) kids.push(pill(it.bogo, "Buy 1 Get 1", "bogo", function () { fillComposer("1 " + it.name + ", Buy 1 Get 1, pickup "); }));
    }
    var hue = [148, 38, 12, 95, 170, 28, 120, 200][k % 8];
    return h("li", { class: "dcard" + (it.live === false ? " off" : ""), style: "--i:" + k + ";--h:" + hue },
      it.no ? h("span", { class: "no", "aria-label": "Option " + it.no }, String(it.no)) : null,
      h("div", { class: "thumb" }, icon(it.kind === "plan" ? "clock" : "bowl")),
      h("div", { class: "info" },
        h("b", {}, it.name),
        it.desc ? h("small", {}, it.desc) : null,
        it.availability ? h("span", { class: "avail" }, it.availability) : null),
      h("div", { class: "prices" }, kids));
  }
  function dishes(m) {
    if (m.who !== "agent" || !menuData) return null;
    var lines = m.text.split("\n"), found = [], before = [], after = [], ids = {};
    lines.forEach(function (l) {
      var it = matchDish(l);
      if (it && !ids[it.id]) { ids[it.id] = true; found.push(it); }
      else if (it) { /* same dish twice, skip */ }
      else if (!found.length) before.push(l);
      else after.push(l);
    });
    if (found.length < 2) return null;
    found.sort(function (a, b) { return (a.no || 0) - (b.no || 0); });
    var fresh = m.ts && Date.now() - new Date(m.ts).getTime() < 90000;
    var intro = before.join("\n").trim(), outro = after.join("\n").trim();
    return h("div", { class: "b agent dishes" + (fresh ? " fresh" : ""), "data-id": m.id || "" },
      intro ? h("p", { class: "intro" }, intro) : null,
      h("ul", { class: "dlist" }, found.map(dishCard)),
      h("p", { class: "hint" }, "Tap a price, or just say \u201coption " + (found[0].no || 1) + "\u201d"),
      outro ? h("p", { class: "outro" }, outro) : null,
      h("time", {}, m.ts ? clock(m.ts) : ""));
  }

  /* When the assistant asks about spice, offer one-tap answers. Only on the newest message. */
  /* Only when a question itself asks about spice, not when a reply just mentions it ("medium spice noted! What day?"). */
  function asksSpice(m) {
    if (m.who !== "agent" || /Order #\d+(?: \([^)]*\))? is confirmed|Please check your (order|extras)/.test(m.text)) return false;
    return (m.text.match(/[^.!?\n]*\?/g) || []).some(function (q) { return /\bspic(e|y|iness)\b/i.test(q); });
  }
  var SPICE = [["Less spicy", 1], ["Medium", 2], ["Spicy", 3]];
  function spiceRow(m) {
    if (!asksSpice(m)) return null;
    return h("div", { class: "spice" }, SPICE.map(function (s) {
      var chili = h("span", { class: "chili", "aria-hidden": "true" });
      for (var i = 0; i < s[1]; i++) chili.append(icon("chili"));
      return h("button", { type: "button", onclick: function () { if (!busy) send(s[0] === "Medium" ? "Medium spice" : s[0]); } }, chili, s[0]);
    }));
  }

  /* ---------- week card: when a reply walks through the week ("Mon: ..."), draw a timeline ---------- */
  var DAYRE = /^\s*[-\u2022*]?\s*\**(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\**\s*(\([^)]*\))?\s*[:\-\u2013]\s*(.+)$/i;
  var DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function weekCard(m) {
    if (m.who !== "agent") return null;
    var rows = [], before = [], after = [];
    m.text.split("\n").forEach(function (l) {
      var d = DAYRE.exec(l);
      if (d) rows.push({ day: d[1].toLowerCase(), extra: (d[2] || "").replace(/[()]/g, ""), text: d[3].trim() });
      else if (!rows.length) before.push(l); else after.push(l);
    });
    if (rows.length < 3) return null;
    /* Use the owner's weekly menu, not the assistant's short version, so nothing gets left out. */
    var notes = [];
    if (menuData && menuData.weekly) {
      var own = [];
      menuData.weekly.forEach(function (l) {
        var d = DAYRE.exec(l);
        if (d) own.push({ day: d[1].toLowerCase(), extra: (d[2] || "").replace(/[()]/g, ""), text: d[3].trim() });
        else if (l.trim()) notes.push(l.trim());
      });
      if (own.length >= 3) rows = own; else notes = [];
    }
    var today = new Date().getDay();
    var fresh = m.ts && Date.now() - new Date(m.ts).getTime() < 90000;
    /* A breakfast-only or curries-only plan shows just that part of each day. */
    var head = before.join(" ");
    var onlyBf = /\b(only breakfast|breakfast[- ]only|breakfast plan)\b/i.test(head) && !/curr/i.test(head);
    var noBf = /\b(only curries|curries[- ]only|curries plan|curry plan|breakfast\s*\+\s*curries)\b/i.test(head) ? !/breakfast\s*\+/i.test(head) : false;
    return h("div", { class: "b agent week" + (fresh ? " fresh" : ""), "data-id": m.id || "" },
      before.join("\n").trim() ? h("p", { class: "intro" }, before.join("\n").trim()) : null,
      h("ol", { class: "wlist" }, rows.map(function (r, k) {
        var parts = r.text.split(/;\s*|\.\s+(?=[A-Z])/), bf = "", rest = [];
        parts.forEach(function (p) {
          if (!bf && /breakfast/i.test(p)) bf = p.replace(/\bbreakfast\b:?/i, "").replace(/^[\s,:\-]+|[\s,:\-]+$/g, "");
          else if (p.trim()) rest.push(p.trim().replace(/\.$/, "").replace(/^lunch\s*(\/|and|&)\s*dinner\s*:?\s*/i, ""));
        });
        var meal = rest.join("; "), alt = /^(alternates?|alternating)(\s+(by|each|every)\s+week)?\s*[-:\u2013]?\s*/i;
        var alternates = alt.test(meal) || /\balternat/i.test(r.extra);
        meal = meal.replace(alt, "");
        var all = r.text.toLowerCase(), tags = [];
        if (/chicken|kodi|kheema/.test(all)) tags.push(["Chicken", "t-chk"]);
        if (/\begg/.test(all)) tags.push(["Egg", "t-egg"]);
        if (!tags.length || /\bveg\b/.test(all) && !/chicken|kodi|egg/.test(all)) { if (!tags.length) tags.push(["Veg", "t-veg"]); }
        if (alternates) tags.push(["Alternates weekly", "t-x"]);
        if (r.extra && !/\balternat|^veg$/i.test(r.extra)) tags.push([r.extra.charAt(0).toUpperCase() + r.extra.slice(1), "t-x"]);
        var isToday = DOW[r.day] === today;
        return h("li", { class: "wday" + (isToday ? " today" : ""), style: "--i:" + k },
          h("div", { class: "dchip" }, h("b", {}, r.day.slice(0, 3).toUpperCase()), isToday ? h("small", {}, "Today") : null),
          h("div", { class: "wbody" },
            bf && !noBf ? h("div", { class: "wrow" }, icon("sun"), h("span", {}, h("em", {}, "Breakfast "), bf)) : null,
            meal && !onlyBf ? h("div", { class: "wrow" }, icon("bowl"), h("span", {}, bf ? h("em", {}, "Lunch & dinner ") : null, meal)) : null,
            h("div", { class: "tags" }, tags.map(function (t) { return h("span", { class: "tag " + t[1] }, t[0]); }))));
      })),
      notes.length ? h("p", { class: "wnote" }, notes.join(" ")) : null,
      after.join("\n").trim() ? h("p", { class: "outro" }, after.join("\n").trim()) : null,
      h("time", {}, m.ts ? clock(m.ts) : ""));
  }

  /* Only our own Instagram links become links. Everything else stays plain text. */
  function linkify(text) {
    var out = [], re = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?/g, last = 0, mm;
    while ((mm = re.exec(text))) {
      if (mm.index > last) out.push(text.slice(last, mm.index));
      out.push(h("a", { class: "ilink", href: "https://www.instagram.com/" + mm[1] + "/", target: "_blank", rel: "noopener noreferrer" }, icon("insta"), "@" + mm[1]));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function bubble(m, pending) {
    if (m.who === "agent" && /^Please check your (order|extras)/.test(m.text)) return summary(m);
    if (m.who === "agent" && /^[^\n]*Order #\d+(?: \([^)]*\))? is confirmed:/.test(m.text)) return confirmed(m);
    var card = dishes(m) || weekCard(m) || readyCard(m) || thanksCard(m); if (card) return card;
    var kids = [];
    if (m.who === "owner") kids.push(h("span", { class: "who" }, "Annapurna"));
    kids.push.apply(kids, linkify(m.text));
    kids.push(spiceRow(m));
    kids.push(h("time", {}, m.ts ? clock(m.ts) : ""));
    return h("div", { class: "b " + m.who + (pending ? " pending" : ""), "data-id": m.id || "" }, kids);
  }

  /* Yes / Change buttons only make sense on the newest message. */
  function refreshActions() {
    var last = msgsEl.querySelector(".b:last-of-type");
    msgsEl.querySelectorAll(".sum .acts").forEach(function (a) { a.hidden = a.parentNode !== last; });
    msgsEl.querySelectorAll(".spice").forEach(function (a) { a.hidden = a.parentNode !== last; });
  }

  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; hideJump(); }
  /* "New message" pill when something arrives while the customer is reading older messages */
  var jumpBtn = null;
  function showJump() {
    if (!jumpBtn) {
      jumpBtn = h("button", { type: "button", class: "newmsg", onclick: function () { msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: "smooth" }); hideJump(); } }, "New message \u2193");
      $("chat").append(jumpBtn);
    }
    jumpBtn.hidden = false;
  }
  function hideJump() { if (jumpBtn) jumpBtn.hidden = true; }

  function renderEmptyHello() {
    if (msgsEl.children.length) return;
    var nm = store(NAME_KEY);
    msgsEl.append(h("div", { class: "hello", id: "hello" },
      mascot("pop"),
      h("b", {}, "Namaste" + (nm ? ", " + nm : "") + "!"),
      "Ask about the menu, or tell me what you'd like. I'll check everything with you before we cook."));
  }

  /* Background checks never pull the reader down. Only their own sends, or new messages while they are at the bottom. */
  function nearBottom() { return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 140; }
  function addMessages(list, background) {
    var added = false, stay = !background || nearBottom();
    list.forEach(function (m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      if (m.id > lastId) lastId = m.id;
      var hello = $("hello"); if (hello) hello.remove();
      msgsEl.append(bubble(m));
      added = true;
    });
    if (added) {
      if (stay) scrollDown(); else showJump();
      refreshActions(); refreshChips();
      /* a new confirmation updates the Orders badge right away */
      if (list.some(function (m) { return m.who === "agent" && /Order #\d+(?: \([^)]*\))? is confirmed/.test(m.text || ""); })) loadOrders();
    }
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
  function setHandoff(hf, background) {
    var changed = !!hf !== !!handoff || (hf && handoff && hf.at !== handoff.at);
    handoff = hf;
    var bar = $("handoffBar");
    bar.hidden = !hf;
    if (hf) $("handoffText").textContent = "Request sent at " + clock(hf.at) + ". We'll reply in this chat.";
    if (changed && !$("chat").hidden && (!background || nearBottom())) scrollDown();
    if (sheetOpen === "help") renderHelp();
  }

  function poll() {
    if (document.hidden || !token || busy) return;
    api("GET", "/web/history?after=" + lastId).then(function (j) { addMessages(j.messages || [], true); setHandoff(j.handoff || null, true); }).catch(function (e) { if (e.status === 401) toBoarding(e.message); });
    loadOrders();
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(poll, 7000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = 0; }

  function loadMenu() {
    if (menuData) return Promise.resolve(menuData);
    return fetch("/web/menu").then(function (r) { return r.json(); }).then(function (m) { menuData = m; return m; }).catch(function () { return null; });
  }

  function openChat(prefill) {
    show("chat");
    msgsEl.replaceChildren(); seen = {}; lastId = 0;
    renderEmptyHello(); refreshChips();
    loadMenu().then(function () { return api("GET", "/web/history?after=0"); }).then(function (j) {
      addMessages(j.messages || []);
      setHandoff(j.handoff || null);
      if (j.name) store(NAME_KEY, j.name);
      if (prefill) fillComposer(prefill);
    }).catch(function (e) { if (e.status === 401) toBoarding("Your chat expired. Please start a new one."); });
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
      if (!$("home").hidden) renderHomeActive();
    }).catch(function () { /* polling is best effort */ });
  }

  function renderOrders() {
    var body = $("sheetBody"); body.replaceChildren();
    if (!orders.length) {
      body.append(h("div", { class: "orders-empty card2" },
        h("div", { class: "empty-icon", "aria-hidden": "true" }, icon("bag")),
        h("h3", {}, "No orders yet"),
        h("p", {}, "Once you confirm an order in the chat, you can follow every step here."),
        h("button", { class: "btn", type: "button", onclick: function () { closeSheet(); openChat("I'd like to order "); } }, "Start an order")));
      return;
    }
    var copy = {
      hold: "We received it and Annapurna needs to review it.",
      cook: "Confirmed — your food is being prepared.",
      ready: "Ready! Come pick it up from the kitchen.",
      done: "Picked up. Thank you for ordering with us.",
      cancelled: "This order was cancelled."
    };
    var rank = { ready: 0, cook: 1, hold: 2, done: 3, cancelled: 4 };
    orders.slice().sort(function (a, b) {
      return (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]) || b.id - a.id;
    }).forEach(function (o) {
      var st = STATUS[o.status] || [o.status, ""];
      var step = STEP_OF[o.status];
      var head = h("div", { class: "ord-head" },
        h("div", {}, h("span", { class: "ord-kicker" }, "Order"), h("b", {}, "#" + o.id)),
        h("span", { class: "st " + st[1] }, st[0]));
      var actions = [];
      if (o.status === "ready" && o.address) {
        actions.push(h("a", { class: "btn sm", href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.address), target: "_blank", rel: "noopener noreferrer" }, icon("pin"), "Directions"));
      }
      actions.push(h("button", { class: "btn ghost sm", type: "button", onclick: function () { closeSheet(); openChat("Question about order #" + o.id + ": "); } }, "Ask about this order"));
      body.append(h("article", { class: "ord ord-" + st[1], "data-status": o.status },
        head,
        h("p", { class: "ord-copy" }, copy[o.status] || ""),
        step == null ? null : h("ol", { class: "steps4", "aria-label": "Order progress" }, STEPS.map(function (s, i) {
          return h("li", { class: i < step ? "on done-step" : i === step ? "on current-step" : "" }, h("span", {}, s));
        })),
        h("div", { class: "ord-items" }, h("ul", {}, o.items.map(function (x) { return h("li", {}, x); }))),
        h("div", { class: "ord-meta" },
          h("div", {}, h("span", {}, "Pickup"), h("b", {}, o.pickupText)),
          (o.status === "ready" || o.status === "cook") && o.address ? h("div", {}, h("span", {}, "Location"), h("b", {}, o.address)) : null),
        h("div", { class: "ord-foot" },
          h("div", { class: "tot" }, o.total == null ? "Total to be confirmed" : "Total " + money(o.total)),
          h("div", { class: "ord-actions" }, actions))
      ));
    });
  }

  /* ---------- sheets: focus stays inside, Escape closes, focus goes back to where it was ---------- */
  function openSheet(kind, title, opener) {
    lastFocus = opener || document.activeElement;
    sheetOpen = kind;
    $("sheetTitle").textContent = title;
    $("sheet").setAttribute("data-kind", kind);
    $("veil").hidden = false;
    $("app").setAttribute("inert", "");
    document.body.classList.add("noscroll");
    $("sheetClose").focus();
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = ""; confirmingDelete = false;
    $("sheet").removeAttribute("data-kind");
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
      price.append(h("span", { class: "lab" }, x.kind === "combo" ? "Single" : x.kind === "addon" ? "Each" : "Price"), h("span", { class: "amt" }, money(x.single)));
      if (x.kind === "combo" && x.bogo != null) price.append(h("span", { class: "lab" }, "Buy 1 Get 1"), h("span", { class: "amt alt" }, money(x.bogo)));
    }
    if (!off && !noPrice) {
      price.append(h("button", { class: "btn sm", type: "button", onclick: function () { closeSheet(); openChat("I'd like to order the " + x.name + " "); } }, "Add to order"));
    }
    return h("article", { class: "dish" + (off ? " off" : "") },
      h("div", { class: "dmain" },
        h("h3", { class: "dname" }, x.no ? h("span", { class: "dno", "aria-label": "Option " + x.no }, String(x.no)) : null, x.name),
        x.desc ? h("p", { class: "desc" }, x.desc) : null,
        h("span", { class: "pill" + (off ? " off" : "") }, x.availability || (off ? "Not running right now" : "Available"))),
      price);
  }

  function menuPanels(m) {
    var byKind = function (k) { return (m.items || []).filter(function (x) { return x.kind === k; }); };
    var panels = [];
    var combos = byKind("combo"), plans = byKind("plan"), other = byKind("item"), extras = byKind("addon");
    if (combos.length) panels.push(["Weekend combos", h("div", { class: "panel" },
      h("p", { class: "lead" }, "Cooked fresh for weekend pickup. Order at least " + m.noticeHrs + " hours ahead."),
      combos.map(dish))]);
    if (plans.length || other.length) panels.push(["Weekly plans", h("div", { class: "panel" },
      h("p", { class: "lead" }, "Meals for the whole week, per person. Prices in CAD."),
      plans.concat(other).map(dish))]);
    if (extras.length) panels.push(["Extras", h("div", { class: "panel" },
      h("p", { class: "lead" }, "Add these to any order. Chicken extras come in a 12oz box."),
      extras.map(dish))]);
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

  function showMenu(e, preferred) {
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
      if (panels.length) {
        var wanted = preferred ? panels.findIndex(function (p) { return p[0] === preferred; }) : -1;
        select(wanted >= 0 ? wanted : (live || panels.length === 1 ? 0 : Math.min(1, panels.length - 1)));
      }
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

  /* ---------- customer quick actions (presentation only) ---------- */
  function addCustomerActions() {
    document.body.classList.add("customer-mode");
    var chat = $("chat");
    if (!chat || document.getElementById("customerActions")) return;
    var bar = h("div", { class: "customer-actions", id: "customerActions", "aria-label": "Quick actions" });
    var actions = [
      ["bowl", "Order food", true, function () { fillComposer("I'd like to order "); $("text").focus(); }],
      ["sun", "Weekend combos", false, function () { if (!busy) send("What weekend combos are running?"); }],
      ["clock", "Weekly plans", false, function () { if (!busy) send("Tell me about the weekly plans"); }],
      ["bag", "My orders", false, function (e) { showOrders({ currentTarget: e.currentTarget }); }]
    ];
    actions.forEach(function (a, i) {
      bar.append(h("button", {
        type: "button", class: "customer-action", style: "--i:" + i,
        "data-accent": a[2] ? "true" : "false",
        onclick: a[3]
      }, icon(a[0]), a[1]));
    });
    chat.insertBefore(bar, $("msgs"));
  }

  /* ---------- wiring ---------- */
  CHIPS.forEach(function (c) { $("chips").append(h("button", { type: "button", onclick: function () { send(c); } }, c)); });

  $("brandHome").addEventListener("click", function () { if (token) openHome(); else show("onboard"); });
  $("btnHome").addEventListener("click", openHome);
  $("btnMenu").addEventListener("click", showMenu);
  $("btnOrders").addEventListener("click", showOrders);
  $("btnHelp").addEventListener("click", showHelp);
  $("startMenu").addEventListener("click", showMenu);
  $("homeOrder").addEventListener("click", function () { openChat("I'd like to order "); });
  $("homeContinue").addEventListener("click", function () { openChat(); });
  $("homeCombos").addEventListener("click", function (e) { showMenu(e, "Weekend combos"); });
  $("homePlans").addEventListener("click", function (e) { showMenu(e, "Weekly plans"); });
  $("homeOrders").addEventListener("click", function (e) { showOrders(e); });
  $("homeMenu").addEventListener("click", showMenu);
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
      openHome();
    }).catch(function (e2) { err.textContent = e2.status === 429 ? "Too many new chats from this network. Please try again later." : e2.message; })
      .then(function () { $("startBtn").disabled = false; });
  });

  /* ---------- start ---------- */
  token = store(TOKEN_KEY) || "";
  initHero();
  addCustomerActions();
  if (token) openHome(); else show("onboard");
})();
