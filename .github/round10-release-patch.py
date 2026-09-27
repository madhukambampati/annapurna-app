from pathlib import Path

# Keep the same pricing content, but make the price typography plain/basic.
p = Path('public/index.html')
text = p.read_text()
old = '''.dprice{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none;text-align:right}
.dprice .lab{font-size:12px;color:var(--muted)}
.dprice .amt{font:700 20px/1.1 var(--f-display);font-variant-numeric:tabular-nums}
.dprice .amt.alt{font-size:16px;color:var(--brand2)}
.dprice .btn{margin-top:auto}'''
new = '''.dprice{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;text-align:right;font-family:var(--f-body)}
.dprice .lab{font-size:13px;line-height:1.25;color:var(--muted)}
.dprice .amt{font:700 17px/1.25 var(--f-body);font-variant-numeric:tabular-nums}
.dprice .amt.alt{font-size:17px;color:var(--brand2)}
.dprice .btn{margin-top:6px}'''
if old not in text:
    raise SystemExit('pricing CSS block not found')
p.write_text(text.replace(old, new, 1))

# One-time fresh-launch owner chat reset. Orders and customer web sessions stay intact.
p = Path('src/store.ts')
text = p.read_text()
old = '''    this.migrateMenu();
  }

  /** One-time refresh of combo names and prices when MENU_VERSION goes up. */'''
new = '''    this.migrateMenu();
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

  /** One-time refresh of combo names and prices when MENU_VERSION goes up. */'''
if old not in text:
    raise SystemExit('store constructor insertion point not found')
p.write_text(text.replace(old, new, 1))
