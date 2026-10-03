const fs = require('fs');
const p = 'public/index.html';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('id="homeGreeting"') || !s.includes('id="homeCombos"') || !s.includes('id="homePlans"') || !s.includes('id="homeOrders"')) {
  throw new Error('Expected home markers not found');
}

s = s.replace('Homemade in Kitchener · pickup fresh', 'Telugu inti ruchulu · pickup fresh');
s = s.replace('Choose a path below. Vindhu will help with the details and we always show you the full order before placing it.', 'Vindhu is your ordering assistant. Start with a combo, a weekly plan, or track an order — everything stays in one chat.');
s = s.replace('<div class="home-section-head"><div><span>EXPLORE</span><h3>Choose what you need</h3></div><small>Everything stays in one order chat</small></div>', '<div class="home-section-head"><div><span>ORDER WITH VINDHU</span><h3>What would you like to do?</h3></div><small>Combos · Weekly Plans · Orders</small></div>');

const marker = '<style id="heritageBotMobileV4">';
const endMarker = '</style><!-- heritageBotMobileV4 -->';
if (s.includes(marker)) {
  const a = s.indexOf(marker);
  const b = s.indexOf(endMarker, a);
  if (b < 0) throw new Error('Existing V4 style block is malformed');
  s = s.slice(0, a) + s.slice(b + endMarker.length);
}

