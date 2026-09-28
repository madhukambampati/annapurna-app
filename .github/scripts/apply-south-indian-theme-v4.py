from pathlib import Path

CUSTOMER = r'''
<style id="southIndianThemeV4">
/* SOUTH INDIAN THEME V4 — presentation only. No ordering/business logic changes. */
.customer-mode{
  --si-maroon:#7b2e2e;
  --si-maroon-deep:#5b1f25;
  --si-brick:#a94432;
  --si-turmeric:#d99a21;
  --si-mustard:#c48617;
  --si-brass:#b98a3d;
  --si-leaf:#3f6b43;
  --si-cream:#fff8e8;
  --si-rice:#f8efd9;
  --si-copper:#9b5d35;
}
body.customer-mode{
  background:
    radial-gradient(620px 360px at 0% 0%,rgba(123,46,46,.13),transparent 72%),
    radial-gradient(520px 330px at 100% 100%,rgba(217,154,33,.12),transparent 75%),
    #efe6d3;
}
.customer-mode .app{background:#fffaf0}
.customer-mode .top{
  background:rgba(255,250,240,.96)!important;
  border-bottom:0!important;
  box-shadow:0 7px 24px rgba(91,31,37,.07)!important;
}
.customer-mode .top::after{
  content:"";position:absolute;left:0;right:0;bottom:-7px;height:8px;pointer-events:none;
  background:
    radial-gradient(circle at 8px 4px,transparent 0 2px,var(--si-maroon) 2.2px 3px,transparent 3.2px) 0 0/16px 8px repeat-x,
    linear-gradient(90deg,var(--si-turmeric),var(--si-brass),var(--si-maroon));
  opacity:.88;
}
.customer-mode .brand h1{color:var(--si-maroon-deep)}
.customer-mode .brand small{color:#765d4f}
.customer-mode .seal{
  background:linear-gradient(145deg,#fff4d8,#f3dfb5);
  box-shadow:0 8px 22px rgba(123,46,46,.15)!important;
  border:1px solid rgba(185,138,61,.35);
}
.customer-mode .tab{color:#6b5d53}
.customer-mode .tab[aria-current=true]{
  color:var(--si-maroon-deep)!important;
  background:#f5dfb5!important;
}
.customer-mode .tab[aria-current=true]::after{background:var(--si-maroon)!important}
.customer-mode .home-hero{
  background:
    radial-gradient(360px 280px at 86% 15%,rgba(226,169,58,.36),transparent 66%),
    radial-gradient(260px 220px at 8% 108%,rgba(63,107,67,.18),transparent 66%),
    linear-gradient(135deg,#681f27 0%,#8c352f 50%,#6a3b2c 100%)!important;
  box-shadow:0 24px 58px rgba(91,31,37,.25)!important;
}
.customer-mode .home-hero::before{
  opacity:.22!important;
  background-image:
    radial-gradient(circle at center,transparent 0 4px,rgba(255,234,188,.95) 4.5px 5.5px,transparent 6px),
    radial-gradient(circle at center,rgba(255,234,188,.85) 0 1px,transparent 1.5px)!important;
  background-size:24px 24px,12px 12px!important;
  mask-image:linear-gradient(90deg,transparent 10%,#000 72%)!important;
}
.customer-mode .home-eyebrow{
  color:#fff2c8;background:rgba(255,221,147,.12)!important;border-color:rgba(255,226,164,.25)!important;
}
.customer-mode .home-primary{
  background:linear-gradient(180deg,#e7b64d,#c98d21)!important;
  color:#3d2608!important;
  box-shadow:0 12px 28px rgba(45,24,6,.20)!important;
}
.customer-mode .home-secondary{
  background:rgba(255,247,228,.10)!important;border-color:rgba(255,229,184,.28)!important;
}
.customer-mode .home-tile{
  background:linear-gradient(180deg,#fffaf0,#fff6e5)!important;
  border-color:#e7d3ad!important;
  box-shadow:0 12px 28px rgba(91,31,37,.07)!important;
}
.customer-mode .tile-combo{--tile-tone:var(--si-maroon)!important}
.customer-mode .tile-plan{--tile-tone:var(--si-leaf)!important}
.customer-mode .tile-orders{--tile-tone:#8f6835!important}
.customer-mode .tile-menu{--tile-tone:var(--si-turmeric)!important}
.customer-mode .tile-icon{border:1px solid color-mix(in srgb,var(--tile-tone) 24%,transparent)}
.customer-mode .home-section-head>div>span{color:var(--si-maroon)!important}
.customer-mode .home-section-head h3{color:#44251f}
.customer-mode .btn:not(.ghost):not(.warn),
.customer-mode .send{
  background:linear-gradient(180deg,var(--si-maroon),var(--si-maroon-deep))!important;
  color:#fff8eb!important;
}
.customer-mode .btn:not(.ghost):not(.warn):hover,
.customer-mode .send:hover{filter:brightness(1.08)}
.customer-mode .btn.ghost{border-color:#d8c39e!important;background:#fffaf0!important}
.customer-mode .sheet{background:#fffaf0!important}
.customer-mode .sheet>header{background:rgba(255,250,240,.96)!important;border-bottom-color:#eadaba!important}
.customer-mode .sheet>header h2{color:#44251f}
.customer-mode .seg{
  background:#f7ecd5!important;border-color:#e3cfaa!important;
}
.customer-mode .seg button{color:#6d5d51!important}
.customer-mode .seg button[aria-selected=true]{
  background:linear-gradient(180deg,var(--si-maroon),var(--si-maroon-deep))!important;
  color:#fff8ea!important;box-shadow:0 8px 18px rgba(91,31,37,.18)!important;
}
.customer-mode .dish{
  background:linear-gradient(180deg,#fffdf7,#fff8ea)!important;
  border-color:#ead8b7!important;
}
.customer-mode .dish::before{
  content:"";width:4px;align-self:stretch;border-radius:99px;background:linear-gradient(var(--si-turmeric),var(--si-maroon));
  flex:none;margin-right:2px;
}
.customer-mode .dname{color:#4a2921}
.customer-mode .dprice .amt.alt{color:var(--si-maroon)!important}
.customer-mode .pill{background:#f2dfb9!important;color:#6b331f!important}
.customer-mode .pill::before{background:var(--si-maroon)!important}
.customer-mode .ord{
  background:linear-gradient(180deg,#fffdf8,#fff7e8)!important;
  border-color:#e3cda5!important;
}
.customer-mode .ord::before{background:linear-gradient(var(--si-turmeric),var(--si-maroon))!important}
.customer-mode .ord-items{background:#f8ecd5!important;border-color:#e6d1ab!important}
.customer-mode .ord-meta>div{background:#fffaf1!important;border-color:#ead9b8!important}
.customer-mode .steps4 li.on{color:var(--si-maroon)!important}
.customer-mode .steps4 li.on::before{background:var(--si-maroon)!important}
.customer-mode .ord .steps4 li.current-step::after{background:var(--si-turmeric)!important}
.customer-mode .b.agent,
.customer-mode .b.owner{
  background:#fffaf1!important;border-color:#ead7b4!important;
}
.customer-mode .b.cust{
  background:linear-gradient(180deg,var(--si-maroon),var(--si-maroon-deep))!important;
  color:#fffaf0!important;
}
.customer-mode .sum{border-color:var(--si-brass)!important;background:#fffaf0!important}
.customer-mode .sum h3,
.customer-mode .sum .cfhead{background:linear-gradient(90deg,var(--si-maroon-deep),var(--si-maroon))!important}
.customer-mode .chips button{
  background:#fffaf0!important;border-color:#dcc69f!important;color:#55372d!important;
}
.customer-mode .chips button:hover{border-color:var(--si-maroon)!important;color:var(--si-maroon)!important}
.customer-mode .composer{background:rgba(255,250,240,.95)!important;border-top-color:#ead9b8!important}
.customer-mode .composer textarea{background:#fffdf8!important;border-color:#ddc7a0!important}
.customer-mode .customer-action{background:#fffaf0!important;border-color:#dec9a4!important}
.customer-mode .customer-action .ic{color:var(--si-maroon)!important}
.customer-mode .customer-action[data-accent=true]{background:var(--si-maroon)!important;color:#fff!important;border-color:var(--si-maroon)!important}
.customer-mode .customer-action[data-accent=true] .ic{color:#fff!important}
.customer-mode .ilink{
  background:linear-gradient(90deg,var(--si-maroon-deep),var(--si-brick),var(--si-turmeric))!important;
  color:#fff9ed!important;border:1px solid rgba(185,138,61,.45);box-shadow:0 7px 18px rgba(91,31,37,.12);
}
/* Make Vindhu feel more like polished South-Indian steel/brass serviceware without changing SVG/JS. */
.customer-mode .mascot{
  filter:drop-shadow(0 10px 14px rgba(83,48,26,.18)) saturate(.72) contrast(1.04);
}
.customer-mode .home-annuwrap::after{
  content:"";position:absolute;z-index:0;width:210px;height:36px;bottom:34px;border-radius:50%;
  background:radial-gradient(ellipse,#d8c5a0 0 45%,#9b7f58 47% 55%,transparent 58%);
  opacity:.52;transform:perspective(120px) rotateX(58deg);
}
.customer-mode .home-annuwrap .mascot{z-index:2}
.customer-mode .home-glow{background:radial-gradient(circle,rgba(228,178,77,.48),rgba(255,245,216,.10) 54%,transparent 72%)!important}
.customer-mode .spice button{
  border-color:#e2c596!important;background:#fff7e5!important;color:#612d28!important;
}
.customer-mode .spice .chili{color:var(--si-brick)!important}
@media(max-width:520px){
  .customer-mode .top::after{bottom:-6px;height:7px;background-size:14px 7px,100% 100%}
  .customer-mode .home-hero{padding:24px 20px!important}
}
@media(prefers-color-scheme:dark){
  body.customer-mode{background:#160f0d}
  .customer-mode .app{background:#211613}
  .customer-mode .top,.customer-mode .sheet>header,.customer-mode .composer{background:rgba(35,23,19,.96)!important}
  .customer-mode .brand h1,.customer-mode .home-section-head h3,.customer-mode .sheet>header h2,.customer-mode .dname{color:#f4dfbd!important}
  .customer-mode .home-tile,.customer-mode .dish,.customer-mode .ord,.customer-mode .b.agent,.customer-mode .b.owner,.customer-mode .customer-action,.customer-mode .chips button{background:#2a1c18!important;border-color:#5b4033!important}
  .customer-mode .ord-items,.customer-mode .seg{background:#32221b!important;border-color:#5a4032!important}
  .customer-mode .ord-meta>div,.customer-mode .composer textarea{background:#261a16!important;border-color:#5f4436!important}
  .customer-mode .btn.ghost{background:#2a1c18!important;border-color:#684c3a!important}
}
</style>
'''

