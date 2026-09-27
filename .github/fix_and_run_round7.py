from pathlib import Path
import runpy

p = Path('.github/custom_state_round7_patch.py')
s = p.read_text()
old = r"don\\'?t"
new = r"don\\\'?t"
if old in s:
    p.write_text(s.replace(old, new, 1))
    print('repaired patch-script quote escaping')
else:
    print('patch-script quote escaping already repaired')
runpy.run_path(str(p), run_name='__main__')
