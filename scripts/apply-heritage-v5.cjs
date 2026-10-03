const fs = require('fs');
const path = 'public/index.html';
let s = fs.readFileSync(path, 'utf8');
if (s.includes('id="heritageVisualV5"')) process.exit(0);
const css = String.raw`
<style id="heritageVisualV5">
/* V5 — colorful Telugu-home visual system. Presentation only; ordering/session behavior is unchanged. */
body.customer-mode{--v5-green:#0b563b;--v5-green2:#14704c;--v5-gold:#d9a43c;--v5-cream:#fff9ec;--v5-red:#b63b2d;--v5-ink:#173d2e;--v5-line:#dfc48a}
html,body{overflow-x:hidden!important;overscroll-behavior-x:none!important}
body.customer-mode{background:#eee4cf!important}
body.customer-mode .app{overflow-x:hidden!important}

/* Premium cream header; on phones the nav gets its own row so the brand never clips. */
body.customer-mode .top{background:linear-gradient(180deg,#fffdf8,#fff8e9)!important;color:var(--v5-ink)!important;border-bottom:1px solid #d9b86d!important;box-shadow:0 5px 22px rgba(69,52,23,.08)!important}
body.customer-mode .brand h1{color:#0d4f38!important;text-shadow:none!important;font-family:var(--f-display)!important}
body.customer-mode .brand small{color:#a8751e!important;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
body.customer-mode .brand-home{color:var(--v5-ink)!important}
body.customer-mode .seal{box-shadow:0 0 0 2px #d9a43c,0 7px 18px rgba(56,42,14,.13)!important;border-radius:50%!important}
body.customer-mode .tab{color:#536159!important}
body.customer-mode .tab[aria-current=true],body.customer-mode .tab.active,body.customer-mode .tab[aria-selected=true]{background:#eaf1e8!important;color:#0b563b!important}
body.customer-mode .tab[aria-current=true]::after{background:#0b563b!important}
body.customer-mode .theme-toggle{background:#fff9e9!important;color:#a16f16!important;border-color:#d8b45d!important}

/* Let the approved landing composition breathe on desktop without widening the actual chat thread. */
@media(min-width:760px){
 body.customer-mode:has(#home:not([hidden])) .app,body.customer-mode:has(#onboard:not([hidden])) .app{max-width:1180px!important}
 body.customer-mode:has(#home:not([hidden])) .top,body.customer-mode:has(#onboard:not([hidden])) .top{padding-inline:24px!important}
}

/* HOME — cream heritage copy on the left, colorful Telugu-home artwork on the right. */
body.customer-mode .customer-home{background:radial-gradient(circle at 18px 18px,rgba(206,151,42,.07) 1.2px,transparent 1.4px) 0 0/36px 36px,linear-gradient(180deg,#fffaf0,#f7ecd7 70%,#fff9ec)!important}
body.customer-mode .home-hero{color:var(--v5-ink)!important;background:linear-gradient(180deg,#fffdf8,#fff6e4)!important;border:1.5px solid #d7aa4e!important;box-shadow:0 19px 46px rgba(80,57,19,.12)!important;isolation:isolate!important}
body.customer-mode .home-hero::before{content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:46px!important;z-index:7!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% -4%,#236b43 0 52%,transparent 55%) 0 0/46px 36px repeat-x!important;opacity:1!important}
body.customer-mode .home-hero::after{content:""!important;position:absolute!important;inset:15px!important;z-index:0!important;pointer-events:none!important;border:1px solid rgba(207,157,58,.28)!important;border-radius:25px!important}
body.customer-mode .home-copy{z-index:4!important}
body.customer-mode .home-eyebrow{color:#a46c0d!important;background:transparent!important;border:0!important;padding:0!important;letter-spacing:.17em!important}
body.customer-mode .home-copy h2{color:#0c4c35!important;text-shadow:none!important}
body.customer-mode .home-copy>p{color:#56625a!important}
body.customer-mode .home-primary{background:linear-gradient(180deg,#126846,#0a5137)!important;color:#fff!important;border:1px solid #08452f!important;box-shadow:0 10px 24px rgba(11,86,59,.20)!important}
body.customer-mode .home-secondary{background:#fffdf8!important;color:#134a35!important;border:1px solid #d8bb7d!important;box-shadow:0 6px 18px rgba(70,52,20,.06)!important}
body.customer-mode .home-annuwrap{background:url('/assets/heritage-hero-v5.svg') center/cover no-repeat!important;border:1px solid rgba(211,161,62,.38);box-shadow:inset 0 0 0 1px rgba(255,255,255,.36),0 16px 34px rgba(78,53,22,.12);overflow:hidden!important}
body.customer-mode .home-annuwrap .home-motion-stage,body.customer-mode .home-annuwrap>.home-bubble{display:none!important}

@media(min-width:760px){
 body.customer-mode .customer-home{padding:16px 18px calc(26px + env(safe-area-inset-bottom))!important}
 body.customer-mode .home-hero{grid-template-columns:minmax(360px,.88fr) minmax(440px,1.12fr)!important;min-height:470px!important;padding:58px 30px 28px 34px!important;border-radius:28px!important}
 body.customer-mode .home-copy{justify-content:center!important;padding-right:10px!important}
 body.customer-mode .home-copy h2{font-size:clamp(42px,5vw,65px)!important;max-width:520px!important;line-height:.99!important;margin:14px 0 12px!important}
 body.customer-mode .home-copy>p{font-size:16px!important;max-width:500px!important}
 body.customer-mode .home-hero-actions{margin-top:22px!important}
 body.customer-mode .home-annuwrap{position:relative!important;right:auto!important;top:auto!important;width:auto!important;min-height:400px!important;align-self:stretch!important;margin:0!important;border-radius:22px!important;opacity:1!important}
}

/* Three colorful destinations only — no duplicate Chat-with-Vindhu panel. */
body.customer-mode .home-section{margin-top:18px!important}
body.customer-mode .home-section-head>div>span{color:#a36d13!important}
body.customer-mode .home-section-head h3{color:#0c4c35!important}
body.customer-mode .home-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}
body.customer-mode .home-tile{position:relative!important;overflow:hidden!important;display:grid!important;grid-template-columns:44px minmax(0,1fr) 24px!important;align-items:center!important;gap:11px!important;min-height:265px!important;padding:170px 16px 16px!important;border:1px solid #dfc58d!important;border-radius:22px!important;background:linear-gradient(180deg,#fffdf8,#fff7e7)!important;box-shadow:0 10px 26px rgba(70,55,28,.08)!important}
body.customer-mode .home-tile::before{content:""!important;position:absolute!important;inset:0 0 auto 0!important;width:auto!important;height:154px!important;border:0!important;border-radius:0!important;opacity:1!important;background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important}
body.customer-mode .home-tile::after{content:""!important;position:absolute!important;left:0!important;right:0!important;top:125px!important;width:auto!important;height:30px!important;border-radius:0!important;background:linear-gradient(to bottom,transparent,rgba(255,253,248,.96))!important}
body.customer-mode .tile-combo::before{background-image:url('/assets/combos-v5.svg')!important}
body.customer-mode .tile-plan::before{background-image:url('/assets/weekly-plans-v5.svg')!important}
body.customer-mode .tile-orders::before{background-image:url('/assets/orders-v5.svg')!important}
body.customer-mode .tile-menu{display:none!important}
body.customer-mode .tile-icon{position:relative;z-index:2;width:44px!important;height:44px!important;border-radius:14px!important;background:#edf4ea!important;color:#0e5b3f!important}
body.customer-mode .tile-copy,body.customer-mode .tile-arrow{position:relative;z-index:2}
body.customer-mode .tile-copy b{font-size:20px!important;color:#173d2e!important}
body.customer-mode .tile-copy small{font-size:12px!important;color:#667067!important}
body.customer-mode .tile-arrow{color:#0e6545!important}
body.customer-mode .heritage-signoff{margin-top:15px!important;background:linear-gradient(90deg,#0d5239,#126647,#0d5239)!important;border-color:#d8a845!important;color:#f9dda0!important;border-radius:18px!important;padding:13px!important}
body.customer-mode .home-promise{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;border:0!important;gap:9px!important}
body.customer-mode .home-promise>div{background:#fffaf0!important;border:1px solid #e1c995!important;box-shadow:0 6px 18px rgba(67,51,24,.05)!important}
body.customer-mode .home-promise>div:nth-child(1)::after{content:"Telugu inti ruchulu";display:block;color:#a66f12;font-size:9px;font-weight:800;letter-spacing:.06em;margin-top:2px}

/* INITIAL SESSION — balanced two-column welcome + form, not one huge empty green rectangle. */
body.customer-mode .onboard{background:radial-gradient(circle at 18px 18px,rgba(206,151,42,.06) 1.2px,transparent 1.4px) 0 0/36px 36px,linear-gradient(180deg,#fff9ec,#f6ead4)!important;gap:13px!important}
@media(min-width:760px){
 body.customer-mode .onboard{display:grid!important;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr)!important;grid-template-areas:"hero form" "steps form" "trust form" "tiny form"!important;align-items:start!important;padding:18px!important;column-gap:16px!important}
 body.customer-mode .onboard>.hero{grid-area:hero!important}
 body.customer-mode .onboard>.steps{grid-area:steps!important}
 body.customer-mode .onboard>.assistant-trust{grid-area:trust!important}
 body.customer-mode .onboard>#startForm{grid-area:form!important;position:sticky!important;top:12px!important}
 body.customer-mode .onboard>.tiny{grid-area:tiny!important}
}
body.customer-mode .onboard .hero{position:relative!important;min-height:430px!important;padding:154px 49% 28px 27px!important;border:1.5px solid #d5a443!important;border-radius:28px!important;background:linear-gradient(90deg,rgba(8,76,52,.98) 0%,rgba(12,92,63,.94) 43%,rgba(11,78,54,.44) 60%,rgba(11,78,54,.05) 76%),url('/assets/heritage-hero-v5.svg') 72% center/cover no-repeat!important;box-shadow:0 18px 42px rgba(68,49,18,.13)!important;color:#fff!important}
body.customer-mode .onboard .hero::before{content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:38px!important;background:radial-gradient(ellipse at 50% -5%,#2b7147 0 52%,transparent 55%) 0 0/42px 32px repeat-x!important;border-radius:28px 28px 0 0!important}
body.customer-mode .onboard .hero::after{content:""!important;position:absolute!important;inset:14px!important;border:1px solid rgba(247,218,151,.20)!important;border-radius:21px!important;pointer-events:none!important}
body.customer-mode .onboard .heroTop{position:absolute!important;left:27px!important;top:53px!important;width:43%!important;display:flex!important;align-items:center!important;gap:10px!important;z-index:3!important}
body.customer-mode .onboard .mascotBtn{flex:none!important;width:76px!important;height:76px!important;background:rgba(255,255,255,.10)!important;border:1px solid rgba(255,226,164,.32)!important;border-radius:24px!important}
body.customer-mode .onboard .mascotBtn .mascot{width:72px!important}
body.customer-mode .onboard .bubble{margin:0!important;padding:9px 12px!important;background:#fffaf0!important;color:#244a38!important;border-radius:16px 16px 16px 5px!important;font-size:12px!important;line-height:1.3!important;box-shadow:0 8px 20px rgba(0,0,0,.12)!important}
body.customer-mode .onboard .kick{position:relative!important;z-index:3!important;color:#ffe1a0!important;background:rgba(255,255,255,.10)!important;border:1px solid rgba(247,218,151,.22)!important}
body.customer-mode .onboard .hero h2{position:relative!important;z-index:3!important;margin-top:13px!important;font-size:35px!important;line-height:1.04!important;color:#fff!important}
body.customer-mode .onboard .hero p{position:relative!important;z-index:3!important;color:rgba(255,255,255,.87)!important;font-size:14px!important}
body.customer-mode .steps{gap:8px!important}
body.customer-mode .steps li{border:1px solid #dfc58d!important;background:linear-gradient(180deg,#fffdf8,#fff6e7)!important;box-shadow:0 7px 18px rgba(67,51,24,.05)!important}
body.customer-mode .steps b{background:#e5efe8!important;color:#0e5b3f!important}
body.customer-mode .assistant-trust{border-color:#b8cfbd!important;background:#eef6ec!important;color:#53665a!important}
body.customer-mode #startForm{border:1.5px solid #d9bb78!important;border-radius:26px!important;background:rgba(255,253,248,.97)!important;box-shadow:0 18px 42px rgba(68,49,18,.10)!important;padding:20px!important;gap:13px!important}
body.customer-mode #startForm::before{content:"Start your private ordering session";display:block;color:#0d5138;font:700 23px/1.15 var(--f-display);margin-bottom:2px}
body.customer-mode #startForm::after{content:"Vindhu remembers this chat only in this browser. Annapurna reviews every placed order before cooking.";display:block;color:#6b746d;font-size:11.5px;line-height:1.4;order:20;border-top:1px solid #eadabb;padding-top:11px;margin-top:2px}
body.customer-mode #startForm input[type=text]{background:#fffaf0!important;border-color:#d8c297!important}
body.customer-mode #startForm .btn{min-height:48px!important}
body.customer-mode #startForm #startBtn{background:linear-gradient(180deg,#146b49,#0d543a)!important;color:#fff!important}

/* Mobile: colorful reference composition, but still an app. */
@media(max-width:759px){
 body.customer-mode .top{display:flex!important;flex-wrap:wrap!important;gap:5px!important;padding:calc(7px + env(safe-area-inset-top)) 9px 5px!important;min-height:0!important}
 body.customer-mode .brand-home{order:1!important;flex:1 1 calc(100% - 52px)!important;min-width:0!important;max-width:none!important;gap:9px!important}
 body.customer-mode .seal{width:43px!important;height:43px!important}
 body.customer-mode .brand{max-width:none!important}
 body.customer-mode .brand h1{font-size:20px!important;white-space:nowrap!important;overflow:visible!important}
 body.customer-mode .brand small{display:block!important;font-size:8.5px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:210px!important}
 body.customer-mode .theme-toggle{order:2!important;width:40px!important;height:40px!important}
 body.customer-mode .tabs{order:3!important;width:100%!important;display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:3px!important;padding-top:4px!important;border-top:1px solid #ead8ad!important}
 body.customer-mode .tab{min-width:0!important;width:100%!important;padding:6px 2px 5px!important;font-size:10px!important}
 body.customer-mode .customer-home{padding:8px 8px calc(18px + env(safe-area-inset-bottom))!important}
 body.customer-mode .home-hero{display:flex!important;flex-direction:column!important;min-height:0!important;padding:54px 13px 16px!important;border-radius:0 0 25px 25px!important}
 body.customer-mode .home-hero::before{height:37px!important;background-size:38px 30px!important}
 body.customer-mode .home-hero::after{inset:42px 8px 8px!important;border-radius:20px!important}
 body.customer-mode .home-copy{order:1!important;align-items:center!important;text-align:center!important;padding:0 5px!important}
 body.customer-mode .home-eyebrow{font-size:9.5px!important}
 body.customer-mode .home-copy h2{font-size:clamp(34px,10.5vw,46px)!important;line-height:1!important;margin:10px 0 8px!important;max-width:390px!important}
 body.customer-mode .home-copy>p{font-size:13px!important;line-height:1.42!important;max-width:360px!important}
 body.customer-mode .home-annuwrap{order:2!important;position:relative!important;right:auto!important;top:auto!important;width:100%!important;min-height:235px!important;margin:13px 0 0!important;border-radius:19px!important;opacity:1!important;background-position:center 36%!important;pointer-events:none!important}
 body.customer-mode .home-hero-actions{order:3!important;width:100%!important;display:grid!important;grid-template-columns:1fr!important;gap:8px!important;margin-top:12px!important}
 body.customer-mode .home-primary,body.customer-mode .home-secondary{width:100%!important;min-width:0!important;min-height:53px!important;border-radius:16px!important;justify-content:center!important}
 body.customer-mode .home-grid{grid-template-columns:1fr!important;gap:10px!important}
 body.customer-mode .home-tile{min-height:226px!important;padding:145px 13px 13px!important;grid-template-columns:42px 1fr 20px!important;border-radius:19px!important}
 body.customer-mode .home-tile::before{height:132px!important}
 body.customer-mode .home-tile::after{top:106px!important;height:27px!important}
 body.customer-mode .tile-copy b{font-size:18px!important}
 body.customer-mode .tile-copy small{font-size:11px!important}
 body.customer-mode .home-promise{grid-template-columns:1fr 1fr!important;gap:7px!important}
 body.customer-mode .home-promise>div{padding:10px!important}
 body.customer-mode .heritage-signoff{font-size:11px!important;padding:10px 7px!important}

 body.customer-mode .onboard{display:flex!important;padding:9px 9px calc(20px + env(safe-area-inset-bottom))!important;gap:10px!important}
 body.customer-mode .onboard .hero{min-height:500px!important;padding:305px 17px 22px!important;border-radius:25px!important;background:linear-gradient(0deg,rgba(8,77,52,.98) 0%,rgba(10,87,59,.96) 42%,rgba(10,87,59,.48) 56%,rgba(10,87,59,.02) 72%),url('/assets/heritage-hero-v5.svg') center top/auto 310px no-repeat,#0b563b!important}
 body.customer-mode .onboard .hero::before{height:34px!important;background-size:38px 29px!important}
 body.customer-mode .onboard .heroTop{left:16px!important;right:16px!important;top:235px!important;width:auto!important;justify-content:center!important}
 body.customer-mode .onboard .mascotBtn{width:66px!important;height:66px!important;border-radius:20px!important}
 body.customer-mode .onboard .mascotBtn .mascot{width:62px!important}
 body.customer-mode .onboard .bubble{max-width:220px!important;font-size:11px!important;text-align:left!important}
 body.customer-mode .onboard .hero h2{font-size:30px!important;margin:11px 0 7px!important;text-align:center!important}
 body.customer-mode .onboard .hero>p{text-align:center!important;font-size:13px!important}
 body.customer-mode .onboard .kick{display:flex!important;width:max-content!important;max-width:100%!important;margin:0 auto!important;font-size:10px!important}
 body.customer-mode .steps{grid-template-columns:1fr!important;gap:7px!important}
 body.customer-mode .steps li{display:grid!important;grid-template-columns:28px auto!important;column-gap:9px!important;align-items:center!important;padding:9px 11px!important}
 body.customer-mode .steps li b{grid-row:1/3!important;margin:0!important}
 body.customer-mode #startForm{padding:16px!important;border-radius:22px!important}
 body.customer-mode #startForm::before{font-size:21px!important}
}
@media(max-width:360px){body.customer-mode .brand h1{font-size:18px!important}body.customer-mode .brand small{max-width:175px!important}body.customer-mode .home-copy h2{font-size:32px!important}body.customer-mode .home-annuwrap{min-height:205px!important}body.customer-mode .home-promise{grid-template-columns:1fr!important}}

/* Dark theme keeps the structure and colorful artwork while darkening the paper surfaces. */
html[data-theme="dark"] body.customer-mode .top{background:linear-gradient(180deg,#15251b,#111e16)!important;border-bottom-color:#6b572d!important}
html[data-theme="dark"] body.customer-mode .customer-home,html[data-theme="dark"] body.customer-mode .onboard{background:linear-gradient(180deg,#101a13,#0c1510)!important}
html[data-theme="dark"] body.customer-mode .home-hero{background:linear-gradient(180deg,#17261c,#132118)!important;border-color:#80662f!important}
html[data-theme="dark"] body.customer-mode .home-copy h2,html[data-theme="dark"] body.customer-mode .tile-copy b{color:#edf4e9!important}
html[data-theme="dark"] body.customer-mode .home-copy>p,html[data-theme="dark"] body.customer-mode .tile-copy small{color:#aebbad!important}
html[data-theme="dark"] body.customer-mode .home-tile,html[data-theme="dark"] body.customer-mode #startForm,html[data-theme="dark"] body.customer-mode .steps li{background:linear-gradient(180deg,#1a281e,#152119)!important;border-color:#6b5832!important}
html[data-theme="dark"] body.customer-mode #startForm::before{color:#e8f1e8!important}
</style>`;
if (!s.includes('</head>')) throw new Error('missing </head>');
s = s.replace('</head>', css + '\n</head>');
fs.writeFileSync(path, s);