const css = `
<style id="heritageBotMobileV4">
/* V4 — bot-first Telugu/South-Indian home experience. Visual only. */
html,body{overflow-x:hidden!important;overscroll-behavior-x:none!important}
body.customer-mode,.customer-mode .app,.customer-mode .customer-home,.customer-mode .home-hero,.customer-mode .home-section,.customer-mode .home-grid{max-width:100%!important;min-width:0!important}

body.customer-mode .customer-home{
  background:
    radial-gradient(circle at 18px 18px,rgba(205,148,35,.055) 1.2px,transparent 1.3px) 0 0/36px 36px,
    linear-gradient(180deg,#fffaf0 0%,#f9f0de 54%,#fffaf1 100%)!important;
}
body.customer-mode .home-hero{
  position:relative!important;isolation:isolate!important;
  color:#173e2f!important;
  background:
    radial-gradient(260px 180px at 12% 94%,rgba(46,111,70,.08),transparent 70%),
    radial-gradient(260px 160px at 92% 12%,rgba(220,157,37,.12),transparent 70%),
    linear-gradient(180deg,#fffdf7,#fff7e6)!important;
  border:1.5px solid #d8ad55!important;
  box-shadow:0 18px 44px rgba(92,67,24,.12)!important;
}
body.customer-mode .home-hero::before{
  content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:42px!important;z-index:-1!important;pointer-events:none!important;
  background:
    radial-gradient(ellipse at 50% -6%,#2e6f46 0 50%,transparent 53%) 0 0/44px 34px repeat-x,
    radial-gradient(circle at 50% 5px,#f4d998 0 2px,transparent 2.5px) 0 0/44px 34px repeat-x!important;
  opacity:.98!important;
}
body.customer-mode .home-hero::after{
  content:""!important;position:absolute!important;inset:18px!important;z-index:-1!important;pointer-events:none!important;border:1px solid rgba(211,164,73,.42)!important;border-radius:26px 26px 44% 44%/28px 28px 18% 18%!important;
}
body.customer-mode .home-copy{z-index:3!important}
body.customer-mode .home-eyebrow{color:#a66f12!important;background:transparent!important;border:0!important;padding:0!important;letter-spacing:.16em!important}
body.customer-mode .home-copy h2{color:#0f4d37!important;text-shadow:none!important}
body.customer-mode .home-copy>p{color:#566057!important}
body.customer-mode .home-primary{
  background:linear-gradient(180deg,#176b4d,#0f523a)!important;color:#fff!important;border:1px solid #0d4934!important;box-shadow:0 11px 24px rgba(15,82,58,.20)!important;
}
body.customer-mode .home-secondary{background:#fffdf8!important;color:#164a36!important;border:1px solid #d8bd83!important}
body.customer-mode .home-bubble{background:#fffdf8!important;color:#174534!important;border:1px solid #ddb65f!important}
body.customer-mode .home-glow{background:radial-gradient(circle,rgba(229,178,71,.28),rgba(56,125,78,.05) 56%,transparent 72%)!important}

body.customer-mode .home-section-head>div>span{color:#a66f12!important}
body.customer-mode .home-section-head h3{color:#0f4d37!important}
body.customer-mode .home-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}
body.customer-mode .home-tile{
  min-height:116px!important;border:1px solid #dfc58d!important;background:linear-gradient(180deg,#fffdf8,#fff8ea)!important;
  box-shadow:0 8px 22px rgba(73,62,37,.07)!important;border-radius:20px!important;
}
body.customer-mode .home-tile::before{background:#d7a53d!important}
body.customer-mode .tile-icon{background:#eef4ec!important;color:#15573e!important}
body.customer-mode .tile-copy b{color:#173e2f!important}
body.customer-mode .tile-copy small{color:#667067!important}
body.customer-mode .tile-arrow{color:#0f6547!important}
body.customer-mode .tile-menu{display:none!important}
body.customer-mode .heritage-signoff{background:linear-gradient(90deg,#fff8e7,#fffdf8,#fff5dc)!important;border-color:#dfc58d!important;color:#0f4d37!important}

/* Mobile is intentionally bot-first: Vindhu appears before the three destinations. */
@media(max-width:680px){
  body.customer-mode .customer-home{padding:8px 8px calc(18px + env(safe-area-inset-bottom))!important}
  body.customer-mode .home-hero{display:flex!important;flex-direction:column!important;min-height:0!important;padding:60px 17px 18px!important;border-radius:0 0 26px 26px!important;margin:0!important}
  body.customer-mode .home-hero::before{height:38px!important;background-size:38px 31px,38px 31px!important}
  body.customer-mode .home-hero::after{inset:43px 9px 9px!important;border-radius:24px 24px 42% 42%/24px 24px 14% 14%!important}
  body.customer-mode .home-copy{align-items:center!important;text-align:center!important;padding:0!important;order:1!important}
  body.customer-mode .home-eyebrow{font-size:10px!important}
  body.customer-mode .home-copy h2{font-size:35px!important;line-height:1.02!important;margin:10px 0 7px!important;max-width:360px!important}
  body.customer-mode .home-copy>p{font-size:13px!important;line-height:1.42!important;max-width:350px!important}
  body.customer-mode .home-annuwrap{position:relative!important;right:auto!important;top:auto!important;width:100%!important;min-height:176px!important;margin:4px 0 0!important;opacity:1!important;order:2!important;pointer-events:none!important}
  body.customer-mode .home-motion-stage{width:180px!important;height:170px!important}
  body.customer-mode .home-motion-stage #homeMascot{width:158px!important;height:160px!important}
  body.customer-mode .home-motion-stage #homeMascot .mascot{width:132px!important;max-height:158px!important}
  body.customer-mode .home-motion-stage .home-glow{width:165px!important;height:165px!important}
  body.customer-mode .home-annuwrap .home-bubble{display:block!important;margin-top:-15px!important;font-size:10.5px!important;padding:7px 10px!important}
  body.customer-mode .home-hero-actions{width:100%!important;display:grid!important;grid-template-columns:1fr!important;gap:8px!important;margin-top:13px!important;order:3!important}
  body.customer-mode .home-primary,body.customer-mode .home-secondary{width:100%!important;min-width:0!important;min-height:52px!important;border-radius:16px!important;justify-content:center!important}
  body.customer-mode .home-primary{text-align:center!important}
  body.customer-mode .home-primary>span:nth-child(2){flex:0 1 auto!important}
  body.customer-mode .home-section{margin-top:14px!important}
  body.customer-mode .home-section-head{align-items:flex-start!important;margin:0 3px 9px!important}
  body.customer-mode .home-section-head h3{font-size:22px!important}
  body.customer-mode .home-section-head>small{display:block!important;max-width:125px!important;font-size:10.5px!important;line-height:1.25!important}
  body.customer-mode .home-grid{grid-template-columns:1fr!important;gap:8px!important}
  body.customer-mode .home-tile{min-height:80px!important;grid-template-columns:44px 1fr 20px!important;padding:12px 13px!important;border-radius:17px!important}
  body.customer-mode .tile-icon{width:44px!important;height:44px!important;border-radius:14px!important}
  body.customer-mode .tile-copy b{font-size:18px!important}
  body.customer-mode .tile-copy small{font-size:11.5px!important}
  body.customer-mode .home-promise{display:none!important}
  body.customer-mode .heritage-signoff{margin-top:10px!important;padding:9px 8px!important;font-size:11px!important}
}
@media(max-width:390px){
  body.customer-mode .home-copy h2{font-size:32px!important}
  body.customer-mode .home-section-head>small{display:none!important}
}
@media(max-width:340px){
  body.customer-mode .home-copy h2{font-size:29px!important}
  body.customer-mode .home-hero{padding-left:13px!important;padding-right:13px!important}
  body.customer-mode .home-primary,body.customer-mode .home-secondary{font-size:14px!important}
}
html[data-theme="dark"] body.customer-mode .customer-home{background:linear-gradient(180deg,#101a13,#0c1510)!important}
html[data-theme="dark"] body.customer-mode .home-hero{background:linear-gradient(180deg,#16241b,#111d16)!important;border-color:rgba(239,181,69,.36)!important}
html[data-theme="dark"] body.customer-mode .home-copy h2,html[data-theme="dark"] body.customer-mode .tile-copy b{color:#edf4e9!important}
html[data-theme="dark"] body.customer-mode .home-copy>p,html[data-theme="dark"] body.customer-mode .tile-copy small{color:#aebcad!important}
html[data-theme="dark"] body.customer-mode .home-tile{background:linear-gradient(180deg,#18251c,#152119)!important;border-color:rgba(239,181,69,.20)!important}
html[data-theme="dark"] body.customer-mode .home-secondary{background:#18251c!important;color:#edf4e9!important;border-color:#465640!important}
</style><!-- heritageBotMobileV4 -->
`;

s = s.replace('</head>', css + '\n</head>');
fs.writeFileSync(p, s);
console.log('Applied V4 bot-first mobile heritage preview.');
