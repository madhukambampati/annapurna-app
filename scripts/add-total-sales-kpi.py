from pathlib import Path

# Add the Total Sales calculation and dashboard card.
p = Path("public/desk.js")
s = p.read_text()

calc = '''  const totalSales = state.orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => {
      const t = totalOf(o.items);
      return sum + (t == null ? 0 : t);
    }, 0);

'''
marker = '  const kpis = h("section", { class: "owner-kpis", "aria-label": "Kitchen overview" },\n'
if calc not in s:
    if marker not in s:
        raise SystemExit("dashboard KPI marker not found")
    s = s.replace(marker, calc + marker, 1)

old_card = '''    h("div", { class: "owner-kpi kpi-sales", style: "--tone:#8b5a2b", "data-icon": "$" }, h("small", {}, "Today's sales"), h("strong", {}, money(sales)), h("span", {}, "Fresh orders today"))
  );'''
new_card = '''    h("div", { class: "owner-kpi kpi-sales", style: "--tone:#8b5a2b", "data-icon": "$" }, h("small", {}, "Today's sales"), h("strong", {}, money(sales)), h("span", {}, "Fresh orders today")),
    h("div", { class: "owner-kpi kpi-total-sales", style: "--tone:#476b52", "data-icon": "$" }, h("small", {}, "Total sales"), h("strong", {}, money(totalSales)), h("span", {}, "All non-cancelled orders"))
  );'''
if new_card not in s:
    if old_card not in s:
        raise SystemExit("Today's sales KPI block not found")
    s = s.replace(old_card, new_card, 1)

p.write_text(s)

# Fit five KPI cards across the desktop owner dashboard; tablet/mobile rules stay two-column.
p = Path("public/desk.html")
s = p.read_text()
old = '.owner-kpis{\n  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:4px 0 16px;\n}'
new = '.owner-kpis{\n  display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:4px 0 16px;\n}'
if new not in s:
    if old not in s:
        raise SystemExit("base owner KPI grid rule not found")
    s = s.replace(old, new, 1)

old = '  body.owner-mode .owner-kpis{grid-template-columns:repeat(4,minmax(0,1fr))!important}'
new = '  body.owner-mode .owner-kpis{grid-template-columns:repeat(5,minmax(0,1fr))!important}'
if new not in s:
    if old not in s:
        raise SystemExit("desktop owner KPI override not found")
    s = s.replace(old, new, 1)

p.write_text(s)
