from pathlib import Path

# Presentation-only rename: customer-facing "Weekend Combos" -> "Combos".
# Keep backend menu kinds, pricing, availability rules, and intent logic unchanged.

index = Path('public/index.html')
s = index.read_text()
old = '<span class="tile-copy"><b>Weekend Combos</b><small>Single & Buy 1 Get 1 specials</small></span>'
new = '<span class="tile-copy"><b>Combos</b><small>Single & Buy 1 Get 1 specials</small></span>'
assert old in s
s = s.replace(old, new, 1)
index.write_text(s)

app = Path('public/app.js')
s = app.read_text()
old_panel = 'if (combos.length) panels.push(["Weekend combos", h("div", { class: "panel" },'
new_panel = 'if (combos.length) panels.push(["Combos", h("div", { class: "panel" },'
assert old_panel in s
s = s.replace(old_panel, new_panel, 1)

old_action = '["sun", "Weekend combos", false, function () { if (!busy) send("What weekend combos are running?"); }],'
new_action = '["sun", "Combos", false, function () { if (!busy) send("What weekend combos are running?"); }],'
assert old_action in s
s = s.replace(old_action, new_action, 1)

old_home = '$("homeCombos").addEventListener("click", function (e) { showMenu(e, "Weekend combos"); });'
new_home = '$("homeCombos").addEventListener("click", function (e) { showMenu(e, "Combos"); });'
assert old_home in s
s = s.replace(old_home, new_home, 1)
app.write_text(s)
