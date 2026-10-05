const fs = require('fs');

const serverPath = 'src/server.ts';
let server = fs.readFileSync(serverPath, 'utf8');
const marker = '  "/assets/orders-reference-v11.svg": { file: "assets/orders-reference-v11.svg", type: "image/webp" },\n';
if (!server.includes(marker)) throw new Error('asset marker missing');
const extra = [
  '  "/assets/vindhu_hero_with_food.png": { file: "assets/vindhu_hero_with_food.png", type: "image/png" },',
  '  "/assets/combos_photo.png": { file: "assets/combos_photo.png", type: "image/png" },',
  '  "/assets/weekly_plans_photo.png": { file: "assets/weekly_plans_photo.png", type: "image/png" },',
  '  "/assets/food_platter.png": { file: "assets/food_platter.png", type: "image/png" },',
  '  "/assets/garland_left.png": { file: "assets/garland_left.png", type: "image/png" },',
  '  "/assets/icon_orders.png": { file: "assets/icon_orders.png", type: "image/png" },',
  '  "/assets/icon_weekly.png": { file: "assets/icon_weekly.png", type: "image/png" },',
  '  "/assets/lamp_left.png": { file: "assets/lamp_left.png", type: "image/png" },',
  '  "/assets/lamp_right.png": { file: "assets/lamp_right.png", type: "image/png" },'
].join('\n') + '\n';
if (!server.includes('"/assets/vindhu_hero_with_food.png"')) server = server.replace(marker, marker + extra);
fs.writeFileSync(serverPath, server);

const indexPath = 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/\n\s*<button class="header-order-v8"[^>]*>[^<]*(?:<span>[^<]*<\/span>[^<]*)?<\/button>/, '');
fs.writeFileSync(indexPath, html);
