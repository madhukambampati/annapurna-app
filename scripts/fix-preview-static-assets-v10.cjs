const fs = require('fs');
const path = 'src/server.ts';
let s = fs.readFileSync(path, 'utf8');
const marker = '  "/desk.js": { file: "desk.js", type: "text/javascript; charset=utf-8" },\n';
if (!s.includes(marker)) throw new Error('ASSETS marker not found');
const extra = [
'  "/heritage-v6.css": { file: "heritage-v6.css", type: "text/css; charset=utf-8" },',
'  "/heritage-v8.css": { file: "heritage-v8.css", type: "text/css; charset=utf-8" },',
'  "/heritage-v9.css": { file: "heritage-v9.css", type: "text/css; charset=utf-8" },',
'  "/assets/heritage-hero-v5.svg": { file: "assets/heritage-hero-v5.svg", type: "image/svg+xml" },',
'  "/assets/combos-v5.svg": { file: "assets/combos-v5.svg", type: "image/svg+xml" },',
'  "/assets/weekly-plans-v5.svg": { file: "assets/weekly-plans-v5.svg", type: "image/svg+xml" },',
'  "/assets/orders-v5.svg": { file: "assets/orders-v5.svg", type: "image/svg+xml" },'
].join('\n') + '\n';
if (!s.includes('"/heritage-v9.css"')) s = s.replace(marker, marker + extra);
fs.writeFileSync(path, s);
