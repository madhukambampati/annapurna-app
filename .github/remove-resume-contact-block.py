from pathlib import Path

p = Path("public/app.js")
text = p.read_text()
old = '''        if (e2.status === 409) {
          var mismatch = new Error("This device has a saved chat for a different contact. Enter the same phone number or email used for that chat.");
          mismatch.status = 409;
          throw mismatch;
        }'''
new = '''        if (e2.status === 409) {
          // A different contact must never inherit the previous customer's saved chat.
          // Drop only this browser's stale resume pointer and start a fresh customer session instead.
          store(RESUME_TOKEN_KEY, null);
          token = "";
          return fresh();
        }'''
if old not in text:
    if new in text:
        raise SystemExit("patch already applied")
    raise SystemExit("resume mismatch block not found")
p.write_text(text.replace(old, new, 1))
