from pathlib import Path

p = Path('test/web.test.ts')
s = p.read_text()

old = '''      assert.deepEqual(history.map((m: any) => m.text), ["$120", "Yes, we can prepare that for tomorrow."]);'''
new = '''      assert.deepEqual(history.map((m: any) => m.text), ["Annapurna Home Foods quoted $120 for this custom order.", "Yes, we can prepare that for tomorrow."]);'''
assert old in s
s = s.replace(old, new, 1)

old = '''      const h = await call("GET", `/web/history?after=${last}`, { token });
      const owner = h.json.messages.filter((m: any) => m.who === "owner").map((m: any) => m.text);
      assert.equal(owner.length, 3);
      assert.equal(owner[0], "Monday works, see you then!");
      assert.match(owner[1], /confirmed your order #1/);
      assert.match(owner[2], /ready for pickup/);
'''
new = '''      const h = await call("GET", `/web/history?after=${last}`, { token });
      const owner = h.json.messages.filter((m: any) => m.who === "owner").map((m: any) => m.text);
      const system = h.json.messages.filter((m: any) => m.who === "agent").map((m: any) => m.text);
      assert.deepEqual(owner, ["Monday works, see you then!"]);
      assert.equal(system.length, 2);
      assert.match(system[0], /confirmed your order #1/);
      assert.match(system[1], /ready for pickup/);
'''
assert old in s
s = s.replace(old, new, 1)

old = '''      const owner = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "owner");
      assert.match(owner.at(-1).text, /cancelled/);
'''
new = '''      const system = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "agent");
      assert.match(system.at(-1).text, /cancelled/);
'''
assert old in s
s = s.replace(old, new, 1)

old = '''      const last = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "owner").at(-1).text;
      assert.equal(last, `Sorry, order #${id2} has been cancelled.\\nSorry, this dish is sold out for that day.`);'''
new = '''      const last = (await call("GET", "/web/history", { token })).json.messages.filter((m: any) => m.who === "agent").at(-1).text;
      assert.equal(last, `Sorry, order #${id2} has been cancelled.\\nSorry, this dish is sold out for that day.`);'''
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)
