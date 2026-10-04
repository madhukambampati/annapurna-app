const fs = require('fs');

const htmlPath = 'public/index.html';
const appPath = 'public/app.js';

let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('/heritage-v9.css?v=9')) {
  const anchor = '<link rel="stylesheet" href="/heritage-v8.css?v=8">';
  if (!html.includes(anchor)) throw new Error('V8 stylesheet anchor not found');
  html = html.replace(anchor, anchor + '\n<link rel="stylesheet" href="/heritage-v9.css?v=9">');
}
fs.writeFileSync(htmlPath, html);

let app = fs.readFileSync(appPath, 'utf8');
const oldBlock = `  function show(which) {\n    $("onboard").hidden = which !== "onboard";\n    $("home").hidden = which !== "home";\n    $("chat").hidden = which !== "chat";`;
const newBlock = `  function show(which) {\n    document.body.setAttribute("data-screen", which);\n    ["onboard", "home", "chat"].forEach(function (id) {\n      var visible = id === which;\n      document.querySelectorAll("#" + id).forEach(function (el) {\n        el.hidden = !visible;\n        el.style.display = visible ? "" : "none";\n      });\n    });`;
if (!app.includes('document.body.setAttribute("data-screen", which);')) {
  if (!app.includes(oldBlock)) throw new Error('show() screen block not found');
  app = app.replace(oldBlock, newBlock);
}
fs.writeFileSync(appPath, app);
