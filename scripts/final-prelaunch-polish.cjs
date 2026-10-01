const fs = require('fs');

function replaceOnce(file, oldText, newText) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`Expected block not found in ${file}`);
  s = s.replace(oldText, newText);
  fs.writeFileSync(file, s);
}

// Frontend: keep legitimate short/unusual names, but reject clearly malformed punctuation.
replaceOnce('public/app.js', `  function nameValidationError(value) {
    var name = String(value || "").trim();
    if (!name) return "Please enter your name.";
    if (name.length > 60) return "Name must be 60 characters or less.";
    if (!/^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\u2019-]*$/u.test(name)) return "Please use letters only. Spaces, hyphens, apostrophes and periods are allowed.";
    return "";
  }`, `  function nameValidationError(value) {
    var name = String(value || "").trim();
    if (!name) return "Please enter your name.";
    if (name.length > 60) return "Name must be 60 characters or less.";
    if (!/^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\u2019-]*$/u.test(name)) return "Please use letters only. Spaces, hyphens, apostrophes and periods are allowed.";
    if (/(?:[.'\\u2019-]\\s*){2,}/u.test(name)) return "Please remove repeated punctuation from your name.";
    if (/[.'\\u2019-]$/.test(name) && !/^[\\p{L}\\p{M}]\\.$/u.test(name)) return "Please enter your name without trailing punctuation.";
    return "";
  }`);

// The 11-digit typo/special case is already rejected by the length/country-code rules.
replaceOnce('public/app.js', `    var rawDigits = contact.replace(/\\D/g, "");
    if (rawDigits === "12345678890") return "Please enter a real phone number, or use your email.";
    var digits = rawDigits;`, `    var rawDigits = contact.replace(/\\D/g, "");
    var digits = rawDigits;`);

// Clear the post-delete notice as soon as the customer starts entering new details.
replaceOnce('public/app.js', `  function clearResolvedStartError() {
    var err = $("startErr");
    if (!err || !/^Please fix the highlighted field/.test(err.textContent || "")) return;
    if (!nameValidationError($("fName").value) && !contactValidationError($("fContact").value)) err.textContent = "";
  }`, `  function clearResolvedStartError() {
    var err = $("startErr");
    if (!err) return;
    if (err.textContent === "Your chat was deleted.") { err.textContent = ""; return; }
    if (!/^Please fix the highlighted field/.test(err.textContent || "")) return;
    if (!nameValidationError($("fName").value) && !contactValidationError($("fContact").value)) err.textContent = "";
  }`);

replaceOnce('public/app.js', `  $("fContact").addEventListener("input", function () {
    if ($("fContact").getAttribute("aria-invalid") === "true") setFieldValidation("fContact", "fContactErr", contactValidationError($("fContact").value));
    clearResolvedStartError();
  });

  $("startForm").addEventListener("submit", function (e) {`, `  $("fContact").addEventListener("input", function () {
    if ($("fContact").getAttribute("aria-invalid") === "true") setFieldValidation("fContact", "fContactErr", contactValidationError($("fContact").value));
    clearResolvedStartError();
  });
  $("fConsent").addEventListener("change", clearResolvedStartError);

  $("startForm").addEventListener("submit", function (e) {`);

replaceOnce('public/app.js', `    var name = $("fName").value.trim(), contact = $("fContact").value.trim();`, `    var name = $("fName").value.trim().replace(/\\s+/g, " "), contact = $("fContact").value.trim();
    $("fName").value = name;`);

// Backend: mirror name punctuation rules.
replaceOnce('src/server.ts', `export function validName(n: string): boolean {
  const value = n.trim();
  return value.length > 0
    && value.length <= 60
    && /^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\u2019-]*$/u.test(value);
}`, `export function validName(n: string): boolean {
  const value = n.trim();
  return value.length > 0
    && value.length <= 60
    && /^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\u2019-]*$/u.test(value)
    && !/(?:[.'\\u2019-]\\s*){2,}/u.test(value)
    && (!/[.'\\u2019-]$/.test(value) || /^[\\p{L}\\p{M}]\\.$/u.test(value));
}`);

// Remove redundant typo-specific phone check.
replaceOnce('src/server.ts', `  const rawDigits = value.replace(/\\D/g, "");
  if (rawDigits === "12345678890") return false;
  let digits = rawDigits;`, `  const rawDigits = value.replace(/\\D/g, "");
  let digits = rawDigits;`);

