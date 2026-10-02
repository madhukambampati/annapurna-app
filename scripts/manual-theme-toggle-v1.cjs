const fs = require('fs');

function replaceOnce(file, oldText, newText) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`Expected block not found in ${file}: ${oldText.slice(0, 140)}`);
  s = s.replace(oldText, newText);
  fs.writeFileSync(file, s);
}

function insertBefore(file, marker, text) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(marker)) throw new Error(`Marker not found in ${file}: ${marker}`);
  s = s.replace(marker, `${text}\n${marker}`);
  fs.writeFileSync(file, s);
}

const earlyThemeScript = `<script id="themeBootV1">
(function () {
  var theme = "";
  try { theme = localStorage.getItem("annapurna-theme") || ""; } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    var hour = new Date().getHours();
    theme = (hour >= 19 || hour < 7) ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
</script>`;

const customerThemeCss = `<style id="manualThemeV1">
/* Default is time-aware (dark 7 PM–6:59 AM). A customer's manual choice is saved in this browser. */
html[data-theme="light"]{color-scheme:light;--bg:#efe8d8;--page:#f7f2e7;--surface:#fffdf8;--surface2:#f6efe0;--ink:#1b2a21;--muted:#56645a;--dim:#7c897f;--line:#e6dcc6;--line2:#d2c6ac;--brand:#1d6b4d;--brand2:#155239;--on-brand:#fff;--brand-soft:#dfeee5;--accent:#f1a824;--accent-soft:#fff0c9;--on-accent:#3b2700;--chilli:#b83527;--chilli-soft:#fde4df;--cust:#1d6b4d;--on-cust:#fff;--agent:#fffdf8;--owner:#fff0c9;--shadow:0 18px 50px rgba(27,42,33,.14)}
html[data-theme="dark"]{color-scheme:dark;--bg:#0b120d;--page:#101a13;--surface:#17231b;--surface2:#1d2c22;--ink:#eaf1e6;--muted:#a5b6a9;--dim:#7d9084;--line:#26382c;--line2:#33493a;--brand:#46b385;--brand2:#5cc79a;--on-brand:#06210f;--brand-soft:#1a3a2b;--accent:#f3b544;--accent-soft:#3a2d0e;--on-accent:#f7e3ad;--chilli:#ff9282;--chilli-soft:#3d1b17;--cust:#2b7d5c;--on-cust:#fff;--agent:#17231b;--owner:#3a2d0e;--shadow:0 18px 50px rgba(0,0,0,.5)}
html[data-theme="light"] body.customer-mode{--si-leaf:#176247;--si-leaf-deep:#0e4933;--si-turmeric:#e4a11b;--si-turmeric-soft:#fff2cf;--si-chilli:#b93b2d;--si-coffee:#6f4329;--si-jasmine:#fffdf7;--si-rice:#f7f1e5;--si-line:#e8dcc5;--si-shadow:0 12px 32px rgba(35,61,44,.09)}
html[data-theme="dark"] body.customer-mode{--si-leaf:#52bc8b;--si-leaf-deep:#6acb9c;--si-turmeric:#efb545;--si-turmeric-soft:#3b2d0d;--si-chilli:#f18b78;--si-coffee:#d4a27f;--si-jasmine:#17231b;--si-rice:#101a13;--si-line:#2c3d31;--si-shadow:0 12px 32px rgba(0,0,0,.28)}
html[data-theme="light"] .handoff .ic{color:var(--on-accent)}
html[data-theme="dark"] .handoff .ic{color:var(--accent)}
.theme-toggle{flex:none;width:36px;height:36px;padding:0;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;background:var(--surface2);color:var(--ink);font-size:17px;line-height:1;cursor:pointer;box-shadow:0 5px 14px rgba(20,50,32,.06);transition:transform .16s ease,background .16s ease,border-color .16s ease}
.theme-toggle:hover{background:var(--brand-soft);border-color:var(--brand)}
.theme-toggle:active{transform:scale(.92)}
@media(max-width:420px){.theme-toggle{width:30px;height:30px;font-size:14px}.customer-mode .top{padding-left:7px;padding-right:7px}.customer-mode .brand{max-width:66px!important}}
@media(max-width:320px){.theme-toggle{width:27px;height:27px;font-size:13px}.customer-mode .brand{max-width:50px!important}}
</style>`;

