const fs = require('fs');

const indexPath = 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('/heritage-v11.css')) {
  const marker = '<link rel="stylesheet" href="/heritage-v9.css?v=9">';
  if (!html.includes(marker)) throw new Error('V9 stylesheet marker not found');
  html = html.replace(marker, marker + '\n<link rel="stylesheet" href="/heritage-v11.css?v=11">');
}
fs.writeFileSync(indexPath, html);

const serverPath = 'src/server.ts';
let server = fs.readFileSync(serverPath, 'utf8');
const marker = '  "/heritage-v9.css": { file: "heritage-v9.css", type: "text/css; charset=utf-8" },\n';
if (!server.includes(marker)) throw new Error('server asset marker not found');
const extra = [
  '  "/heritage-v11.css": { file: "heritage-v11.css", type: "text/css; charset=utf-8" },',
  '  "/assets/home-reference-v11.svg": { file: "assets/home-reference-v11.svg", type: "image/svg+xml" },',
  '  "/assets/combos-reference-v11.svg": { file: "assets/combos-reference-v11.svg", type: "image/svg+xml" },',
  '  "/assets/weekly-reference-v11.svg": { file: "assets/weekly-reference-v11.svg", type: "image/svg+xml" },',
  '  "/assets/orders-reference-v11.svg": { file: "assets/orders-reference-v11.svg", type: "image/svg+xml" },'
].join('\n') + '\n';
if (!server.includes('"/heritage-v11.css"')) server = server.replace(marker, marker + extra);
fs.writeFileSync(serverPath, server);
