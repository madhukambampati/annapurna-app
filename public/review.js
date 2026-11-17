"use strict";
/* Review page opened from a one-time link Annapurna sends to a past customer: /review/<link code>. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var code = decodeURIComponent(location.pathname.split("/")[2] || "");
  var api = "/web/review-links/" + encodeURIComponent(code);
  var rating = 0;
  var WORDS = ["", "Not good", "Could be better", "Good", "Very good", "Loved it!"];
  var STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36 6.3 20.36l1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';

  function show(id) {
    ["loading", "form", "done", "closed"].forEach(function (k) { $(k).hidden = k !== id; });
  }
  function closed(state) {
    var copy = {
      used: ["This link has been used", "A review has already been sent with this link. Thank you!"],
      expired: ["This link has expired", "Review links work for 30 days. Ask Annapurna Home Foods for a new one."],
      missing: ["This link isn't valid", "Please check the link, or ask Annapurna Home Foods for a new one."],
      offline: ["Something went wrong", "We couldn't open this page. Check your connection and try again."]
    }[state] || ["This link isn't valid", "Please ask Annapurna Home Foods for a new one."];
    $("closedTitle").textContent = copy[0];
    $("closedText").textContent = copy[1];
    show("closed");
  }
  function setErr(msg) { $("err").textContent = msg || ""; $("err").hidden = !msg; }

  // Five stars that act as one radio group: arrows move, Enter/Space picks.
  var stars = [];
  function pick(n, focus) {
    rating = n;
    stars.forEach(function (b, i) {
      b.classList.toggle("on", i < n);
      b.setAttribute("aria-checked", i === n - 1 ? "true" : "false");
      b.tabIndex = i === Math.max(n, 1) - 1 ? 0 : -1;
    });
    $("starWord").textContent = WORDS[n] || "";
    $("send").disabled = !n;
    if (focus) stars[n - 1].focus();
  }
  for (var i = 1; i <= 5; i++) (function (n) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", n + (n === 1 ? " star" : " stars"));
    b.innerHTML = STAR;
    b.addEventListener("click", function () { pick(n); });
    b.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); pick(Math.min(5, (rating || 0) + 1), true); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); pick(Math.max(1, (rating || 2) - 1), true); }
    });
    stars.push(b);
    $("stars").append(b);
  })(i);
  pick(0);

  $("comment").addEventListener("input", function () { $("count").textContent = $("comment").value.length + " / 500"; });

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!rating) { setErr("Please choose a star rating."); return; }
    setErr("");
    $("send").disabled = true;
    $("send").textContent = "Sending…";
    fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: rating, comment: $("comment").value, displayName: $("name").value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) { show("done"); return; }
        if (r.status === 409) return closed("used");
        if (r.status === 410) return closed("expired");
        if (r.status === 404) return closed("missing");
        setErr(j.error || "Couldn't send your review. Please try again.");
        $("send").disabled = false;
        $("send").textContent = "Send review";
      });
    }).catch(function () {
      setErr("Couldn't reach Annapurna. Check your connection and try again.");
      $("send").disabled = false;
      $("send").textContent = "Send review";
    });
  });

  fetch(api).then(function (r) { return r.json(); }).then(function (j) {
    if (j.state === "open") { show("form"); return; }
    closed(j.state);
  }).catch(function () { closed("offline"); });
})();
