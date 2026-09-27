from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f"{label} not found in {path}")
    p.write_text(text)


# Customer menu: keep the current navigation, but make Single / BOGO read as clean price rows.
replace_once(
    "public/index.html",
    '''.dprice{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;text-align:right;font-family:var(--f-body)}
.dprice .lab{font-size:13px;line-height:1.25;color:var(--muted)}
.dprice .amt{font:700 17px/1.25 var(--f-body);font-variant-numeric:tabular-nums}
.dprice .amt.alt{font-size:17px;color:var(--brand2)}
.dprice .btn{margin-top:6px}''',
    '''.dprice{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex:none;min-width:154px;text-align:right;font-family:var(--f-body)}
.dprice .price-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:14px;width:100%}
.dprice .lab{font-size:13px;line-height:1.25;color:var(--muted);font-weight:600;white-space:nowrap}
.dprice .amt{font:700 16px/1.25 var(--f-body);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink)}
.dprice .amt.alt{font-size:16px;color:var(--brand2)}
.dprice .btn{margin-top:7px}''',
    "customer pricing CSS",
)

replace_once(
    "public/index.html",
    '''  .customer-mode .dprice{align-items:flex-start;text-align:left;display:grid;grid-template-columns:auto auto;gap:4px 10px}
  .customer-mode .dprice .btn{grid-column:1/-1;width:100%;margin-top:8px}''',
    '''  .customer-mode .dprice{align-items:stretch;text-align:left;display:flex;min-width:0;width:100%;gap:5px}
  .customer-mode .dprice .price-row{width:100%;max-width:250px}
  .customer-mode .dprice .btn{width:100%;margin-top:8px}''',
    "customer mobile pricing CSS",
)

replace_once(
    "public/app.js",
    '''    if (x.kind === "plan") price.append(h("span", { class: "lab" }, "Per person, per week"), h("span", { class: "amt" }, money(x.plan)));
    else {
      price.append(h("span", { class: "lab" }, x.kind === "combo" ? "Single" : x.kind === "addon" ? "Each" : "Price"), h("span", { class: "amt" }, money(x.single)));
      if (x.kind === "combo" && x.bogo != null) price.append(h("span", { class: "lab" }, "Buy 1 Get 1"), h("span", { class: "amt alt" }, money(x.bogo)));
    }''',
    '''    if (x.kind === "plan") price.append(h("div", { class: "price-row" }, h("span", { class: "lab" }, "Per person, per week"), h("span", { class: "amt" }, money(x.plan))));
    else {
      price.append(h("div", { class: "price-row" }, h("span", { class: "lab" }, x.kind === "combo" ? "Single" : x.kind === "addon" ? "Each" : "Price"), h("span", { class: "amt" }, money(x.single))));
      if (x.kind === "combo" && x.bogo != null) price.append(h("div", { class: "price-row" }, h("span", { class: "lab" }, "Buy 1 Get 1"), h("span", { class: "amt alt" }, money(x.bogo))));
    }''',
    "customer pricing markup",
)

# Reuse the existing one-time fresh Vindhu launch marker for a clean owner dashboard sales baseline.
replace_once(
    "src/store.ts",
    '''  /** Owner Chats intentionally hide messages from before the fresh Vindhu launch. */
  ownerChatResetAfterMessageId(): number {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get("owner_chat_reset_vindhu_20260927") as Row | undefined;
    if (!r) return 0;
    try {
      const v = JSON.parse(String(r.json)) as { afterMessageId?: unknown };
      const n = Number(v.afterMessageId);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }
''',
    '''  /** Owner Chats intentionally hide messages from before the fresh Vindhu launch. */
  ownerChatResetAfterMessageId(): number {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get("owner_chat_reset_vindhu_20260927") as Row | undefined;
    if (!r) return 0;
    try {
      const v = JSON.parse(String(r.json)) as { afterMessageId?: unknown };
      const n = Number(v.afterMessageId);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  /** Timestamp for owner dashboard metrics that should start fresh with the Vindhu launch. */
  ownerFreshLaunchAt(): number {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get("owner_chat_reset_vindhu_20260927") as Row | undefined;
    if (!r) return 0;
    try {
      const v = JSON.parse(String(r.json)) as { at?: unknown };
      const n = Number(v.at);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }
''',
    "owner fresh launch timestamp",
)

replace_once(
    "src/server.ts",
    '''            menu: store.getMenu(), settings: store.getSettings(),
            customers, features: { simulator: cfg.simulator, web: w.enabled },''',
    '''            menu: store.getMenu(), settings: store.getSettings(), ownerLaunchAt: store.ownerFreshLaunchAt(),
            customers, features: { simulator: cfg.simulator, web: w.enabled },''',
    "owner state launch timestamp",
)

