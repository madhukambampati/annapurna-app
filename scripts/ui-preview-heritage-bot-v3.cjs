const fs = require('fs');

function replaceStyle(html, id, css) {
  const re = new RegExp(`<style id=["']${id}["']>[\\s\\S]*?<\\/style>\\s*`, 'g');
  html = html.replace(re, '');
  if (!html.includes('</head>')) throw new Error(`Missing </head> for ${id}`);
  return html.replace('</head>', `<style id="${id}">\n${css}\n</style>\n</head>`);
}

let index = fs.readFileSync('public/index.html', 'utf8');
index = index.replace(/<style id=["']heritageBotPreviewV2["']>[\s\S]*?<\/style>\s*/g, '');

const customerCss = String.raw`
/* PREVIEW V3 — structural South Indian bot-first redesign. Visual only. */
html,body{width:100%;max-width:100%;overflow-x:hidden!important;overscroll-behavior-x:none}
body.customer-mode{min-width:0;background:#efe6d4}
body.customer-mode .app{width:100%;max-width:1120px;min-width:0;overflow-x:hidden!important;background:var(--page)}
body.customer-mode .top,body.customer-mode .customer-home,body.customer-mode .chat,body.customer-mode .sheet,body.customer-mode .onboard{min-width:0;max-width:100%;overflow-x:hidden}
body.customer-mode .home-hero,body.customer-mode .home-grid,body.customer-mode .home-tile,body.customer-mode .home-copy,body.customer-mode .home-annuwrap{min-width:0;max-width:100%}

/* Header: cream heritage wordmark treatment, bot navigation stays intact. */
body.customer-mode .top{
  position:relative;z-index:30;min-height:82px;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 18px 10px;
  background:linear-gradient(180deg,#fffdf8,#f8f1e2);border-bottom:0;box-shadow:0 7px 24px rgba(46,58,43,.08)
}
body.customer-mode .top::before{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,#0f5b40 0 60%,#dda83a 60% 88%,#b94332 88%);opacity:.95}
body.customer-mode .brand-home{gap:11px;padding:5px 8px 5px 4px}
body.customer-mode .seal{width:54px;height:54px;border-radius:50%;padding:4px;background:#0d5a3f;box-shadow:0 0 0 2px #dba43a,0 7px 18px rgba(12,73,50,.16)}
body.customer-mode .brand h1{font:800 26px/1 var(--f-display);color:#0d4d37;letter-spacing:-.02em}
body.customer-mode .brand small{margin-top:3px;color:#9a6a16;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
body.customer-mode .tab{color:#59645e}
body.customer-mode .tab[aria-current=true]{background:#edf4ed;color:#0f5b40}
body.customer-mode .tab[aria-current=true]::after{height:3px;background:#0f5b40}
body.customer-mode .theme-toggle{border-color:#d8bd7d;background:#fff7e5;color:#805c15}

/* Home canvas: traditional cream paper, subtle kolam, no horizontal drift. */
body.customer-mode .customer-home{
  padding:14px 18px calc(26px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 18px 18px,rgba(198,148,43,.06) 1.2px,transparent 1.4px) 0 0/36px 36px,
    linear-gradient(180deg,#f7efde 0%,#fffaf0 45%,#f4ead6 100%);
}
body.customer-mode .home-hero{
  position:relative;display:grid!important;grid-template-columns:1fr!important;
  grid-template-areas:"eyebrow" "title" "intro" "mascot" "actions";
  justify-items:center;align-items:start;min-height:640px;padding:86px 42px 34px!important;overflow:hidden;
  color:#133a2a;background:
    radial-gradient(430px 230px at 50% 34%,rgba(255,255,255,.96),rgba(255,255,255,.68) 62%,transparent 75%),
    linear-gradient(180deg,#fffaf0 0%,#f9f0dc 100%)!important;
  border:2px solid #d9aa45!important;border-radius:34px!important;
  box-shadow:0 22px 52px rgba(90,69,28,.16),inset 0 0 0 7px rgba(255,255,255,.54)!important;
}
body.customer-mode .home-hero::before{
  content:""!important;position:absolute!important;inset:0 0 auto!important;height:78px!important;opacity:1!important;mask-image:none!important;
  background:
    radial-gradient(ellipse at 17px -4px,#1b6e46 0 17px,transparent 18px) 0 1px/44px 58px repeat-x,
    radial-gradient(circle,#f2c55c 0 3px,transparent 4px) 22px 39px/44px 44px repeat-x,
    linear-gradient(180deg,#0e5b40 0 12px,transparent 12px)!important;
  pointer-events:none;z-index:3
}
body.customer-mode .home-hero::after{
  content:"";position:absolute;left:7%;right:7%;top:88px;height:250px;border:2px solid rgba(218,169,67,.36);border-bottom:0;
  border-radius:48% 48% 12px 12px/34% 34% 12px 12px;pointer-events:none;z-index:0;
  box-shadow:inset 0 0 0 7px rgba(255,255,255,.25)
}
body.customer-mode .home-copy{display:contents!important}
body.customer-mode .home-eyebrow{grid-area:eyebrow;position:relative;z-index:4;margin:0;padding:0;background:transparent;border:0;color:#a56f14;font-size:12px;font-weight:900;letter-spacing:.28em}
body.customer-mode .home-eyebrow::before{content:"NAMASTE!";font-size:14px}
body.customer-mode .home-eyebrow{font-size:0}
body.customer-mode .home-copy h2{grid-area:title;position:relative;z-index:4;max-width:760px;margin:20px auto 10px!important;text-align:center;color:#0b4c35;font:800 clamp(42px,6.6vw,68px)/.98 var(--f-display)!important;letter-spacing:-.04em}
body.customer-mode .home-copy>p{grid-area:intro;position:relative;z-index:4;max-width:620px;margin:0 auto!important;text-align:center;color:#5f655f!important;font-size:17px!important;line-height:1.5}
body.customer-mode .home-annuwrap{grid-area:mascot;position:relative!important;right:auto!important;top:auto!important;z-index:5;min-height:230px!important;width:100%;margin:14px 0 2px!important;opacity:1!important;pointer-events:none}
body.customer-mode .home-motion-stage{width:260px;height:220px}
body.customer-mode .home-motion-stage #homeMascot{width:215px;height:210px}
body.customer-mode .home-motion-stage #homeMascot .mascot{width:182px!important;max-height:205px;filter:drop-shadow(0 18px 17px rgba(71,61,40,.18))}
body.customer-mode .home-glow{width:220px;height:190px;background:radial-gradient(circle,rgba(245,196,89,.34),rgba(255,255,255,.32) 50%,transparent 72%)}
body.customer-mode .home-bubble{display:block!important;margin-top:-12px!important;padding:10px 15px;border:1px solid #d5c59e;border-radius:18px 18px 18px 5px;background:#edf6e9;color:#194d35;font:800 13px/1.2 var(--f-body);box-shadow:0 10px 24px rgba(55,68,54,.10)}
body.customer-mode .home-hero-actions{grid-area:actions;position:relative;z-index:5;width:min(100%,760px);margin:4px auto 0!important;display:grid!important;grid-template-columns:1fr 1fr;gap:12px!important}
body.customer-mode .home-primary,body.customer-mode .home-secondary{width:100%;min-width:0!important;min-height:64px!important;border-radius:999px!important;font-size:17px!important}
body.customer-mode .home-primary{background:linear-gradient(180deg,#146b49,#0c563b)!important;color:#fff!important;box-shadow:0 12px 26px rgba(15,91,64,.22)!important}
body.customer-mode .home-primary small{color:rgba(255,255,255,.78)}
body.customer-mode .home-secondary{justify-content:center;background:#fffdf8!important;color:#104d36!important;border:1.5px solid #d7bd82!important;box-shadow:0 8px 18px rgba(74,65,42,.08)}

/* Quick paths look like premium conversational shortcuts, not dashboard cards. */
body.customer-mode .home-section{margin-top:18px}
body.customer-mode .home-section-head{align-items:center;margin:0 4px 10px}
body.customer-mode .home-section-head>div>span{font-size:0!important;color:#9e6d18!important}
body.customer-mode .home-section-head>div>span::before{content:"✦  QUICK PATHS"!important;font-size:10px!important;letter-spacing:.20em}
body.customer-mode .home-section-head h3{margin-top:5px!important;color:#164a35;font-size:25px!important}
body.customer-mode .home-section-head>small{color:#6a706c}
body.customer-mode .home-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
body.customer-mode .home-tile{min-height:104px!important;grid-template-columns:44px 1fr 20px!important;gap:10px!important;padding:14px!important;border:1px solid #dfc58d!important;border-radius:22px!important;background:rgba(255,253,248,.92)!important;box-shadow:0 8px 20px rgba(72,63,39,.06)!important}
body.customer-mode .home-tile::before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:4px;border-radius:0 4px 4px 0;background:linear-gradient(#d89a25,#0f6544)}
body.customer-mode .home-tile::after{opacity:.55}
body.customer-mode .tile-icon{width:44px;height:44px;border-radius:14px;background:#edf3e9!important;color:#0d5a3e!important}
body.customer-mode .tile-copy b{font-size:17px!important;color:#15392a}
body.customer-mode .tile-copy small{font-size:11.5px!important;color:#687169}
body.customer-mode .tile-arrow{color:#a06d16!important}
body.customer-mode .heritage-signoff{margin:18px 0 6px!important;border:1px solid #e2c68a!important;border-radius:999px!important;background:rgba(255,252,244,.82)!important;color:#0e5b40!important;box-shadow:none!important}
body.customer-mode .home-promise{margin-top:16px!important}
body.customer-mode .home-promise>div{background:rgba(255,253,248,.78)!important;border-color:#e3d2aa!important}

/* Chat screen: make Vindhu itself feel like the primary destination. */
body.customer-mode .chat{position:relative;background:
  radial-gradient(circle at 18px 18px,rgba(207,161,59,.045) 1.1px,transparent 1.3px) 0 0/36px 36px,
  linear-gradient(180deg,#f8efdd,#fffaf0 42%,#f5ead7)!important}
body.customer-mode .chat::before{padding:12px 18px 7px!important;color:#8d681f!important;font-size:10px!important;letter-spacing:.22em!important;background:linear-gradient(90deg,transparent,#d4b167 22%,#d4b167 78%,transparent) bottom/100% 1px no-repeat}
body.customer-mode .hello{position:relative;width:min(100%,560px)!important;max-width:560px!important;padding:34px 24px 30px!important;border:1.5px solid #e2c98f!important;border-radius:32px 32px 22px 22px!important;background:
  radial-gradient(220px 120px at 50% 4%,rgba(241,184,61,.12),transparent 70%),#fffaf0!important;box-shadow:0 18px 40px rgba(80,65,30,.09)!important}
body.customer-mode .hello::before{content:"";position:absolute;left:9%;right:9%;top:18px;height:88px;border:1px solid rgba(217,170,69,.25);border-bottom:0;border-radius:50% 50% 0 0/100% 100% 0 0;pointer-events:none}
body.customer-mode .hello .mascot{width:148px!important;filter:drop-shadow(0 14px 13px rgba(59,63,51,.14))}
body.customer-mode .hello b{margin-top:8px;color:#0c5138;font-size:31px!important}
body.customer-mode .hello p{color:#646a65;font-size:15px;line-height:1.5}
body.customer-mode .chips{gap:8px!important;padding:10px 16px 7px!important}
body.customer-mode .chips button{min-height:42px!important;padding:8px 14px!important;border:1px solid #d9c397!important;border-radius:999px!important;background:#fffdf8!important;color:#194c36!important;box-shadow:0 5px 14px rgba(66,59,42,.05)!important}
body.customer-mode .composer{padding:9px 12px max(10px,env(safe-area-inset-bottom))!important;background:rgba(255,252,245,.94)!important;border-top:1px solid #dfc995!important;box-shadow:0 -10px 30px rgba(75,62,35,.07)}
body.customer-mode .composer textarea{border-color:#ccb98c!important;border-radius:999px!important;background:#fff!important}
body.customer-mode .send{width:48px!important;height:48px!important;background:#0d6243!important;box-shadow:0 8px 18px rgba(13,98,67,.22)!important}

/* Initial session screen also belongs to the same brand family. */
body.customer-mode .onboard{background:
  radial-gradient(circle at 18px 18px,rgba(198,148,43,.05) 1.1px,transparent 1.3px) 0 0/36px 36px,
  linear-gradient(180deg,#f7efde,#fffaf0)!important}
body.customer-mode .onboard .hero{padding:44px 24px 30px!important;border:1.5px solid #d8a845!important;border-radius:30px!important;background:
  radial-gradient(280px 180px at 90% 0,rgba(238,181,58,.24),transparent 72%),
  linear-gradient(145deg,#0b533a,#176d4d)!important;box-shadow:0 18px 42px rgba(14,76,52,.18)!important}
body.customer-mode .onboard .card{border-color:#dfc58d!important;border-radius:24px!important;background:rgba(255,253,248,.94)!important;box-shadow:0 14px 34px rgba(73,62,37,.07)}
body.customer-mode .steps li{border-color:#dfc58d!important;background:#fffaf0!important}

/* Dark mode keeps the same hierarchy, with deep temple green instead of a plain inverted theme. */
html[data-theme="dark"] body.customer-mode{background:#08130d}
html[data-theme="dark"] body.customer-mode .top{background:linear-gradient(180deg,#14271d,#102017)}
html[data-theme="dark"] body.customer-mode .brand h1,html[data-theme="dark"] body.customer-mode .tile-copy b{color:#edf4e9}
html[data-theme="dark"] body.customer-mode .brand small{color:#e0b85c}
html[data-theme="dark"] body.customer-mode .customer-home,html[data-theme="dark"] body.customer-mode .chat,html[data-theme="dark"] body.customer-mode .onboard{background:linear-gradient(180deg,#101a13,#0d1710)!important}
html[data-theme="dark"] body.customer-mode .home-hero{color:#eef4ec;background:radial-gradient(430px 230px at 50% 34%,rgba(49,76,59,.45),transparent 72%),linear-gradient(180deg,#17271d,#122118)!important;border-color:#8f6d2e!important}
html[data-theme="dark"] body.customer-mode .home-copy h2,html[data-theme="dark"] body.customer-mode .hello b{color:#e9f2e8}
html[data-theme="dark"] body.customer-mode .home-copy>p,html[data-theme="dark"] body.customer-mode .hello p{color:#aebcb1!important}
html[data-theme="dark"] body.customer-mode .home-secondary,html[data-theme="dark"] body.customer-mode .home-tile,html[data-theme="dark"] body.customer-mode .hello,html[data-theme="dark"] body.customer-mode .chips button,html[data-theme="dark"] body.customer-mode .composer{background:#17231b!important;color:#eaf1e6!important;border-color:#6e5930!important}
html[data-theme="dark"] body.customer-mode .tile-icon{background:#1d3427!important;color:#6acb9c!important}

/* Mobile: reference-like single-column composition, zero side-pan. */
@media(max-width:720px){
  body.customer-mode .app{max-width:100vw!important}
  body.customer-mode .top{min-height:72px;padding:calc(8px + env(safe-area-inset-top)) 8px 8px;gap:4px}
  body.customer-mode .brand-home{gap:6px;padding-left:2px}
  body.customer-mode .seal{width:44px;height:44px}
  body.customer-mode .brand h1{font-size:18px}
  body.customer-mode .brand small{display:none}
  body.customer-mode .tabs{gap:0;min-width:0}
  body.customer-mode .tab{min-width:43px;padding:5px 3px 4px;font-size:10px}
  body.customer-mode .tab .ic{width:18px;height:18px}
  body.customer-mode .theme-toggle{width:38px;height:38px;flex:none}
  body.customer-mode .customer-home{padding:8px 8px calc(18px + env(safe-area-inset-bottom))}
  body.customer-mode .home-hero{min-height:660px!important;padding:78px 18px 22px!important;border-radius:26px!important}
  body.customer-mode .home-hero::after{left:5%;right:5%;top:84px;height:250px}
  body.customer-mode .home-copy h2{font-size:clamp(39px,11.5vw,54px)!important;max-width:390px}
  body.customer-mode .home-copy>p{font-size:14.5px!important;max-width:355px}
  body.customer-mode .home-annuwrap{min-height:220px!important;margin-top:8px!important}
  body.customer-mode .home-motion-stage{width:230px;height:205px}
  body.customer-mode .home-motion-stage #homeMascot{width:195px;height:195px}
  body.customer-mode .home-motion-stage #homeMascot .mascot{width:166px!important;max-height:188px}
  body.customer-mode .home-hero-actions{grid-template-columns:1fr!important;gap:10px!important;max-width:420px}
  body.customer-mode .home-primary,body.customer-mode .home-secondary{min-height:58px!important}
  body.customer-mode .home-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
  body.customer-mode .home-tile{min-height:96px!important;grid-template-columns:40px minmax(0,1fr) 18px!important;padding:12px 10px!important;border-radius:19px!important}
  body.customer-mode .tile-icon{width:40px;height:40px}
  body.customer-mode .tile-copy b{font-size:15px!important}
  body.customer-mode .tile-copy small{font-size:10.5px!important}
  body.customer-mode .home-promise{display:none!important}
  body.customer-mode .heritage-signoff{font-size:11px!important;padding:10px 12px!important}
  body.customer-mode .hello{width:calc(100% - 8px)!important;padding:28px 18px 24px!important}
  body.customer-mode .hello .mascot{width:128px!important}
  body.customer-mode .hello b{font-size:26px!important}
}
@media(max-width:390px){
  body.customer-mode .top{padding-left:6px;padding-right:6px}
  body.customer-mode .seal{width:40px;height:40px}
  body.customer-mode .brand h1{font-size:16.5px}
  body.customer-mode .tab{min-width:40px;font-size:9.5px}
  body.customer-mode .theme-toggle{width:35px;height:35px}
  body.customer-mode .home-hero{padding-left:12px!important;padding-right:12px!important}
  body.customer-mode .home-grid{grid-template-columns:1fr!important}
  body.customer-mode .home-tile{min-height:76px!important}
}
`;
index = replaceStyle(index, 'customerHeritageBotV3', customerCss);
fs.writeFileSync('public/index.html', index);

let desk = fs.readFileSync('public/desk.html', 'utf8');
desk = desk.replace(/<style id=["']ownerHeritagePreviewV2["']>[\s\S]*?<\/style>\s*/g, '');
const ownerCss = String.raw`
/* PREVIEW V3 — actual heritage owner console layout. Visual only. */
html,body{width:100%;max-width:100%;overflow-x:hidden!important;overscroll-behavior-x:none}
body.owner-mode{min-width:0;max-width:1360px!important;background:
  radial-gradient(circle at 18px 18px,rgba(205,158,50,.05) 1.1px,transparent 1.3px) 0 0/36px 36px,
  linear-gradient(180deg,#efe7d6,#f8f2e8)!important}
body.owner-mode .owner-head{position:relative;overflow:hidden;min-height:84px;margin:0 0 14px!important;padding:14px 20px!important;border:1px solid #b98b32!important;border-radius:22px!important;background:linear-gradient(135deg,#083b2a,#0d563c 58%,#176848)!important;box-shadow:0 16px 40px rgba(10,61,42,.18)!important}
body.owner-mode .owner-head::before{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,#d9a43b 0 72%,#b94332 72% 82%,#d9a43b 82%)}
body.owner-mode .owner-brand img{width:54px!important;height:54px!important;border-radius:50%!important;padding:4px;background:#fff2c8!important;box-shadow:0 0 0 2px #d6a23c,0 8px 20px rgba(0,0,0,.18)!important}
body.owner-mode .owner-brand h1{font:800 27px/1 var(--f-display)!important;color:#fff7e1!important}
body.owner-mode .owner-brand .sub{margin-top:4px!important;color:#f0cf7d!important;font-size:11px!important;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
body.owner-mode .owner-pill{background:#e3b34f!important;color:#163525!important;border:0!important;font-weight:900}
body.owner-mode #panel{min-width:0;max-width:100%;overflow-x:hidden}
body.owner-mode .owner-page-title h2{font:800 29px/1.05 var(--f-display)!important;color:#153d2c!important}
body.owner-mode .owner-page-title .sub{color:#6a6f69!important}
body.owner-mode .owner-filters{border:1px solid #dec894!important;border-radius:16px!important;background:rgba(255,253,248,.88)!important;box-shadow:0 8px 20px rgba(78,67,42,.05)!important}
body.owner-mode .order-lane{border:1px solid #e0cc9f!important;border-radius:20px!important;background:rgba(255,253,248,.9)!important;box-shadow:0 10px 24px rgba(78,67,42,.05)!important}
body.owner-mode .ticket{border-color:#dfc99a!important;background:#fffdf8!important}
body.owner-mode .card,body.owner-mode .kitchen-day,body.owner-mode .buy-card,body.owner-mode .chatgrid{border-color:#dfc99a!important;background:#fffdf8!important}
body.owner-mode .need{border-color:#d36a58!important;background:#fff2ec!important}

@media(min-width:900px){
  body.owner-mode{display:grid!important;grid-template-columns:230px minmax(0,1fr)!important;grid-template-rows:auto minmax(0,1fr)!important;column-gap:18px!important;padding:12px 16px 34px!important}
  body.owner-mode .owner-head{grid-column:1/-1!important;width:100%!important}
  body.owner-mode>#err{grid-column:1/-1!important}
  body.owner-mode>#tabs{grid-column:1!important;grid-row:2!important;position:sticky!important;top:14px!important;width:100%!important;margin:0!important;padding:12px!important;display:flex!important;flex-direction:column!important;gap:7px!important;border:1px solid #ddc58e!important;border-radius:20px!important;background:linear-gradient(180deg,#fffaf0,#f5ead3)!important;box-shadow:0 14px 34px rgba(72,62,40,.08)!important;backdrop-filter:none!important}
  body.owner-mode>#tabs::before{content:"ANNAPURNA";display:block;padding:4px 8px 10px;color:#0d5a3f;font:900 12px/1 var(--f-display);letter-spacing:.14em;border-bottom:1px solid #e6d5ae}
  body.owner-mode>#tabs::after{content:"ఇంటి రుచి  •  Inti Ruchi\A Mana Sampradayam";white-space:pre;display:block;margin-top:8px;padding:14px 8px 5px;border-top:1px solid #e4d0a3;color:#86631e;font:700 11px/1.5 var(--f-display);text-align:center}
  body.owner-mode>#tabs button{flex:none!important;width:100%!important;min-height:48px!important;justify-content:flex-start!important;text-align:left!important;padding:10px 12px!important;border-radius:13px!important;color:#3f4a43!important}
  body.owner-mode>#tabs button[aria-selected=true]{background:linear-gradient(135deg,#0d5a3f,#176848)!important;color:#fff!important;border-color:#0d5a3f!important;box-shadow:0 8px 18px rgba(13,90,63,.18)!important}
  body.owner-mode>#panel{grid-column:2!important;grid-row:2!important;padding:0 2px 0 0!important}
  body.owner-mode .owner-kpis{grid-template-columns:repeat(4,minmax(0,1fr))!important}
}
html[data-theme="dark"] body.owner-mode{background:linear-gradient(180deg,#0b120d,#101a13)!important}
html[data-theme="dark"] body.owner-mode>#tabs,html[data-theme="dark"] body.owner-mode .order-lane,html[data-theme="dark"] body.owner-mode .owner-filters,html[data-theme="dark"] body.owner-mode .ticket,html[data-theme="dark"] body.owner-mode .card,html[data-theme="dark"] body.owner-mode .chatgrid{background:#17231b!important;border-color:#5a4b2c!important}
html[data-theme="dark"] body.owner-mode .owner-page-title h2{color:#edf4e9!important}
@media(max-width:899px){body.owner-mode{max-width:100vw!important;padding-left:10px!important;padding-right:10px!important}body.owner-mode .owner-head{border-radius:18px!important}}
`;
desk = replaceStyle(desk, 'ownerHeritageBotV3', ownerCss);
fs.writeFileSync('public/desk.html', desk);
console.log('Applied structural heritage bot redesign V3.');
