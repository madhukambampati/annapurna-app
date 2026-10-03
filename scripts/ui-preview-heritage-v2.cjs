const fs = require('node:fs');

function replaceOnce(src, needle, replacement, label) {
  if (!src.includes(needle)) throw new Error(`Missing marker for ${label}`);
  return src.replace(needle, replacement);
}

const customerPath = 'public/index.html';
let customer = fs.readFileSync(customerPath, 'utf8');
if (customer.includes('heritageBotPreviewV2')) throw new Error('heritageBotPreviewV2 already present');

const customerCss = String.raw`
<style id="heritageBotPreviewV2">
/* PREVIEW ONLY — South Indian heritage styling wrapped around the existing Vindhu bot experience. */
body.customer-mode{
  --heritage-green:#0f4d37;
  --heritage-green-2:#176247;
  --heritage-gold:#e3aa3b;
  --heritage-red:#b94232;
  --heritage-cream:#fff8e9;
}
html[data-theme="light"] body.customer-mode{
  background:
    radial-gradient(circle at 14px 14px,rgba(227,170,59,.07) 1.4px,transparent 1.6px) 0 0/28px 28px,
    linear-gradient(180deg,#eee4cf,#f8f1e4 46%,#efe5d1);
}
.customer-mode .app{
  background:
    radial-gradient(420px 240px at 108% 14%,rgba(227,170,59,.08),transparent 72%),
    radial-gradient(360px 280px at -8% 78%,rgba(23,98,71,.07),transparent 72%),
    var(--page);
}
.customer-mode .top{
  position:relative;z-index:24;
  background:
    radial-gradient(160px 70px at 78% -20%,rgba(227,170,59,.20),transparent 72%),
    linear-gradient(135deg,#0b3e2d 0%,#11543c 58%,#176247 100%);
  color:#fff;border-bottom:1px solid rgba(227,170,59,.55);
  box-shadow:0 8px 24px rgba(8,45,31,.16);
}
.customer-mode .top::after{
  content:"";position:absolute;left:0;right:0;bottom:-5px;height:6px;pointer-events:none;
  background:radial-gradient(ellipse at 50% -35%,var(--heritage-gold) 0 35%,transparent 38%) 0 0/22px 8px repeat-x;
  opacity:.78;
}
.customer-mode .brand h1{color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.15)}
.customer-mode .brand small{color:#f5d894}
.customer-mode .brand-home{color:#fff}
.customer-mode .seal{box-shadow:0 0 0 1px rgba(227,170,59,.48),0 5px 14px rgba(0,0,0,.16)}
.customer-mode .tab{color:rgba(255,255,255,.78)}
.customer-mode .tab:hover{background:rgba(255,255,255,.10);color:#fff}
.customer-mode .tab[aria-selected="true"],.customer-mode .tab.active{background:rgba(227,170,59,.15);color:#fff}
.customer-mode .theme-toggle{background:rgba(255,255,255,.10);border-color:rgba(227,170,59,.45);color:#fff;box-shadow:none}
.customer-mode .theme-toggle:hover{background:rgba(255,255,255,.17);border-color:var(--heritage-gold)}

.customer-mode .customer-home{position:relative}
.customer-mode .customer-home::before,
.customer-mode .customer-home::after{
  content:"";position:absolute;z-index:0;pointer-events:none;opacity:.10;
  width:160px;height:160px;border:1px solid var(--heritage-gold);transform:rotate(45deg);
}
.customer-mode .customer-home::before{left:-116px;top:210px}
.customer-mode .customer-home::after{right:-118px;bottom:210px}
.customer-mode .customer-home>*{position:relative;z-index:1}
.customer-mode .home-hero{
  border:1px solid rgba(227,170,59,.62);
  background:
    radial-gradient(circle at 84% 16%,rgba(227,170,59,.24),transparent 25%),
    radial-gradient(circle at 16% 92%,rgba(255,255,255,.10),transparent 28%),
    linear-gradient(138deg,#0d4934 0%,#126047 58%,#0b3f2d 100%);
  box-shadow:0 18px 42px rgba(11,62,45,.18);
}
.customer-mode .home-hero::before{
  content:"✦  ✦  ✦";position:absolute;right:18px;top:13px;color:rgba(245,216,148,.54);
  letter-spacing:.35em;font-size:10px;pointer-events:none;
}
.customer-mode .home-eyebrow{color:#f7dda0;letter-spacing:.095em}
.customer-mode .home-copy h2{color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.08)}
.customer-mode .home-copy p{color:rgba(255,255,255,.84)}
.customer-mode .home-primary{
  background:linear-gradient(180deg,#efbc58,#dfa437);color:#2d210b;border:1px solid #f3ca79;
  box-shadow:0 8px 18px rgba(0,0,0,.14);
}
.customer-mode .home-primary:hover{filter:brightness(1.04)}
.customer-mode .home-secondary{border-color:rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff}
.customer-mode .home-secondary:hover{background:rgba(255,255,255,.14)}
.customer-mode .home-bubble{border-color:rgba(227,170,59,.42);box-shadow:0 10px 26px rgba(8,45,31,.12)}
.customer-mode .home-motion-stage::after{
  content:"";position:absolute;inset:12% 10%;border:1px dashed rgba(245,216,148,.24);border-radius:50%;pointer-events:none;
}

.customer-mode .home-section-head span{color:var(--heritage-red)}
.customer-mode .home-section-head h3{color:var(--heritage-green)}
.customer-mode .home-tile{
  border-color:color-mix(in srgb,var(--heritage-gold) 24%,var(--line));
  background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 94%,#fff2cf 6%),var(--surface));
  box-shadow:0 9px 22px rgba(41,59,47,.055);
}
.customer-mode .home-tile::before{
  content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:3px;background:var(--heritage-gold);opacity:.65;
}
.customer-mode .home-tile:hover{border-color:color-mix(in srgb,var(--heritage-gold) 52%,var(--line));transform:translateY(-1px)}
.customer-mode .tile-icon{background:color-mix(in srgb,var(--heritage-green) 11%,var(--surface));color:var(--heritage-green)}
.customer-mode .home-promise{
  border-top:1px solid color-mix(in srgb,var(--heritage-gold) 30%,var(--line));
  border-bottom:1px solid color-mix(in srgb,var(--heritage-gold) 22%,var(--line));
}
.customer-mode .promise-icon{color:var(--heritage-green);background:color-mix(in srgb,var(--heritage-green) 10%,var(--surface))}
.heritage-signoff{
  display:flex;align-items:center;justify-content:center;gap:9px;margin:4px 0 0;padding:11px 14px;
  border:1px solid color-mix(in srgb,var(--heritage-gold) 32%,var(--line));border-radius:14px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--heritage-green) 6%,var(--surface)),var(--surface),color-mix(in srgb,var(--heritage-gold) 7%,var(--surface)));
  color:var(--heritage-green);font:700 13px/1.25 var(--f-display);letter-spacing:.015em;text-align:center;
}
.heritage-signoff::before,.heritage-signoff::after{content:"❈";color:var(--heritage-gold);font-size:12px}

.customer-mode .onboard .hero{
  border:1px solid rgba(227,170,59,.55);
  background:
    radial-gradient(circle at 85% 12%,rgba(227,170,59,.25),transparent 27%),
    linear-gradient(140deg,#0e4a35 0%,#176247 100%);
  box-shadow:0 14px 34px rgba(11,62,45,.14);
}
.customer-mode .onboard .hero .kick{color:#ffe4a6;background:rgba(255,255,255,.10);border:1px solid rgba(227,170,59,.28)}
.customer-mode .steps li{border-color:color-mix(in srgb,var(--heritage-gold) 22%,var(--line));box-shadow:0 6px 14px rgba(35,61,44,.04)}
.customer-mode .steps b{background:color-mix(in srgb,var(--heritage-gold) 18%,var(--surface));color:var(--heritage-green)}
.customer-mode .assistant-trust{border-color:color-mix(in srgb,var(--heritage-green) 28%,var(--line));background:color-mix(in srgb,var(--heritage-green) 7%,var(--surface))}
.customer-mode .card{border-color:color-mix(in srgb,var(--heritage-gold) 20%,var(--line));box-shadow:0 10px 26px rgba(35,61,44,.05)}

.customer-mode .chat{background:linear-gradient(180deg,color-mix(in srgb,var(--page) 97%,var(--heritage-gold) 3%),var(--page))}
.customer-mode .msgs{background-image:radial-gradient(circle at 12px 12px,rgba(227,170,59,.05) 1.1px,transparent 1.2px);background-size:24px 24px}
.customer-mode .b.agent{border-color:color-mix(in srgb,var(--heritage-gold) 18%,var(--line))}
.customer-mode .b.cust{background:linear-gradient(145deg,#176247,#0f4d37)}
.customer-mode .chips button{border-color:color-mix(in srgb,var(--heritage-gold) 28%,var(--line2));background:color-mix(in srgb,var(--surface) 97%,#fff1cf 3%)}
.customer-mode .chips button:hover{border-color:var(--heritage-gold);color:var(--heritage-green)}
.customer-mode .composer{border-top-color:color-mix(in srgb,var(--heritage-gold) 20%,var(--line));background:color-mix(in srgb,var(--surface) 96%,#fff4d8 4%)}

html[data-theme="dark"] body.customer-mode .top{
  background:linear-gradient(135deg,#082d20,#0d3e2d 60%,#124d38);border-bottom-color:rgba(239,181,69,.42)
}
html[data-theme="dark"] body.customer-mode .home-section-head h3,
html[data-theme="dark"] .heritage-signoff{color:var(--brand)}
html[data-theme="dark"] .heritage-signoff{background:linear-gradient(90deg,#13231a,#17231b,#201e13)}
html[data-theme="dark"] body.customer-mode .home-tile{background:linear-gradient(145deg,#18251c,#17231b)}

@media(max-width:520px){
  .customer-mode .top::after{bottom:-4px;height:5px;background-size:18px 7px}
  .customer-mode .home-hero{border-radius:22px}
  .heritage-signoff{font-size:12px;padding:10px 8px}
}
@media(prefers-reduced-motion:reduce){.customer-mode .home-tile{transition:none!important}}
</style>`;

