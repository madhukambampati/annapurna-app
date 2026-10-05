from pathlib import Path

p = Path('public/heritage-v11.css')
s = p.read_text()
append = r'''

/* V15 — supplied full-color South Indian hero on the before-login screen too. */
body.customer-mode .header-order-v8{display:none!important}
body.customer-mode .onboard .heroTop{display:none!important}
body.customer-mode .onboard .hero{
  min-height:430px!important;
  padding:270px 28px 28px!important;
  background:
    linear-gradient(180deg,rgba(4,55,38,.02) 0%,rgba(4,55,38,.05) 44%,rgba(4,55,38,.90) 100%),
    url('/assets/vindhu_hero_with_food.png?v=15') center center/cover no-repeat!important;
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