const ownerThemeCss = `<style id="ownerManualThemeV1">
html[data-theme="light"]{color-scheme:light;--bg:#efe8d8;--panel:#fffdf8;--panel2:#f6efe0;--line:#e6dcc6;--line2:#d2c6ac;--cream:#1b2a21;--muted:#56645a;--gold:#1d6b4d;--on-gold:#fff;--chilli:#b83527;--leaf:#1d6b4d;--me:#dfeee5;--agent:#f6efe0;--maddy:#fff0c9;--paper:#fffdf8;--ink:#1b2a21;--flag:#b83527;--bad:#b83527}
html[data-theme="dark"]{color-scheme:dark;--bg:#0b120d;--panel:#16211a;--panel2:#1d2c22;--line:#26382c;--line2:#33493a;--cream:#eaf1e6;--muted:#a5b6a9;--gold:#46b385;--on-gold:#06210f;--chilli:#ff9282;--leaf:#5cc79a;--me:#1a3a2b;--agent:#1d2c22;--maddy:#3a2d0e;--paper:#1d2c22;--ink:#eaf1e6;--flag:#ff9282;--bad:#ff9282}
.owner-head-actions{display:flex;align-items:center;gap:8px;flex:none}
.owner-theme-toggle{width:40px;height:40px;display:grid;place-items:center;flex:none;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.20);background:rgba(255,255,255,.10);color:#fff;font-size:18px;line-height:1;box-shadow:none}
.owner-theme-toggle:hover{background:rgba(255,255,255,.18)}
.owner-theme-toggle:active{transform:scale(.94)}
@media(max-width:520px){.owner-head-actions{gap:5px}.owner-theme-toggle{width:36px;height:36px;font-size:16px}.owner-pill{display:none}}
</style>`;

// Customer page: set the saved/time-aware theme before paint, add a compact manual toggle, then add
// final-cascade variable overrides so a manual choice wins over prefers-color-scheme.
replaceOnce('public/index.html',
  '<meta name="theme-color" content="#1d6b4d">\n<meta name="color-scheme" content="light dark">',
  `<meta name="theme-color" content="#1d6b4d">\n${earlyThemeScript}\n<meta name="color-scheme" content="light dark">`);
insertBefore('public/index.html', '</head>', customerThemeCss);
replaceOnce('public/index.html',
  '    </nav>\n  </header>',
  `    </nav>\n    <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch theme" title="Change theme">🌙</button>\n  </header>`);

// Customer JS: same storage key is intentionally shared with /desk on the same origin.
replaceOnce('public/app.js',
  '  var NAME_KEY = "annapurna-name";\n',
  '  var NAME_KEY = "annapurna-name";\n  var THEME_KEY = "annapurna-theme";\n');
replaceOnce('public/app.js',
`  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else if (v !== undefined) localStorage.setItem(k, v); else return localStorage.getItem(k); } catch (e) { /* private mode */ } return null; }\n`,
`  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else if (v !== undefined) localStorage.setItem(k, v); else return localStorage.getItem(k); } catch (e) { /* private mode */ } return null; }\n\n  function timeTheme() {\n    var hour = new Date().getHours();\n    return (hour >= 19 || hour < 7) ? "dark" : "light";\n  }\n  function applyTheme(theme, remember) {\n    var value = theme === "dark" ? "dark" : "light";\n    document.documentElement.setAttribute("data-theme", value);\n    if (remember) store(THEME_KEY, value);\n    var btn = $("themeToggle");\n    if (btn) {\n      var dark = value === "dark";\n      btn.textContent = dark ? "☀️" : "🌙";\n      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");\n      btn.title = dark ? "Light mode" : "Dark mode";\n    }\n    var meta = document.querySelector('meta[name="theme-color"]');\n    if (meta) meta.setAttribute("content", value === "dark" ? "#101a13" : "#1d6b4d");\n  }\n  function initTheme() {\n    var saved = store(THEME_KEY);\n    var manual = saved === "light" || saved === "dark";\n    applyTheme(manual ? saved : timeTheme(), false);\n    var btn = $("themeToggle");\n    if (btn) btn.addEventListener("click", function () {\n      var current = document.documentElement.getAttribute("data-theme") || timeTheme();\n      applyTheme(current === "dark" ? "light" : "dark", true);\n    });\n    if (!manual) window.setInterval(function () {\n      if (store(THEME_KEY) !== "light" && store(THEME_KEY) !== "dark") applyTheme(timeTheme(), false);\n    }, 60000);\n  }\n\n  initTheme();\n`);

