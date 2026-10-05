from pathlib import Path

p = Path('public/heritage-v11.css')
s = p.read_text()
old = "background:linear-gradient(90deg,rgba(8,76,52,.98) 0%,rgba(12,92,63,.94) 43%,rgba(11,78,54,.44) 60%,rgba(11,78,54,.05) 76%),url('/assets/heritage-hero-v5.svg') 72% center/cover no-repeat!important;"
new = "background:linear-gradient(180deg,rgba(4,55,38,.04) 0%,rgba(4,55,38,.08) 45%,rgba(4,55,38,.90) 100%),url('/assets/vindhu_hero_with_food.png?v=15') center/cover no-repeat!important;"
if old not in s:
    raise SystemExit('Expected onboarding background rule not found')
s = s.replace(old, new, 1)
append = r'''

/* V15 — supplied full-color South Indian hero on the before-login screen too. */
body.customer-mode .header-order-v8{display:none!important}
body.customer-mode .onboard .heroTop{display:none!important}
body.customer-mode .onboard .hero{
  min-height:430px!important;
  padding:270px 28px 28px!important;
  background-position:center center!important;
  background-size:cover!important;
}
body.customer-mode .onboard .hero::before{display:none!important}
body.customer-mode .onboard .hero h1,
body.customer-mode .onboard .hero h2,
body.customer-mode .onboard .hero p{position:relative!important;z-index:3!important;color:#fff!important;text-shadow:0 2px 12px rgba(0,0,0,.34)!important}
body.customer-mode .onboard .hero .kicker,
body.customer-mode .onboard .hero .eyebrow{position:relative!important;z-index:3!important;color:#ffe0a0!important}
@media(max-width:759px){
  body.customer-mode .onboard .hero{
    min-height:360px!important;
    padding:220px 16px 22px!important;
    background-position:center center!important;
  }
}
'''
if 'V15 — supplied full-color South Indian hero' not in s:
    s += append
p.write_text(s)