OWNER = r'''
<style id="ownerSouthIndianThemeV4">
/* OWNER SOUTH INDIAN THEME V4 — presentation only */
body.owner-mode{
  --si-maroon:#7b2e2e;--si-maroon-deep:#5b1f25;--si-turmeric:#d99a21;--si-brass:#b98a3d;--si-leaf:#3f6b43;
}
.owner-head{
  background:
    radial-gradient(260px 140px at 92% 10%,rgba(217,154,33,.24),transparent 70%),
    linear-gradient(135deg,#5b1f25,#7b2e2e 58%,#6b3c2b)!important;
  box-shadow:0 18px 42px rgba(91,31,37,.24)!important;
}
.owner-head::after{
  content:"";position:absolute;left:18px;right:18px;bottom:-5px;height:7px;border-radius:99px;
  background:radial-gradient(circle at 7px 3px,transparent 0 1.8px,#d99a21 2px 2.8px,transparent 3px) 0 0/14px 7px repeat-x;
  opacity:.9;
}
.owner-head{position:relative}
.owner-pill{background:rgba(255,222,156,.13)!important;border-color:rgba(255,224,168,.26)!important;color:#fff0c9}
body.owner-mode .tabs button[aria-selected=true]{background:var(--si-maroon)!important;border-color:var(--si-maroon)!important;color:#fff7e7!important;box-shadow:0 7px 18px rgba(91,31,37,.20)!important}
.owner-kpi{border-color:color-mix(in srgb,var(--tone) 28%,#d8c09a)!important}
.owner-kpi:nth-child(1){--tone:var(--si-maroon)!important}
.owner-kpi:nth-child(2){--tone:#8a6b31!important}
.owner-kpi:nth-child(3){--tone:var(--si-turmeric)!important}
.owner-kpi:nth-child(4){--tone:var(--si-copper,#9b5d35)!important}
.owner-callout{background:color-mix(in srgb,var(--si-turmeric) 13%,var(--panel))!important;border-color:color-mix(in srgb,var(--si-turmeric) 38%,var(--line))!important}
body.owner-mode .ticket::before{background:linear-gradient(var(--si-turmeric),var(--si-maroon))!important}
body.owner-mode .ticket .when{color:var(--si-maroon)!important;background:color-mix(in srgb,var(--si-turmeric) 13%,transparent)!important}
.owner-lane{border-color:color-mix(in srgb,var(--si-brass) 32%,var(--line))!important}
.lane-cook{box-shadow:inset 0 3px 0 var(--si-maroon)!important}
.lane-ready{box-shadow:inset 0 3px 0 var(--si-turmeric)!important}
.owner-quick-actions .quick-orders{border-color:color-mix(in srgb,var(--si-maroon) 34%,var(--line))!important;background:color-mix(in srgb,var(--si-maroon) 7%,var(--panel))!important}
.owner-quick-actions .quick-kitchen{border-color:color-mix(in srgb,var(--si-turmeric) 38%,var(--line))!important;background:color-mix(in srgb,var(--si-turmeric) 9%,var(--panel))!important}
.owner-quick-actions .quick-chats{border-color:color-mix(in srgb,var(--si-leaf) 34%,var(--line))!important;background:color-mix(in srgb,var(--si-leaf) 8%,var(--panel))!important}
.owner-quick-actions .quick-menu{border-color:color-mix(in srgb,var(--si-brass) 36%,var(--line))!important;background:color-mix(in srgb,var(--si-brass) 8%,var(--panel))!important}
body.owner-mode button.pri{background:linear-gradient(180deg,var(--si-maroon),var(--si-maroon-deep))!important;border-color:var(--si-maroon)!important;color:#fff8eb!important}
body.owner-mode .chat-avatar{background:var(--si-maroon)!important}
.more-icon{background:color-mix(in srgb,var(--si-turmeric) 13%,var(--panel))!important;color:var(--si-maroon)!important}
@media(prefers-color-scheme:dark){
  .owner-head{background:linear-gradient(135deg,#40171c,#64262a 58%,#503025)!important}
}
</style>
'''

def append_once(path, marker, block):
    p = Path(path)
    s = p.read_text()
    assert marker not in s, f'{marker} already present'
    idx = s.lower().rfind('</head>')
    assert idx >= 0
    s = s[:idx] + block + '\n' + s[idx:]
    p.write_text(s)

append_once('public/index.html', 'id="southIndianThemeV4"', CUSTOMER)
append_once('public/desk.html', 'id="ownerSouthIndianThemeV4"', OWNER)