customer = replaceOnce(customer, '</head>', `${customerCss}\n</head>`, 'customer head');
customer = replaceOnce(
  customer,
  '    <section class="home-promise">',
  '    <div class="heritage-signoff" aria-label="Annapurna tradition">ఇంటి రుచి · Inti Ruchi · Mana Sampradayam</div>\n\n    <section class="home-promise">',
  'heritage signoff'
);
fs.writeFileSync(customerPath, customer);

const deskPath = 'public/desk.html';
let desk = fs.readFileSync(deskPath, 'utf8');
if (desk.includes('ownerHeritagePreviewV2')) throw new Error('ownerHeritagePreviewV2 already present');

const deskCss = String.raw`
<style id="ownerHeritagePreviewV2">
/* PREVIEW ONLY — traditional Annapurna branding with the existing operational owner desk. */
body.owner-mode{
  --heritage-green:#0f4d37;--heritage-green-2:#176247;--heritage-gold:#e3aa3b;--heritage-red:#b94232;
  background:
    radial-gradient(circle at 16px 16px,rgba(227,170,59,.055) 1.2px,transparent 1.3px) 0 0/32px 32px,
    linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--bg) 90%,#fff 10%));
}
body.owner-mode .owner-head{
  position:relative;overflow:hidden;
  background:
    radial-gradient(260px 120px at 82% -20%,rgba(227,170,59,.28),transparent 72%),
    linear-gradient(135deg,#0b3e2d,#11543c 62%,#176247);
  border:1px solid rgba(227,170,59,.34);box-shadow:0 16px 36px rgba(8,45,31,.16);
}
body.owner-mode .owner-head::after{
  content:"";position:absolute;right:-28px;bottom:-38px;width:120px;height:120px;border:1px solid rgba(245,216,148,.20);transform:rotate(45deg);pointer-events:none;
}
body.owner-mode .owner-brand img{box-shadow:0 0 0 1px rgba(227,170,59,.42),0 7px 18px rgba(0,0,0,.15)}
body.owner-mode .owner-brand h1{font-family:var(--f-display);letter-spacing:.01em}
body.owner-mode .owner-brand .sub{color:#f3d997}
body.owner-mode .owner-pill{color:#fff3cf;border-color:rgba(227,170,59,.38);background:rgba(227,170,59,.10)}
body.owner-mode .owner-theme-toggle{border-color:rgba(227,170,59,.42)}
body.owner-mode .owner-page-title h2,body.owner-mode h2{color:color-mix(in srgb,var(--cream) 88%,var(--heritage-green) 12%)}
body.owner-mode .owner-filters{border-color:color-mix(in srgb,var(--heritage-gold) 18%,var(--line));box-shadow:0 8px 22px rgba(30,45,35,.045)}
body.owner-mode .order-lane{border-color:color-mix(in srgb,var(--heritage-gold) 14%,var(--line));box-shadow:0 9px 22px rgba(30,45,35,.04)}
body.owner-mode .ticket{border-color:color-mix(in srgb,var(--heritage-gold) 12%,var(--line))}
body.owner-mode .owner-note{border-color:color-mix(in srgb,var(--heritage-gold) 20%,var(--line))}

@media(min-width:900px){
  body.owner-mode{
    display:grid;grid-template-columns:205px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);
    column-gap:18px;align-items:start;max-width:1280px;
  }
  body.owner-mode .owner-head{grid-column:1/-1;width:100%;margin-bottom:0}
  body.owner-mode>#err{grid-column:1/-1}
  body.owner-mode>#tabs{
    grid-column:1;grid-row:2;position:sticky;top:14px;width:100%;margin:14px 0 0;padding:10px;
    display:flex;flex-direction:column;align-items:stretch;gap:6px;
    border:1px solid color-mix(in srgb,var(--heritage-gold) 18%,var(--line));border-radius:18px;
    background:
      radial-gradient(120px 160px at -10% 105%,rgba(23,98,71,.08),transparent 70%),
      color-mix(in srgb,var(--panel) 97%,#fff5df 3%);
    box-shadow:0 12px 28px rgba(30,45,35,.06);backdrop-filter:none;-webkit-backdrop-filter:none;
  }
  body.owner-mode>#tabs::after{
    content:"Inti Ruchi\A Mana Sampradayam";white-space:pre;margin-top:8px;padding:13px 8px 5px;
    border-top:1px solid color-mix(in srgb,var(--heritage-gold) 22%,var(--line));
    color:var(--muted);font:700 11px/1.45 var(--f-display);text-align:center;
  }
  body.owner-mode>#tabs button{
    flex:none;width:100%;min-height:46px;justify-content:flex-start;text-align:left;padding:10px 12px;border-radius:12px;
  }
  body.owner-mode>#tabs button[aria-selected=true]{
    background:linear-gradient(135deg,#0f4d37,#176247);color:#fff;border-color:#176247;box-shadow:0 7px 16px rgba(15,77,55,.18)
  }
  body.owner-mode>#panel{grid-column:2;grid-row:2;min-width:0;padding-top:2px}
}
html[data-theme="dark"] body.owner-mode>#tabs{background:linear-gradient(180deg,#15231a,#17231b);border-color:rgba(239,181,69,.18)}
@media(max-width:620px){
  body.owner-mode .owner-head{border-radius:17px}
  body.owner-mode .owner-brand .sub{color:rgba(255,232,178,.78)}
}
</style>`;

desk = replaceOnce(desk, '</head>', `${deskCss}\n</head>`, 'owner head');
fs.writeFileSync(deskPath, desk);
console.log('Applied bot-first South Indian heritage preview styling.');
