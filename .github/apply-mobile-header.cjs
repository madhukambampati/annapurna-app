const fs = require('fs');
const path = 'public/index.html';
let s = fs.readFileSync(path, 'utf8');
const marker = '</style>';
if (!s.includes(marker)) throw new Error('style closing tag not found');
const css = `
/* Final mobile header polish: keep both brand and assistant identity readable without touching nav. */
@media(max-width:520px){
  .customer-mode .brand{min-width:0;max-width:118px}
  .customer-mode .brand h1{font-size:16px;line-height:1.02;white-space:nowrap}
  .customer-mode .brand small{display:block!important;font-size:8.6px;line-height:1.05;white-space:normal;overflow:visible;text-overflow:clip;letter-spacing:0}
  .customer-mode .brand small::after{display:block!important;content:"Vindhu Assistant";margin:2px 0 0;color:var(--brand2);font-size:7.9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
}
`;
if (!s.includes('Final mobile header polish: keep both brand and assistant identity readable without touching nav.')) {
  s = s.replace(marker, css + marker);
  fs.writeFileSync(path, s);
}
