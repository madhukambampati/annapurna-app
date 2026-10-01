const fs = require('fs');

function replaceOnce(file, oldText, newText) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`Expected block not found in ${file}: ${oldText.slice(0, 140)}`);
  s = s.replace(oldText, newText);
  fs.writeFileSync(file, s);
}

// Ordinary orders need routine approval; exception/safety holds keep the stronger "needs you" signal.
replaceOnce('src/agent.ts',
`    await this.d.notifier.notify(
      \`Order #\${order.id} needs approval\`,`,
`    await this.d.notifier.notify(
      flags.length ? \`Order #\${order.id} needs you\` : \`Order #\${order.id} needs approval\`,`);

replaceOnce('test/agent.test.ts',
`  assert.match(r2.replies[0]!, /reach out to you here in this chat/);`,
`  assert.match(r2.replies[0]!, /confirm it here before we start cooking/);`);

replaceOnce('test/agent.test.ts',
`  assert.match(r.replies[0]!, /Order #1 is confirmed/);`,
`  assert.match(r.replies[0]!, /Order #1 has been submitted for Annapurna confirmation/);`);

replaceOnce('test/server.test.ts',
`    assert.equal(s.json.orders[0].status, "cook");`,
`    assert.equal(s.json.orders[0].status, "hold");`);

replaceOnce('test/server.test.ts',
`  test("order status moves follow the allowed steps only", async () => {
    assert.equal((await post("/api/orders/1/status", { status: "done" }, "secret")).status, 400); // cook -> done not allowed
    assert.equal((await post("/api/orders/1/status", { status: "ready", confirm: true }, "secret")).json.order.status, "ready");
    assert.equal((await post("/api/orders/1/status", { status: "done", confirm: true }, "secret")).json.order.status, "done");
    assert.equal((await post("/api/orders/1/status", { status: "cancelled" }, "secret")).status, 400); // done is final
    assert.equal((await post("/api/orders/99/status", { status: "ready" }, "secret")).status, 404);
  });`,
`  test("order status moves follow the allowed steps only", async () => {
    assert.equal((await post("/api/orders/1/status", { status: "done" }, "secret")).status, 400); // hold -> done not allowed
    assert.equal((await post("/api/orders/1/status", { status: "cook" }, "secret")).json.order.status, "cook"); // owner accepts
    assert.equal((await post("/api/orders/1/status", { status: "ready", confirm: true }, "secret")).json.order.status, "ready");
    assert.equal((await post("/api/orders/1/status", { status: "done", confirm: true }, "secret")).json.order.status, "done");
    assert.equal((await post("/api/orders/1/status", { status: "cancelled" }, "secret")).status, 400); // done is final
    assert.equal((await post("/api/orders/99/status", { status: "ready" }, "secret")).status, 404);
  });`);

console.log('Post-launch regression expectations aligned.');
