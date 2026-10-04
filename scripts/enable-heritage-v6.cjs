const fs = require('fs');
const path = 'public/index.html';
let html = fs.readFileSync(path, 'utf8');
const tag = '<link rel="stylesheet" href="/heritage-v6.css?v=6">';
if (!html.includes(tag)) {
  html = html.replace('</head>', `${tag}\n</head>`);
}
fs.writeFileSync(path, html);
