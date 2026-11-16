"""Build public/links/i18n.js from public/links/lang/*.txt (one line per key, order in _keys.txt)."""
import json, re
d = 'public/links/'
keys = open(d + 'lang/_keys.txt').read().split()
src = open(d + 'i18n.js', encoding='utf8').read()
langs = re.search(r'export const LANGS=(.*?);\n', src).group(1)
T = {}
for l in json.loads(langs):
    L = open(d + f"lang/{l['code']}.txt", encoding='utf8').read().rstrip('\n').split('\n')
    assert len(L) == len(keys) and all(x.strip() for x in L), (l['code'], len(L), len(keys))
    T[l['code']] = dict(zip(keys, L))
out = "// Texts for the Links configurator. Built by scripts/build-links-i18n.py from lang/*.txt.\n"
out += "export const LANGS=" + langs + ";\n"
out += "export const T=" + json.dumps(T, ensure_ascii=False, separators=(',', ':')) + ";\n"
open(d + 'i18n.js', 'w', encoding='utf8').write(out)
print(len(keys), 'keys,', len(T), 'languages')
