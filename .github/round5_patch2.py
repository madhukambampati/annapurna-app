from pathlib import Path

p = Path("src/agent.ts")
s = p.read_text()
old = r'''function bulkMenuQuantity(text: string, menu: MenuItem[]): number | null {
  const m = /\b(\d{1,3})\s*(?=[A-Za-z])/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 8 || n >= 500) return null;
  const tt = tokens(text);
  return menu.some((it) => {
    const mt = tokens(it.name.replace(/\s+combo$/i, ""));
    return mt.size > 0 && [...mt].every((t) => tt.has(t));
  }) ? n : null;
}
'''
new = r'''function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bulkMenuQuantity(text: string, menu: MenuItem[]): number | null {
  for (const it of menu) {
    const base = it.name.replace(/\s+combo$/i, "").trim();
    const words = base.split(/\s+/).map(reEscape).join("\\s+");
    const m = new RegExp(`\\b(\\d{1,3})\\s+(?:x\\s+)?${words}\\b`, "i").exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 8 && n < 500) return n;
  }
  return null;
}
'''
if new in s:
    print("already fixed: item-adjacent bulk quantity")
elif old in s:
    p.write_text(s.replace(old, new, 1))
    print("fixed: item-adjacent bulk quantity")
else:
    raise SystemExit("expected bulkMenuQuantity block not found")