# Owner dashboard: today-only sales, starting no earlier than the fresh Vindhu launch.
replace_once(
    "public/desk.js",
    '''let state = { orders: [], alerts: [], menu: [], settings: {}, customers: [], features: {} };''',
    '''let state = { orders: [], alerts: [], menu: [], settings: {}, customers: [], features: {}, ownerLaunchAt: 0 };''',
    "owner state default",
)

replace_once(
    "public/desk.js",
    '''const timeOf = (ts) => new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const isWeb = (id) => String(id).startsWith("web:");''',
    '''const timeOf = (ts) => new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function localDateKey(ts, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}
const isWeb = (id) => String(id).startsWith("web:");''',
    "owner local date helper",
)

replace_once(
    "public/desk.js",
    '''  const sales = state.orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => {
      const t = totalOf(o.items);
      return sum + (t == null ? 0 : t);
    }, 0);

  const kpis = h("section", { class: "owner-kpis", "aria-label": "Kitchen overview" },
    h("div", { class: "owner-kpi", style: "--tone:#1d6b4d" }, h("small", {}, "To cook"), h("strong", {}, cooking), h("span", {}, "Confirmed orders")),
    h("div", { class: "owner-kpi", style: "--tone:#2f8fb0" }, h("small", {}, "Ready"), h("strong", {}, ready), h("span", {}, "Waiting for pickup")),
    h("div", { class: "owner-kpi", style: "--tone:#e7882b" }, h("small", {}, "Needs attention"), h("strong", {}, activeAlerts + held), h("span", {}, "Alerts + held orders")),
    h("div", { class: "owner-kpi", style: "--tone:#6d5537" }, h("small", {}, "Order value"), h("strong", {}, money(sales)), h("span", {}, done + " picked up"))
  );''',
    '''  const launchAt = Number(state.ownerLaunchAt) || 0;
  const tz = state.settings && state.settings.tz ? state.settings.tz : "America/Toronto";
  const today = localDateKey(Date.now(), tz);
  const sales = state.orders
    .filter((o) => o.status !== "cancelled" && Number(o.createdAt || 0) >= launchAt && localDateKey(o.createdAt, tz) === today)
    .reduce((sum, o) => {
      const t = totalOf(o.items);
      return sum + (t == null ? 0 : t);
    }, 0);

  const kpis = h("section", { class: "owner-kpis", "aria-label": "Kitchen overview" },
    h("div", { class: "owner-kpi kpi-cook", style: "--tone:#1d6b4d", "data-icon": "♨" }, h("small", {}, "To cook"), h("strong", {}, cooking), h("span", {}, "Confirmed orders")),
    h("div", { class: "owner-kpi kpi-ready", style: "--tone:#2f8fb0", "data-icon": "✓" }, h("small", {}, "Ready"), h("strong", {}, ready), h("span", {}, "Waiting for pickup")),
    h("div", { class: "owner-kpi kpi-attn", style: "--tone:#e7882b", "data-icon": "!" }, h("small", {}, "Needs attention"), h("strong", {}, activeAlerts + held), h("span", {}, "Alerts + held orders")),
    h("div", { class: "owner-kpi kpi-sales", style: "--tone:#8b5a2b", "data-icon": "$" }, h("small", {}, "Today's sales"), h("strong", {}, money(sales)), h("span", {}, "Fresh orders today"))
  );''',
    "owner dashboard sales KPI",
)

replace_once(
    "public/desk.js",
    '''  out.push(h("h2", {}, "Quick actions"),
    h("div", { class: "card", style: "display:flex;gap:8px;flex-wrap:wrap" },
      h("button", { class: "pri", onclick: () => { tab = "orders"; render(); } }, "Manage orders"),
      h("button", { onclick: () => { tab = "cook"; cook = null; render(); } }, "Open kitchen list"),
      h("button", { onclick: () => { tab = "chats"; render(); } }, "Customer chats"),
      h("button", { onclick: () => { tab = "menu"; render(); } }, "Update menu")));''',
    '''  out.push(h("h2", {}, "Quick actions"),
    h("div", { class: "card owner-quick-actions" },
      h("button", { class: "quick quick-orders", onclick: () => { tab = "orders"; render(); } }, "Manage orders"),
      h("button", { class: "quick quick-kitchen", onclick: () => { tab = "cook"; cook = null; render(); } }, "Open kitchen list"),
      h("button", { class: "quick quick-chats", onclick: () => { tab = "chats"; render(); } }, "Customer chats"),
      h("button", { class: "quick quick-menu", onclick: () => { tab = "menu"; render(); } }, "Update menu")));''',
    "owner quick actions",
)

