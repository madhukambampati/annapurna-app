from pathlib import Path

CUSTOMER = r'''
<style id="customerVisualPolishV3">
/* CUSTOMER VISUAL POLISH V3 — presentation only */
.customer-mode{
  --food-saffron:#d98a0b;
  --food-turmeric:#f1b433;
  --food-banana:#3f6f3d;
  --food-coffee:#6f4a2f;
}
.customer-mode .customer-home{
  padding-top:16px;
  background:
    radial-gradient(520px 260px at 100% 0%,color-mix(in srgb,var(--food-turmeric) 10%,transparent),transparent 72%),
    radial-gradient(460px 280px at 0% 34%,color-mix(in srgb,var(--food-banana) 7%,transparent),transparent 76%),
    var(--page);
}
.customer-mode .home-hero{
  border-radius:28px;
  border:1px solid rgba(255,255,255,.16);
  box-shadow:0 22px 52px rgba(12,55,38,.22),inset 0 1px 0 rgba(255,255,255,.08);
}
.customer-mode .home-hero::after{
  content:"";position:absolute;right:-34px;bottom:-42px;width:210px;height:210px;pointer-events:none;opacity:.18;
  background:
    radial-gradient(circle at 50% 50%,transparent 0 18px,rgba(255,255,255,.75) 19px 20px,transparent 21px 34px,rgba(255,255,255,.6) 35px 36px,transparent 37px),
    linear-gradient(45deg,transparent 48%,rgba(255,255,255,.5) 49% 51%,transparent 52%),
    linear-gradient(-45deg,transparent 48%,rgba(255,255,255,.5) 49% 51%,transparent 52%);
  border-radius:50%;transform:rotate(8deg);
}
.customer-mode .home-eyebrow{
  background:rgba(255,255,255,.13);
  border-color:rgba(255,255,255,.2);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
}
.customer-mode .home-copy h2{letter-spacing:-.03em;text-shadow:0 2px 18px rgba(0,0,0,.12)}
.customer-mode .home-primary{
  background:linear-gradient(180deg,#f5bf45,var(--food-turmeric));
  box-shadow:0 12px 26px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.35);
}
.customer-mode .home-secondary{backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
.customer-mode .home-section{margin-top:22px}
.customer-mode .home-section-head{margin-bottom:10px}
.customer-mode .home-section-head h3{letter-spacing:-.01em}
.customer-mode .home-tile{
  min-height:118px;
  border-color:color-mix(in srgb,var(--tile-tone) 16%,var(--line));
  box-shadow:0 10px 26px rgba(20,50,32,.055),inset 0 1px 0 rgba(255,255,255,.32);
}
.customer-mode .home-tile:hover{
  transform:translateY(-2px);
  border-color:color-mix(in srgb,var(--tile-tone) 30%,var(--line));
  box-shadow:0 14px 30px rgba(20,50,32,.085);
}
.customer-mode .tile-icon{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tile-tone) 12%,transparent)}
.customer-mode .sheet>header{box-shadow:0 1px 0 var(--line),0 8px 22px rgba(22,48,33,.045)}
.customer-mode .seg{box-shadow:0 6px 16px rgba(22,48,33,.045)}
.customer-mode .dish{
  position:relative;overflow:hidden;
  border-color:color-mix(in srgb,var(--brand) 10%,var(--line));
  background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--surface2) 26%,var(--surface)));
}
.customer-mode .dish::before{
  content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 4px 4px 0;
  background:linear-gradient(var(--food-turmeric),var(--brand));opacity:.8;
}
.customer-mode .dish.off::before{background:var(--line2);opacity:.5}
.customer-mode .dname{letter-spacing:-.005em}
.customer-mode .dprice .amt{font-size:17px;font-weight:800}
.customer-mode .dprice .amt.alt{color:var(--brand2)}
.customer-mode .pill{box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 8%,transparent)}
.customer-mode .b.agent{
  background:linear-gradient(145deg,var(--agent),color-mix(in srgb,var(--surface2) 20%,var(--agent)));
}
.customer-mode .b.owner{box-shadow:0 5px 15px rgba(121,82,13,.06)}
.customer-mode .sum{
  border-width:1px;
  box-shadow:0 14px 32px rgba(29,107,77,.105);
}
.customer-mode .sum .row.total{
  background:color-mix(in srgb,var(--brand-soft) 34%,var(--surface));
  padding-top:10px;padding-bottom:10px;
}
.customer-mode .chips button{
  background:linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface2) 28%,var(--surface)));
}
.customer-mode .composer{
  box-shadow:0 -8px 24px rgba(18,49,34,.045);
}
.customer-mode .composer textarea:focus{
  box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 13%,transparent),inset 0 0 0 1px var(--brand);
}
.customer-mode .ord{
  border-color:color-mix(in srgb,var(--brand) 10%,var(--line));
  box-shadow:0 12px 28px rgba(20,50,32,.07);
}
.customer-mode .ord-items{background:linear-gradient(145deg,var(--surface2),color-mix(in srgb,var(--brand-soft) 12%,var(--surface2)))}
.customer-mode .status{border:1px solid color-mix(in srgb,var(--brand) 14%,transparent)}
@media(max-width:520px){
  .customer-mode .top{min-height:64px;padding-top:calc(8px + env(safe-area-inset-top));padding-bottom:8px}
  .customer-mode .seal{width:40px;height:40px;border-radius:13px}
  .customer-mode .brand h1{font-size:17px}
  .customer-mode .brand small{font-size:10.5px}
  .customer-mode .tab{min-width:44px;padding:6px 5px 4px;font-size:10.5px}
  .customer-mode .tab .ic{width:18px;height:18px}
  .customer-mode .customer-home{padding:14px 14px calc(24px + env(safe-area-inset-bottom))}
  .customer-mode .home-hero{padding:24px 20px;border-radius:24px}
  .customer-mode .home-section{margin-top:18px}
  .customer-mode .home-grid{gap:9px}
  .customer-mode .home-tile{min-height:104px;padding:14px;border-radius:19px;grid-template-columns:44px 1fr 18px;gap:9px}
  .customer-mode .tile-icon{width:44px;height:44px;border-radius:14px}
  .customer-mode .tile-copy b{font-size:16px}
  .customer-mode .tile-copy small{font-size:11px}
  .customer-mode .dish{padding:13px;border-radius:18px}
  .customer-mode .msgs{gap:9px;padding-inline:12px}
  .customer-mode .b{padding:9px 12px 6px}
  .customer-mode .sheet .body{padding-inline:14px}
}
</style>
'''

