from pathlib import Path
import runpy

# First repair the quote escaping and apply the full Round 7 patch.
runpy.run_path('.github/fix_and_run_round7.py', run_name='__main__')

# TypeScript intentionally forgets the draft.custom narrowing after draft is reassigned
# by clearCustomQuote(). Optional chaining keeps the runtime guard explicit and safe.
p = Path('src/agent.ts')
s = p.read_text()
old1 = '      if (draft.custom.price != null && draft.pickup_local && customQuoteIsCurrent(draft)) {'
new1 = '      if (draft.custom?.price != null && draft.pickup_local && customQuoteIsCurrent(draft)) {'
old2 = '          draft.custom.price == null ? "the final price" : "",'
new2 = '          draft.custom?.price == null ? "the final price" : "",'
if old1 not in s or old2 not in s:
    raise SystemExit('missing generated TypeScript narrowing targets')
s = s.replace(old1, new1, 1).replace(old2, new2, 1)
p.write_text(s)
print('fixed: TypeScript custom draft narrowing')
