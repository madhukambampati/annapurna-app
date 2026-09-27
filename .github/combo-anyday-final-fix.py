from pathlib import Path

p = Path("src/agent.ts")
t = p.read_text()
old = 'Annapurna Home Foods will confirm availability for your requested pickup day before the order is confirmed.'
new = 'Annapurna Home Foods needs to check availability for your requested pickup day before we can accept this request.'
if old not in t:
    raise SystemExit("availability readback wording not found")
p.write_text(t.replace(old, new, 1))

p = Path("test/agent.test.ts")
t = p.read_text()
old = 'assert.match(r.replies[0]!, /confirm availability for your requested pickup day/);'
new = 'assert.match(r.replies[0]!, /check availability for your requested pickup day/);'
if old not in t:
    raise SystemExit("availability test expectation not found")
p.write_text(t.replace(old, new, 1))

print("final combo availability wording fix applied")