OWNER = r'''
<style id="ownerVisualPolishV3">
/* OWNER VISUAL POLISH V3 — presentation only */
body.owner-mode{
  --ops-green:#174f39;
  --ops-gold:#d79a24;
  --ops-blue:#2f7f9d;
}
body.owner-mode .owner-head{
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 16px 36px rgba(12,53,36,.18),inset 0 1px 0 rgba(255,255,255,.08);
}
body.owner-mode .owner-kpi{
  border-radius:20px;
  box-shadow:0 11px 26px rgba(30,45,35,.065),inset 0 1px 0 rgba(255,255,255,.18);
}
body.owner-mode .owner-kpi strong{letter-spacing:-.03em}
body.owner-mode .owner-section-head{padding-bottom:2px}
body.owner-mode .owner-lane{
  border-color:color-mix(in srgb,var(--owner-green-2) 10%,var(--line));
  box-shadow:0 10px 26px rgba(30,45,35,.045);
}
body.owner-mode .ticket{
  border-color:color-mix(in srgb,var(--ticket-tone,var(--owner-green-2)) 12%,var(--line));
  box-shadow:0 8px 20px rgba(30,45,35,.055);
}
body.owner-mode .ticket:hover{box-shadow:0 12px 26px rgba(30,45,35,.085)}
body.owner-mode .need{
  box-shadow:0 8px 18px color-mix(in srgb,var(--chilli) 7%,transparent);
}
body.owner-mode .owner-quick-actions{
  border:1px solid color-mix(in srgb,var(--owner-green-2) 9%,var(--line));
  border-radius:18px;
  box-shadow:0 10px 24px rgba(30,45,35,.045);
}
body.owner-mode .owner-quick-actions .quick{
  transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;
}
body.owner-mode .card{
  border-color:color-mix(in srgb,var(--owner-green-2) 8%,var(--line));
}
body.owner-mode .chatgrid{
  border-color:color-mix(in srgb,var(--owner-green-2) 10%,var(--line));
}
body.owner-mode .crow[aria-current=true]{box-shadow:inset 3px 0 0 var(--owner-green-2)}
body.owner-mode .thread .b.cust{background:linear-gradient(145deg,var(--agent),color-mix(in srgb,var(--panel2) 28%,var(--agent)))}
body.owner-mode .thread .b.owner{box-shadow:0 4px 12px rgba(121,82,13,.05)}
body.owner-mode table{border-radius:14px;overflow:hidden}
body.owner-mode th{letter-spacing:.07em}
body.owner-mode .more-card{border-radius:20px}
@media(max-width:620px){
  body.owner-mode{padding-left:12px;padding-right:12px}
  body.owner-mode .owner-head{border-radius:18px;padding:13px 14px}
  body.owner-mode .owner-brand img{width:42px;height:42px}
  body.owner-mode .owner-brand h1{font-size:21px}
  body.owner-mode .owner-kpis{gap:8px}
  body.owner-mode .owner-kpi{min-height:100px;padding:13px;border-radius:17px}
  body.owner-mode .owner-kpi strong{font-size:26px}
  body.owner-mode .ticket{padding:12px 12px 12px 16px;border-radius:15px}
  body.owner-mode .owner-lane{border-radius:17px}
  body.owner-mode .owner-quick-actions{gap:8px!important;padding:10px!important}
  body.owner-mode .owner-quick-actions .quick{min-height:58px;padding:9px 10px}
}
</style>
'''

for file_name, block, marker in [
    ('public/index.html', CUSTOMER, 'customerVisualPolishV3'),
    ('public/desk.html', OWNER, 'ownerVisualPolishV3'),
]:
    p = Path(file_name)
    s = p.read_text()
    if marker in s:
        raise SystemExit(f'{marker} already exists in {file_name}')
    if '</head>' not in s:
        raise SystemExit(f'</head> missing in {file_name}')
    s = s.replace('</head>', block + '\n</head>', 1)
    p.write_text(s)
