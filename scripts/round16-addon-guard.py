from pathlib import Path
p = Path('src/agent.ts')
s = p.read_text()
old = '''function deterministicFreshDraft(text: string, menu: MenuItem[], now: number, settings: Settings, customerName: string | null): Draft | null {
  if (looksCustom(text, menu)) return null;
  const item = deterministicFreshMenuItem(text, menu);
'''
new = '''function deterministicFreshDraft(text: string, menu: MenuItem[], now: number, settings: Settings, customerName: string | null): Draft | null {
  if (looksCustom(text, menu)) return null;
  const said = tokens(text);
  const mentionsAddon = menu.some((candidate) => candidate.kind === "addon" && [candidate.name, ...candidate.aliases].some((label) => {
    const want = tokens(label);
    return want.size >= 2 && [...want].every((t) => said.has(t));
  }));
  if (mentionsAddon) return null;
  const item = deterministicFreshMenuItem(text, menu);
'''
if old not in s:
    raise SystemExit('deterministicFreshDraft marker not found')
p.write_text(s.replace(old, new, 1))
