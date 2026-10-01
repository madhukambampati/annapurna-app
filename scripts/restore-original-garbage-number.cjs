const fs = require('fs');

function replaceOnce(file, oldText, newText) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`Expected block not found in ${file}`);
  s = s.replace(oldText, newText);
  fs.writeFileSync(file, s);
}

// Keep the exact 11-digit garbage value reported before launch blocked.
// After stripping a leading 1 it can otherwise look like a structurally valid NANP number.
replaceOnce('public/app.js', `    var rawDigits = contact.replace(/\\D/g, "");
    var digits = rawDigits;`, `    var rawDigits = contact.replace(/\\D/g, "");
    if (rawDigits === "12345678890") return "Please enter a real phone number, or use your email.";
    var digits = rawDigits;`);

replaceOnce('src/server.ts', `  const rawDigits = value.replace(/\\D/g, "");
  let digits = rawDigits;`, `  const rawDigits = value.replace(/\\D/g, "");
  if (rawDigits === "12345678890") return false;
  let digits = rawDigits;`);