# Tasteful owner visual polish: stronger color cues without changing workflows.
replace_once(
    "public/desk.html",
    '''.owner-kpi{
  position:relative;overflow:hidden;min-height:106px;padding:15px;
  background:var(--panel);border:1px solid var(--line);border-radius:18px;
  box-shadow:var(--owner-shadow);
}
.owner-kpi::after{
  content:"";position:absolute;width:70px;height:70px;right:-25px;bottom:-30px;
  border-radius:50%;background:color-mix(in srgb,var(--tone) 16%,transparent);
}
.owner-kpi small{
  display:block;color:var(--muted);font-size:11px;font-weight:900;
  text-transform:uppercase;letter-spacing:.08em;
}
.owner-kpi strong{display:block;margin-top:8px;font-size:29px;line-height:1;color:var(--tone)}
.owner-kpi span{display:block;margin-top:7px;color:var(--muted);font-size:12px}''',
    '''.owner-kpi{
  position:relative;overflow:hidden;min-height:112px;padding:15px;
  background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 9%,var(--panel)),var(--panel) 72%);
  border:1px solid color-mix(in srgb,var(--tone) 22%,var(--line));border-radius:18px;
  box-shadow:var(--owner-shadow);
}
.owner-kpi::before{
  content:attr(data-icon);position:absolute;right:13px;top:13px;z-index:1;
  display:grid;place-items:center;width:34px;height:34px;border-radius:11px;
  background:color-mix(in srgb,var(--tone) 14%,var(--panel));color:var(--tone);
  border:1px solid color-mix(in srgb,var(--tone) 24%,var(--line));font-size:17px;font-weight:900;
}
.owner-kpi::after{
  content:"";position:absolute;width:86px;height:86px;right:-30px;bottom:-38px;
  border-radius:50%;background:color-mix(in srgb,var(--tone) 14%,transparent);
}
.owner-kpi small{
  display:block;padding-right:40px;color:var(--muted);font-size:11px;font-weight:900;
  text-transform:uppercase;letter-spacing:.08em;
}
.owner-kpi strong{display:block;margin-top:8px;font-size:29px;line-height:1;color:var(--tone)}
.owner-kpi span{display:block;margin-top:7px;color:var(--muted);font-size:12px}''',
    "owner KPI visual polish",
)

replace_once(
    "public/desk.html",
    '''.lane-cook{box-shadow:inset 0 3px 0 #1d6b4d}
.lane-ready{box-shadow:inset 0 3px 0 #2f8fb0}''',
    '''.lane-cook{box-shadow:inset 0 3px 0 #1d6b4d;background:linear-gradient(180deg,color-mix(in srgb,#1d6b4d 5%,var(--panel)),var(--panel))}
.lane-ready{box-shadow:inset 0 3px 0 #2f8fb0;background:linear-gradient(180deg,color-mix(in srgb,#2f8fb0 6%,var(--panel)),var(--panel))}''',
    "owner lane color polish",
)

insert_anchor = '''.owner-note{
  padding:11px 13px;border-radius:14px;background:var(--panel2);
  border:1px solid var(--line);color:var(--muted);font-size:13px;
}
'''
insert_block = insert_anchor + '''.owner-quick-actions{
  display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px!important;padding:12px!important;
  background:linear-gradient(135deg,color-mix(in srgb,var(--owner-green-2) 4%,var(--panel)),var(--panel));
}
.owner-quick-actions .quick{
  min-height:64px;text-align:left;padding:11px 12px;border-radius:14px;font-weight:800;
  background:var(--panel);border:1px solid var(--line);box-shadow:0 7px 18px rgba(30,45,35,.045);
}
.owner-quick-actions .quick-orders{border-color:color-mix(in srgb,#1d6b4d 32%,var(--line));background:color-mix(in srgb,#1d6b4d 7%,var(--panel))}
.owner-quick-actions .quick-kitchen{border-color:color-mix(in srgb,#e7882b 34%,var(--line));background:color-mix(in srgb,#e7882b 8%,var(--panel))}
.owner-quick-actions .quick-chats{border-color:color-mix(in srgb,#2f8fb0 32%,var(--line));background:color-mix(in srgb,#2f8fb0 7%,var(--panel))}
.owner-quick-actions .quick-menu{border-color:color-mix(in srgb,#8b5a2b 30%,var(--line));background:color-mix(in srgb,#8b5a2b 7%,var(--panel))}
.owner-quick-actions .quick:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(30,45,35,.08)}
'''
replace_once("public/desk.html", insert_anchor, insert_block, "owner quick action styles")

replace_once(
    "public/desk.html",
    '''  .owner-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .owner-head{padding:14px}''',
    '''  .owner-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .owner-quick-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .owner-head{padding:14px}''',
    "owner tablet quick actions",
)

replace_once(
    "public/desk.html",
    '''  .owner-kpis{gap:8px}
  .owner-kpi{min-height:96px;padding:13px}''',
    '''  .owner-kpis{gap:8px}
  .owner-quick-actions{grid-template-columns:1fr 1fr!important;gap:8px!important}
  .owner-quick-actions .quick{min-height:58px}
  .owner-kpi{min-height:102px;padding:13px}''',
    "owner mobile quick actions",
)
