const fs = require('node:fs');

function mustReplace(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing marker: ${label}`);
  return text.replace(from, to);
}

const customerPath = 'public/index.html';
const ownerPath = 'public/desk.html';
let customer = fs.readFileSync(customerPath, 'utf8');
let owner = fs.readFileSync(ownerPath, 'utf8');

if (!customer.includes('id="traditionalSouthIndianV1"')) {
  const css = `
<style id="traditionalSouthIndianV1">
/* SOUTH INDIAN HERITAGE V1 — visual only; ordering, chat and session behavior stay unchanged. */
body.customer-mode{
  --heritage-green:#0f5137;
  --heritage-deep:#083c2a;
  --heritage-gold:#d89a28;
  --heritage-saffron:#efb53d;
  --heritage-cream:#fff8e9;
  --heritage-red:#b94536;
}
.customer-mode .app{
  border-color:color-mix(in srgb,var(--heritage-gold) 38%,var(--line));
  box-shadow:0 24px 70px rgba(26,46,34,.16);
}
.customer-mode .top{
  position:relative;z-index:25;
  background:
    radial-gradient(180px 70px at 8% -20%,rgba(239,181,61,.28),transparent 70%),
    linear-gradient(100deg,var(--heritage-deep),var(--heritage-green));
  border-bottom:1px solid rgba(216,154,40,.65);
  box-shadow:0 8px 24px rgba(7,47,32,.20);
}
.customer-mode .top::after{
  content:"";position:absolute;left:0;right:0;bottom:-10px;height:11px;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='18' viewBox='0 0 140 18'%3E%3Cpath d='M0 2h140' stroke='%23d89a28' stroke-width='2'/%3E%3Cg fill='%232d6e42'%3E%3Cellipse cx='15' cy='8' rx='7' ry='11' transform='rotate(24 15 8)'/%3E%3Cellipse cx='38' cy='8' rx='7' ry='11' transform='rotate(-24 38 8)'/%3E%3Cellipse cx='61' cy='8' rx='7' ry='11' transform='rotate(24 61 8)'/%3E%3Cellipse cx='84' cy='8' rx='7' ry='11' transform='rotate(-24 84 8)'/%3E%3Cellipse cx='107' cy='8' rx='7' ry='11' transform='rotate(24 107 8)'/%3E%3Cellipse cx='130' cy='8' rx='7' ry='11' transform='rotate(-24 130 8)'/%3E%3C/g%3E%3C/svg%3E");
  background-size:140px 18px;background-repeat:repeat-x;background-position:center top;
}
.customer-mode .brand-home{color:#fff}
.customer-mode .brand h1{color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.10)}
.customer-mode .brand small{color:#f7dd9e}
.customer-mode .brand small::after{color:#ffd878}
.customer-mode .seal{box-shadow:0 0 0 1px rgba(255,255,255,.22),0 8px 18px rgba(0,0,0,.18)}
.customer-mode .tab{color:rgba(255,255,255,.80)}
.customer-mode .tab:hover{background:rgba(255,255,255,.10);color:#fff}
.customer-mode .theme-toggle{border-color:rgba(255,255,255,.24);background:rgba(255,255,255,.10);color:#fff;box-shadow:none}
.customer-mode .theme-toggle:hover{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.34)}

.customer-mode .customer-home,
.customer-mode .onboard{
  position:relative;
  background:
    radial-gradient(600px 320px at 102% 5%,color-mix(in srgb,var(--heritage-saffron) 10%,transparent),transparent 72%),
    radial-gradient(560px 320px at -8% 42%,color-mix(in srgb,var(--heritage-green) 7%,transparent),transparent 74%),
    var(--page);
}
.customer-mode .customer-home::after,
.customer-mode .onboard::after{
  content:"";position:absolute;inset:0;pointer-events:none;opacity:.28;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%23d89a28' stroke-width='1.5' opacity='.42'%3E%3Cpath d='M18 90c18-32 36-32 54 0-18 32-36 32-54 0Zm36-36c32 18 32 36 0 54-32-18-32-36 0-54Z'/%3E%3Ccircle cx='54' cy='90' r='9'/%3E%3Cpath d='M126 18c18 12 27 24 27 36s-9 24-27 36c-18-12-27-24-27-36s9-24 27-36Z'/%3E%3Cpath d='M126 90c18 12 27 24 27 36s-9 24-27 36c-18-12-27-24-27-36s9-24 27-36Z'/%3E%3C/g%3E%3C/svg%3E");
  background-size:180px 180px;background-position:-35px -20px;
  mask-image:linear-gradient(90deg,#000 0 18%,transparent 38% 62%,#000 82% 100%);
}
.customer-mode .customer-home>* , .customer-mode .onboard>*{position:relative;z-index:1}
.customer-mode .home-hero{
  margin-top:18px;
  border:1px solid rgba(231,185,95,.72);
  background:
    radial-gradient(270px 220px at 85% 18%,rgba(239,181,61,.26),transparent 72%),
    radial-gradient(230px 190px at 8% 100%,rgba(116,157,81,.22),transparent 75%),
    linear-gradient(145deg,#0b4a33 0%,#176a49 62%,#2f744f 100%);
  box-shadow:0 24px 54px rgba(7,55,37,.22),inset 0 0 0 1px rgba(255,255,255,.06);
}
.customer-mode .home-hero::before{
  content:"";position:absolute;left:0;right:0;top:0;height:58px;z-index:1;pointer-events:none;opacity:.98;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='58' viewBox='0 0 220 58'%3E%3Cpath d='M0 3h220' stroke='%23e2ad46' stroke-width='2'/%3E%3Cg fill='%234b7f3a'%3E%3Cpath d='M18 4c16 7 18 26 4 41C8 31 5 14 18 4Z'/%3E%3Cpath d='M56 4c16 7 18 26 4 41C46 31 43 14 56 4Z'/%3E%3Cpath d='M94 4c16 7 18 26 4 41C84 31 81 14 94 4Z'/%3E%3Cpath d='M132 4c16 7 18 26 4 41-14-14-17-31-4-41Z'/%3E%3Cpath d='M170 4c16 7 18 26 4 41-14-14-17-31-4-41Z'/%3E%3Cpath d='M208 4c16 7 18 26 4 41-14-14-17-31-4-41Z'/%3E%3C/g%3E%3Cg fill='%23fff3d0'%3E%3Ccircle cx='38' cy='15' r='3'/%3E%3Ccircle cx='76' cy='15' r='3'/%3E%3Ccircle cx='114' cy='15' r='3'/%3E%3Ccircle cx='152' cy='15' r='3'/%3E%3Ccircle cx='190' cy='15' r='3'/%3E%3C/g%3E%3C/svg%3E");
  background-repeat:repeat-x;background-size:220px 58px;
}
.customer-mode .home-copy{position:relative;z-index:3}
.customer-mode .home-eyebrow{border-color:rgba(255,224,156,.28);background:rgba(255,248,232,.12);color:#fff5d9}
.customer-mode .home-copy h2{color:#fff}
.customer-mode .home-copy>p{color:rgba(255,255,255,.86)}
.customer-mode .home-primary{
  background:linear-gradient(180deg,#f5c454,#e8a92f);color:#332307;
  box-shadow:0 12px 30px rgba(0,0,0,.17),inset 0 1px 0 rgba(255,255,255,.42);
}
.customer-mode .home-secondary{border-color:rgba(255,255,255,.34);background:rgba(255,255,255,.08);color:#fff}
.customer-mode .home-bubble{border:1px solid rgba(216,154,40,.42);box-shadow:0 10px 26px rgba(0,0,0,.13)}
.customer-mode .home-section-head span{color:var(--heritage-gold)}
.customer-mode .home-section-head h3{font-size:27px;color:var(--heritage-deep)}
html[data-theme="dark"] .customer-mode .home-section-head h3{color:var(--ink)}
.customer-mode .home-tile{
  position:relative;overflow:hidden;
  border-color:color-mix(in srgb,var(--heritage-gold) 22%,var(--line));
  background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--heritage-cream) 46%,var(--surface)));
  box-shadow:0 12px 28px rgba(35,61,44,.07);
}
.customer-mode .home-tile::after{
  content:"";position:absolute;width:92px;height:92px;right:-34px;bottom:-38px;border-radius:50%;
  border:1px solid color-mix(in srgb,var(--heritage-gold) 28%,transparent);
  box-shadow:0 0 0 12px color-mix(in srgb,var(--heritage-gold) 6%,transparent),0 0 0 24px color-mix(in srgb,var(--heritage-gold) 4%,transparent);
}
.customer-mode .home-promise{
  border-top:1px solid color-mix(in srgb,var(--heritage-gold) 42%,var(--line));
  border-bottom:1px solid color-mix(in srgb,var(--heritage-gold) 28%,var(--line));
  background:color-mix(in srgb,var(--heritage-cream) 66%,var(--surface));
}
.customer-mode .promise-icon{color:var(--heritage-green)}
.customer-mode .heritage-signoff{
  display:grid;place-items:center;text-align:center;gap:4px;margin:18px 0 4px;padding:24px 18px 22px;
  border-radius:22px;color:#fff6dc;overflow:hidden;position:relative;
  background:
    radial-gradient(210px 120px at 0% 100%,rgba(239,181,61,.16),transparent 72%),
    radial-gradient(210px 120px at 100% 0%,rgba(239,181,61,.12),transparent 72%),
    linear-gradient(135deg,#0b432f,#0f5a3d);
  border:1px solid rgba(216,154,40,.54);
  box-shadow:0 18px 38px rgba(8,58,39,.18);
}
.customer-mode .heritage-signoff::before,.customer-mode .heritage-signoff::after{
  content:"";position:absolute;width:82px;height:82px;border:1px solid rgba(228,174,65,.52);transform:rotate(45deg);
}
.customer-mode .heritage-signoff::before{left:-48px;bottom:-45px}.customer-mode .heritage-signoff::after{right:-48px;top:-45px}
.customer-mode .heritage-signoff b{font:700 23px/1.2 var(--f-display);color:#f0bd55;letter-spacing:.02em}
.customer-mode .heritage-signoff span{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,248,226,.82)}
.customer-mode .heritage-signoff small{font-size:12px;color:rgba(255,255,255,.68)}

.customer-mode .onboard .hero{
  border:1px solid rgba(216,154,40,.58);
  background:
    radial-gradient(220px 180px at 88% 12%,rgba(239,181,61,.25),transparent 72%),
    linear-gradient(145deg,#0c4a34,#176b4b);
  box-shadow:0 20px 46px rgba(7,55,37,.18);
}
.customer-mode .onboard .steps li{border-color:color-mix(in srgb,var(--heritage-gold) 22%,var(--line));background:color-mix(in srgb,var(--heritage-cream) 52%,var(--surface))}
.customer-mode .onboard .card{border-color:color-mix(in srgb,var(--heritage-gold) 30%,var(--line));box-shadow:0 16px 34px rgba(35,61,44,.08)}
.customer-mode .assistant-trust{border-color:color-mix(in srgb,var(--heritage-green) 30%,var(--line));background:color-mix(in srgb,var(--brand-soft) 45%,var(--surface))}

@media(min-width:700px){
  .customer-mode .app{max-width:1080px}
  .customer-mode .top{padding-inline:24px}
  .customer-mode .brand-home{min-width:250px}
  .customer-mode .customer-home{padding:26px 28px 32px}
  .customer-mode .home-hero{min-height:480px;padding:68px 54px 38px}
  .customer-mode .home-copy{max-width:56%}
  .customer-mode .home-copy h2{font-size:48px}
  .customer-mode .home-copy>p{font-size:18px;line-height:1.55}
  .customer-mode .home-annuwrap{right:4%;width:38%;min-height:330px}
  .customer-mode .home-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .customer-mode .home-tile{min-height:160px;grid-template-columns:1fr;align-content:start;text-align:left}
  .customer-mode .tile-icon{width:50px;height:50px}
  .customer-mode .home-promise{grid-template-columns:repeat(3,1fr);padding:18px 22px;border-radius:20px}
  .customer-mode .heritage-signoff{min-height:132px}
}
@media(max-width:699px){
  .customer-mode .customer-home{padding-top:20px}
  .customer-mode .home-hero{margin-top:9px;padding-top:62px}
  .customer-mode .home-copy h2{font-size:36px}
  .customer-mode .home-section-head h3{font-size:23px}
  .customer-mode .heritage-signoff{margin-top:14px}
}
@media(max-width:420px){
  .customer-mode .top::after{bottom:-8px;height:9px;background-size:112px 15px}
  .customer-mode .home-hero::before{height:48px;background-size:182px 48px}
  .customer-mode .home-hero{padding-top:55px}
  .customer-mode .heritage-signoff{padding:20px 14px}
  .customer-mode .heritage-signoff b{font-size:20px}
}
</style>`;
  customer = mustReplace(customer, '</head>', `${css}\n</head>`, 'customer head');
}

if (!customer.includes('class="heritage-signoff"')) {
  const marker = `    </section>\n  </main>\n\n  <main class="onboard"`;
  const replacement = `    </section>\n\n    <section class="heritage-signoff" aria-label="Annapurna tradition">\n      <b>ఇంటి రుచి · Inti Ruchi</b>\n      <span>Mana Sampradayam</span>\n      <small>Homestyle South Indian food · made with care</small>\n    </section>\n  </main>\n\n  <main class="onboard"`;
  customer = mustReplace(customer, marker, replacement, 'customer heritage signoff');
}

if (!owner.includes('id="ownerTraditionalSouthIndianV1"')) {
  const css = `
<style id="ownerTraditionalSouthIndianV1">
/* OWNER HERITAGE V1 — presentation only. Existing owner actions and filters are untouched. */
body.owner-mode{
  --heritage-green:#0f5137;--heritage-deep:#083c2a;--heritage-gold:#d89a28;--heritage-cream:#fff8e9;
  background:
    radial-gradient(520px 300px at 100% 0%,rgba(216,154,40,.10),transparent 72%),
    radial-gradient(520px 300px at 0% 70%,rgba(15,81,55,.07),transparent 75%),
    var(--bg);
}
body.owner-mode::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;opacity:.18;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'%3E%3Cg fill='none' stroke='%23d89a28' stroke-width='1.5'%3E%3Cpath d='M20 110c22-38 44-38 66 0-22 38-44 38-66 0Zm44-44c38 22 38 44 0 66-38-22-38-44 0-66Z'/%3E%3Ccircle cx='64' cy='110' r='10'/%3E%3Cpath d='M160 28c24 18 36 36 36 54s-12 36-36 54c-24-18-36-36-36-54s12-36 36-54Z'/%3E%3C/g%3E%3C/svg%3E");
  background-size:220px 220px;background-position:right 26px bottom 30px;
}
body.owner-mode .owner-head{
  position:relative;overflow:hidden;
  background:
    radial-gradient(250px 120px at 94% -10%,rgba(239,181,61,.25),transparent 72%),
    linear-gradient(135deg,var(--heritage-deep),var(--heritage-green));
  border:1px solid rgba(216,154,40,.55);
  box-shadow:0 18px 44px rgba(7,55,37,.20);
}
body.owner-mode .owner-head::after{
  content:"";position:absolute;left:0;right:0;bottom:0;height:7px;pointer-events:none;
  background:linear-gradient(90deg,transparent,var(--heritage-gold) 15% 85%,transparent);
  opacity:.75;
}
body.owner-mode .owner-brand h1{font-family:var(--f-display);letter-spacing:.01em}
body.owner-mode .owner-pill{color:#ffe1a0;border-color:rgba(255,224,156,.26)}
body.owner-mode .card,body.owner-mode .ticket,body.owner-mode .order-lane,body.owner-mode .owner-kpi,body.owner-mode .chatgrid{
  border-color:color-mix(in srgb,var(--heritage-gold) 18%,var(--line));
}
body.owner-mode .order-lane{box-shadow:0 10px 26px rgba(30,45,35,.05)}
body.owner-mode .owner-filters{border-color:color-mix(in srgb,var(--heritage-gold) 18%,var(--line));background:color-mix(in srgb,var(--heritage-cream) 48%,var(--panel))}
body.owner-mode .empty{border-color:color-mix(in srgb,var(--heritage-green) 22%,var(--line2));background:color-mix(in srgb,var(--heritage-cream) 34%,transparent)}

@media(min-width:900px){
  body.owner-mode{
    max-width:1480px;
    display:grid;
    grid-template-columns:230px minmax(0,1fr);
    grid-template-rows:auto auto 1fr;
    column-gap:18px;
    align-items:start;
    padding:16px 18px 44px;
  }
  body.owner-mode .owner-head{grid-column:1/-1;grid-row:1;margin-bottom:18px}
  body.owner-mode #err{grid-column:2;grid-row:2}
  body.owner-mode #tabs{
    grid-column:1;grid-row:2 / span 2;
    position:sticky;top:16px;z-index:18;
    display:flex;flex-direction:column;align-items:stretch;gap:6px;
    width:100%;max-width:none;margin:0;padding:16px 12px 96px;
    border:1px solid color-mix(in srgb,var(--heritage-gold) 22%,var(--line));
    border-radius:22px;
    background:
      radial-gradient(160px 140px at 50% 100%,rgba(216,154,40,.12),transparent 74%),
      color-mix(in srgb,var(--heritage-cream) 74%,var(--panel));
    box-shadow:0 14px 34px rgba(30,45,35,.08);
  }
  body.owner-mode #tabs::after{
    content:"Inti Ruchi · Mana Sampradayam";
    position:absolute;left:14px;right:14px;bottom:20px;
    padding-top:14px;border-top:1px solid color-mix(in srgb,var(--heritage-gold) 38%,var(--line));
    text-align:center;color:var(--heritage-green);font:700 12px/1.25 var(--f-display);letter-spacing:.04em;
  }
  body.owner-mode #tabs button{
    flex:none;width:100%;min-height:46px;text-align:left;justify-content:flex-start;
    border-radius:13px;padding:10px 12px;
  }
  body.owner-mode #tabs button[aria-selected=true]{
    background:linear-gradient(135deg,var(--heritage-deep),var(--heritage-green));
    color:#fff;box-shadow:0 7px 18px rgba(15,81,55,.20);
  }
  body.owner-mode #panel{grid-column:2;grid-row:3;min-width:0}
  body.owner-mode .owner-page-title{margin-top:0}
  body.owner-mode .owner-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
  body.owner-mode .order-lanes{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:899px){
  body.owner-mode{display:block}
}
@media(max-width:620px){
  body.owner-mode::before{opacity:.10}
  body.owner-mode .owner-head{border-radius:18px}
}
</style>`;
  owner = mustReplace(owner, '</head>', `${css}\n</head>`, 'owner head');
}

fs.writeFileSync(customerPath, customer);
fs.writeFileSync(ownerPath, owner);
console.log('Applied South Indian heritage visual refresh to customer and owner surfaces.');
