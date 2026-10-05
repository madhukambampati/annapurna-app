const fs = require('fs');
const path = 'src/server.ts';
let s = fs.readFileSync(path, 'utf8');
const assets = [
  '/assets/home-reference-v11.svg',
  '/assets/combos-reference-v11.svg',
  '/assets/weekly-reference-v11.svg',
  '/assets/orders-reference-v11.svg',
];
for (const route of assets) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`("${escaped}"\\s*:\\s*\\{\\s*file:\\s*"[^"]+"\\s*,\\s*type:\\s*)"image\\/svg\\+xml"`);
  if (!re.test(s)) throw new Error(`Expected SVG mapping not found for ${route}`);
  s = s.replace(re, '$1"image/webp"');
}
fs.writeFileSync(path, s);