// Owner page uses the same saved preference and the same pre-paint fallback.
replaceOnce('public/desk.html',
  '<meta name="theme-color" content="#1d6b4d">\n<title>Annapurna Order Desk</title>',
  `<meta name="theme-color" content="#1d6b4d">\n${earlyThemeScript}\n<title>Annapurna Order Desk</title>`);
insertBefore('public/desk.html', '</head>', ownerThemeCss);
replaceOnce('public/desk.html',
  '  <div class="owner-pill">Owner console</div>\n',
  `  <div class="owner-head-actions">\n    <button class="owner-theme-toggle" id="ownerThemeToggle" type="button" aria-label="Switch theme" title="Change theme">🌙</button>\n    <div class="owner-pill">Owner console</div>\n  </div>\n`);

replaceOnce('public/desk.js',
  'const CHIPS = ["What\'s on the menu?", "2 chicken kheema fry combos, buy 1 get 1, pickup Friday 6pm", "Full meal plan for 2 people, pickup Monday 5pm", "yes", "I want to cancel my order"];\n',
  'const CHIPS = ["What\'s on the menu?", "2 chicken kheema fry combos, buy 1 get 1, pickup Friday 6pm", "Full meal plan for 2 people, pickup Monday 5pm", "yes", "I want to cancel my order"];\nconst THEME_KEY = "annapurna-theme";\n');
replaceOnce('public/desk.js',
`let orderQuery = "", orderStatusFilter = "all", chatQuery = "";\ntry { token = localStorage.getItem("annapurna-owner") || ""; } catch { /* storage blocked */ }\n`,
`let orderQuery = "", orderStatusFilter = "all", chatQuery = "";\n\nfunction ownerTimeTheme() {\n  const hour = new Date().getHours();\n  return (hour >= 19 || hour < 7) ? "dark" : "light";\n}\nfunction applyOwnerTheme(theme, remember = false) {\n  const value = theme === "dark" ? "dark" : "light";\n  document.documentElement.setAttribute("data-theme", value);\n  if (remember) { try { localStorage.setItem(THEME_KEY, value); } catch { /* storage blocked */ } }\n  const btn = $("ownerThemeToggle");\n  if (btn) {\n    const dark = value === "dark";\n    btn.textContent = dark ? "☀️" : "🌙";\n    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");\n    btn.title = dark ? "Light mode" : "Dark mode";\n  }\n  const meta = document.querySelector('meta[name="theme-color"]');\n  if (meta) meta.setAttribute("content", value === "dark" ? "#0b120d" : "#1d6b4d");\n}\nfunction initOwnerTheme() {\n  let saved = "";\n  try { saved = localStorage.getItem(THEME_KEY) || ""; } catch { /* storage blocked */ }\n  const manual = saved === "light" || saved === "dark";\n  applyOwnerTheme(manual ? saved : ownerTimeTheme());\n  const btn = $("ownerThemeToggle");\n  if (btn) btn.addEventListener("click", () => {\n    const current = document.documentElement.getAttribute("data-theme") || ownerTimeTheme();\n    applyOwnerTheme(current === "dark" ? "light" : "dark", true);\n  });\n  if (!manual) window.setInterval(() => {\n    let currentSaved = "";\n    try { currentSaved = localStorage.getItem(THEME_KEY) || ""; } catch { /* ignore */ }\n    if (currentSaved !== "light" && currentSaved !== "dark") applyOwnerTheme(ownerTimeTheme());\n  }, 60000);\n}\n\ntry { token = localStorage.getItem("annapurna-owner") || ""; } catch { /* storage blocked */ }\ninitOwnerTheme();\n`);

// Static guards make the CI failure obvious if the visible controls or shared preference disappear.
for (const [file, needles] of Object.entries({
  'public/index.html': ['id="themeToggle"', 'id="manualThemeV1"', 'id="themeBootV1"'],
  'public/app.js': ['annapurna-theme', 'initTheme();', 'Switch to light mode'],
  'public/desk.html': ['id="ownerThemeToggle"', 'id="ownerManualThemeV1"', 'id="themeBootV1"'],
  'public/desk.js': ['annapurna-theme', 'initOwnerTheme();', 'Switch to light mode'],
})) {
  const s = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!s.includes(needle)) throw new Error(`${file} missing ${needle}`);
}

console.log('Manual customer + owner theme controls applied.');
