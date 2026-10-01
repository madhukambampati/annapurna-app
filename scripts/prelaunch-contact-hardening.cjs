const fs = require('fs');
const path = require('path');

function replaceBetween(file, start, end, replacement) {
  let s = fs.readFileSync(file, 'utf8');
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Could not locate patch anchors in ${file}`);
  s = s.slice(0, a) + replacement + '\n' + s.slice(b);
  fs.writeFileSync(file, s);
}

const frontend = String.raw`  function validEmailValue(value) {
    var at = value.indexOf("@");
    if (at <= 0 || at !== value.lastIndexOf("@")) return false;
    var local = value.slice(0, at), domain = value.slice(at + 1);
    if (local.length > 64 || domain.length > 253) return false;
    if (!/^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~.-]+$/.test(local)) return false;
    if (local.charAt(0) === "." || local.charAt(local.length - 1) === "." || local.indexOf("..") !== -1) return false;
    var labels = domain.split(".");
    if (labels.length < 2) return false;
    for (var i = 0; i < labels.length; i++) {
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(labels[i])) return false;
    }
    return /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]);
  }
  function contactValidationError(value) {
    var contact = String(value || "").trim();
    if (!contact) return "Please enter a phone number or email.";
    if (contact.length > 80) return "Phone or email is too long.";
    if (contact.indexOf("@") !== -1) {
      if (!validEmailValue(contact)) return "Please enter a valid email, for example name@example.com.";
      return "";
    }
    if (!/^[+()\-. \d]+$/.test(contact)) return "Please enter a valid Canadian/US phone number, or use your email.";
    var plusCount = (contact.match(/\+/g) || []).length;
    if (plusCount > 1 || (plusCount === 1 && contact.charAt(0) !== "+")) return "The + sign can only appear at the beginning of a phone number.";
    var rawDigits = contact.replace(/\D/g, "");
    if (rawDigits === "12345678890") return "Please enter a real phone number, or use your email.";
    var digits = rawDigits;
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    if (digits.length !== 10) return "Please enter a 10-digit Canadian/US phone number, or use your email.";
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return "Please enter a valid Canadian/US phone number, or use your email.";
    var area = digits.slice(0, 3), exchange = digits.slice(3, 6), line = Number(digits.slice(6));
    if (area.slice(1) === "11" || exchange.slice(1) === "11") return "Please enter a valid Canadian/US phone number, or use your email.";
    if (exchange === "555" && line >= 100 && line <= 199) return "Please enter a real phone number, or use your email.";
    if (/^(\d)\1{9}$/.test(digits) || digits === "1234567890" || digits === "0123456789" || digits === "9876543210") return "Please enter a real phone number, or use your email.";
    return "";
  }`;

replaceBetween('public/app.js', '  function contactValidationError(value) {', '  function setFieldValidation', frontend);

const backend = String.raw`function validEmailContact(value: string): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || domain.length > 253) return false;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~.-]+$/.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return false;
  return /^[A-Za-z]{2,63}$/.test(labels.at(-1)!);
}

/** A syntactically valid email or a plausible Canadian/US (NANP) phone number. */
export function validContact(c: string): boolean {
  const value = c.trim();
  if (value.length < 5 || value.length > 80) return false;
  if (value.includes("@")) return validEmailContact(value);
  if (!/^[+()\-. \d]+$/.test(value)) return false;
  const plusCount = (value.match(/\+/g) ?? []).length;
  if (plusCount > 1 || (plusCount === 1 && !value.startsWith("+"))) return false;
  const rawDigits = value.replace(/\D/g, "");
  if (rawDigits === "12345678890") return false;
  let digits = rawDigits;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return false;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return false;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  const line = Number(digits.slice(6));
  // N11 codes are reserved service codes, not ordinary area/exchange codes.
  if (area.slice(1) === "11" || exchange.slice(1) === "11") return false;
  // NANP reserves 555-0100 through 555-0199 for fictional/example numbers.
  if (exchange === "555" && line >= 100 && line <= 199) return false;
  // Reject only whole-number placeholders. Do not reject legitimate numbers merely because
  // they contain a short sequence such as 234-5678 in the middle.
  if (/^(\d)\1{9}$/.test(digits)) return false;
  if (["1234567890", "0123456789", "9876543210"].includes(digits)) return false;
  return true;
}`;

replaceBetween(
  'src/server.ts',
  '/** A syntactically valid email or a plausible Canadian/US (NANP) phone number. */',
  'function contactKey',
  backend,
);

// Existing tests used NANP's reserved 555-01xx fictional/example range as positive fixtures.
// Change test-only fixture numbers to the structurally valid 804 exchange. Production validation
// remains strict; the identity test below deliberately restores 555-01xx as a negative case.
for (const file of fs.readdirSync('test').filter((f) => f.endsWith('.ts'))) {
  const p = path.join('test', file);
  let s = fs.readFileSync(p, 'utf8');
  s = s.replaceAll('+1 (519) 555 0101', '+1 (519) 804 3658')
       .replaceAll('519-555-0101', '519-804-3658')
       .replaceAll('5195550101', '5198043658')
       .replace(/(\d{3})55501(\d{2})/g, (_m, area, tail) => `${area}80401${tail}`)
       .replace(/(\d{3})-555-01(\d{2})/g, (_m, area, tail) => `${area}-804-01${tail}`)
       .replace(/(\(\d{3}\)\s*)555([ -]?)01(\d{2})/g, (_m, area, sep, tail) => `${area}804${sep}01${tail}`);
  fs.writeFileSync(p, s);
}

const testFile = 'test/web.test.ts';
let tests = fs.readFileSync(testFile, 'utf8');
const testStart = tests.indexOf('test("customer identity validation accepts real values and rejects junk"');
const testEnd = tests.indexOf('describe("web: files and headers"', testStart);
if (testStart < 0 || testEnd < 0) throw new Error('Could not locate identity validation test');
const identityTest = String.raw`test("customer identity validation accepts real values and rejects junk", () => {
  for (const ok of [
    "519-804-3658", "+1 (519) 804 3658", "5192345678", "6478043658",
    "maddy@example.com", "first.last+orders@example.co"
  ]) assert.equal(validContact(ok), true, ok);
  for (const bad of [
    "", "abc", "12345", "not an email@", "a@b", "a@b.c", "519+8043658",
    "1234567890", "12345678890", "1111111111", "0000000000", "5191550101",
    "9112345678", "5199115678", "5195550101", "+1 (123) 456-7890",
    "<b>x</b>@a.com", "test@example..com", "test@-example.com", ".test@example.com", "test@exam_ple.com",
    "1234567890123456", "<script>alert(1)</script>", "x".repeat(81)
  ]) assert.equal(validContact(bad), false, bad);
  for (const ok of ["Asha", "M. Kiran", "Siva-Parvathi", "José", "O'Connor", "Maxy", "M"]) assert.equal(validName(ok), true, ok);
  for (const bad of ["", "1234", "M@xy", "Madhu_1", "<script>alert(1)</script>", "A < B", "x".repeat(61)]) assert.equal(validName(bad), false, bad);
});

`;
tests = tests.slice(0, testStart) + identityTest + tests.slice(testEnd);
fs.writeFileSync(testFile, tests);
