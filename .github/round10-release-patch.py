from pathlib import Path

# 1) Keep the same price content, but use simple body-font typography.
p = Path('public/index.html')
text = p.read_text()
old_price = '''.dprice{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none;text-align:right}
.dprice .lab{font-size:12px;color:var(--muted)}
.dprice .amt{font:700 20px/1.1 var(--f-display);font-variant-numeric:tabular-nums}
.dprice .amt.alt{font-size:16px;color:var(--brand2)}
.dprice .btn{margin-top:auto}'''
new_price = '''.dprice{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;text-align:right;font-family:var(--f-body)}
.dprice .lab{font-size:13px;line-height:1.25;color:var(--muted)}
.dprice .amt{font:700 17px/1.25 var(--f-body);font-variant-numeric:tabular-nums}
.dprice .amt.alt{font-size:17px;color:var(--brand2)}
.dprice .btn{margin-top:6px}'''
if old_price in text:
    text = text.replace(old_price, new_price, 1)
elif new_price not in text:
    raise SystemExit('pricing CSS block not found')
p.write_text(text)

# 2) Make the owner Chats inbox look brand-new without deleting customer transcripts
# or placed orders. A message-id cutoff is stable even when tests use a mocked clock.
p = Path('src/store.ts')
text = p.read_text()
old_method = '''    this.migrateMenu();
    this.resetOwnerChatsForFreshVindhuLaunch();
  }

  /**
   * One-time fresh-launch cleanup for the owner chat inbox.
   * Orders and customer web sessions are intentionally preserved.
   */
  private resetOwnerChatsForFreshVindhuLaunch(): void {
    const key = "owner_chat_reset_vindhu_20260927";
    const done = this.db.prepare("SELECT 1 FROM kv WHERE key = ?").get(key);
    if (done) return;
    this.db.exec(`
      DELETE FROM messages;
      DELETE FROM drafts;
      UPDATE alerts SET done = 1 WHERE order_id IS NULL;
      UPDATE customers SET profile = '', uncertain_streak = 0;
    `);
    this.kvPut(key, { at: Date.now(), reason: "Fresh Vindhu launch" });
  }
'''
new_method = '''    this.migrateMenu();
    this.initializeFreshVindhuOwnerChat();
  }

  /**
   * One-time launch reset for the owner Chats inbox. Historical customer messages and
   * placed orders remain stored; owner Chats starts after the current highest message id.
   */
  private initializeFreshVindhuOwnerChat(): void {
    const key = "owner_chat_reset_vindhu_20260927";
    const done = this.db.prepare("SELECT 1 FROM kv WHERE key = ?").get(key);
    if (done) return;
    const r = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages").get() as Row;
    const afterMessageId = Number(r.id) || 0;
    this.db.exec(`
      DELETE FROM drafts;
      UPDATE alerts SET done = 1 WHERE order_id IS NULL;
      UPDATE customers SET profile = '', uncertain_streak = 0;
    `);
    this.kvPut(key, { afterMessageId, at: Date.now(), reason: "Fresh Vindhu owner chat launch" });
  }

  /** Owner Chats intentionally hide messages from before the fresh Vindhu launch. */
  ownerChatResetAfterMessageId(): number {
    const r = this.db.prepare("SELECT json FROM kv WHERE key = ?").get("owner_chat_reset_vindhu_20260927") as Row | undefined;
    if (!r) return 0;
    try {
      const v = JSON.parse(String(r.json)) as { afterMessageId?: unknown };
      const n = Number(v.afterMessageId);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }
'''
if old_method in text:
    text = text.replace(old_method, new_method, 1)
elif new_method not in text:
    raise SystemExit('fresh owner chat method not found')
p.write_text(text)

# 3) Apply the owner-only cutoff to the owner customer list and owner message view.
p = Path('src/server.ts')
text = p.read_text()
old_state = '''        if (m === "GET" && path === "/api/state") {
          const customers = store
            .listCustomers()
            .map((c) => ({ waId: c.waId, name: c.name, contact: c.contact, last: store.lastMessage(c.waId) ?? null }))
            .filter((c) => c.last)
            .sort((x, y) => y.last!.id - x.last!.id)
            .slice(0, 100);'''
new_state = '''        if (m === "GET" && path === "/api/state") {
          const ownerChatResetAfterMessageId = store.ownerChatResetAfterMessageId();
          const customers = store
            .listCustomers()
            .map((c) => ({ waId: c.waId, name: c.name, contact: c.contact, last: store.lastMessage(c.waId) ?? null }))
            .filter((c) => c.last && c.last.id > ownerChatResetAfterMessageId)
            .sort((x, y) => y.last!.id - x.last!.id)
            .slice(0, 100);'''
if old_state in text:
    text = text.replace(old_state, new_state, 1)
elif new_state not in text:
    raise SystemExit('owner state block not found')

old_messages = '''          if (m === "GET" && mt[2] === "messages") return send(req, res, 200, { customer: { waId, name: c.name, contact: c.contact }, messages: store.getMessages(waId, 200) });'''
new_messages = '''          if (m === "GET" && mt[2] === "messages") {
            const cutoff = store.ownerChatResetAfterMessageId();
            return send(req, res, 200, { customer: { waId, name: c.name, contact: c.contact }, messages: store.getMessages(waId, 200).filter((x) => x.id > cutoff) });
          }'''
if old_messages in text:
    text = text.replace(old_messages, new_messages, 1)
elif new_messages not in text:
    raise SystemExit('owner messages block not found')
p.write_text(text)