// Give backend callers the same useful contact error the form gives.
replaceOnce('src/server.ts', `          const name = cleanText(b.name, 61);
          const contact = cleanText(b.contact, 80);
          if (!validName(name)) throw new HttpError(400, "Please enter a valid name.");
          if (!validContact(contact)) throw new HttpError(400, "Please enter a phone number or email so Annapurna Home Foods can reach you.");
          if (b.consent !== true) throw new HttpError(400, "Please tick the box to continue.");`, `          const name = cleanText(b.name, 61).replace(/\\s+/g, " ");
          const contact = cleanText(b.contact, 80);
          if (!validName(name)) throw new HttpError(400, "Please enter a valid name.");
          if (!validContact(contact)) throw new HttpError(400, contact.includes("@") ? "Please enter a valid email, for example name@example.com." : "Please enter a valid Canadian/US phone number, or use your email.");
          if (b.consent !== true) throw new HttpError(400, "Please tick the box to continue.");`);

// Session path: invalid attempts get a generous per-minute attempt cap, but do not consume the 6/hour valid new-chat quota.
replaceOnce('src/server.ts', `        if (m === "POST" && path === "/web/session") {
          limit(\`sess:\${ip}\`, w.sessionsPerIpHour, HOUR);
          const b = await readJson(req);
          const name = cleanText(b.name, 61);
          const contact = cleanText(b.contact, 80);
          if (!validName(name)) throw new HttpError(400, "Please enter a valid name.");
          if (!validContact(contact)) throw new HttpError(400, "Please enter a phone number or email so Annapurna Home Foods can reach you.");
          if (b.consent !== true) throw new HttpError(400, "Please tick the box to continue.");
          const waId = \`web:\${randomBytes(8).toString("hex")}\`;`, `        if (m === "POST" && path === "/web/session") {
          // Invalid typos should not consume the hourly new-chat quota, while this broad cap still blocks request floods.
          limit(\`sess-attempt:\${ip}\`, 60, 60_000);
          const b = await readJson(req);
          const name = cleanText(b.name, 61).replace(/\\s+/g, " ");
          const contact = cleanText(b.contact, 80);
          if (!validName(name)) throw new HttpError(400, "Please enter a valid name.");
          if (!validContact(contact)) throw new HttpError(400, contact.includes("@") ? "Please enter a valid email, for example name@example.com." : "Please enter a valid Canadian/US phone number, or use your email.");
          if (b.consent !== true) throw new HttpError(400, "Please tick the box to continue.");
          limit(\`sess:\${ip}\`, w.sessionsPerIpHour, HOUR);
          const waId = \`web:\${randomBytes(8).toString("hex")}\`;`);

// Tests: preserve legitimate initials/unusual names, cover malformed punctuation and normalized spaces.
const testFile = 'test/web.test.ts';
let tests = fs.readFileSync(testFile, 'utf8');
replaceOnce(testFile, `  for (const ok of ["Asha", "M. Kiran", "Siva-Parvathi", "José", "O'Connor", "Maxy", "M"]) assert.equal(validName(ok), true, ok);
  for (const bad of ["", "1234", "M@xy", "Madhu_1", "<script>alert(1)</script>", "A < B", "x".repeat(61)]) assert.equal(validName(bad), false, bad);`, `  for (const ok of ["Asha", "M. Kiran", "Siva-Parvathi", "José", "O'Connor", "Maxy", "M", "M.", "Madhu Babu"]) assert.equal(validName(ok), true, ok);
  for (const bad of ["", "1234", "M@xy", "Madhu_1", "Madhu ..", "Madhu - - Babu", "Ravi-", "<script>alert(1)</script>", "A < B", "x".repeat(61)]) assert.equal(validName(bad), false, bad);`);

// Add a focused regression for invalid-attempt quota behavior and backend error specificity.
tests = fs.readFileSync(testFile, 'utf8');
const anchor = `  test("returning customer resume bypasses an exhausted new-chat IP quota", () =>`;
if (!tests.includes(anchor)) throw new Error('Could not locate abuse-limit insertion anchor');
const extra = `  test("invalid signup attempts do not consume the hourly new-chat quota", () =>\n    withRig(async ({ call }) => {\n      for (let i = 0; i < 5; i++) {\n        const badPhone = await call("POST", "/web/session", { body: { name: "Asha", contact: "1234567890", consent: true } });\n        assert.equal(badPhone.status, 400);\n        assert.match(badPhone.json.error, /valid Canadian\\/US phone/i);\n      }\n      const badEmail = await call("POST", "/web/session", { body: { name: "Asha", contact: "test@example..com", consent: true } });\n      assert.equal(badEmail.status, 400);\n      assert.match(badEmail.json.error, /valid email/i);\n      const valid = await call("POST", "/web/session", { body: { name: "Madhu  Babu", contact: "2267894561", consent: true } });\n      assert.equal(valid.status, 200);\n      assert.equal(valid.json.name, "Madhu Babu");\n      const blocked = await call("POST", "/web/session", { body: { name: "Bala", contact: "2267894562", consent: true } });\n      assert.equal(blocked.status, 429);\n    }, { web: { sessionsPerIpHour: 1 } }));\n\n`;
tests = tests.replace(anchor, extra + anchor);
fs.writeFileSync(testFile, tests);
