import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
json_files = [root / 'firebase.json', root / 'firestore.indexes.json']
for path in json_files:
    json.loads(path.read_text(encoding='utf-8'))
    print(f'JSON OK: {path.relative_to(root)}')

js_files = [root / 'functions' / 'index.js']
for path in js_files:
    subprocess.run(['node', '--check', str(path)], check=True)
    print(f'JS OK: {path.relative_to(root)}')

pairs = {'(': ')', '[': ']', '{': '}'}
for path in sorted(root.glob('**/*.dart')):
    text = path.read_text(encoding='utf-8', errors='ignore')
    stack = []
    quote = None
    escaped = False
    for char in text:
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ('\"', "'"):
            quote = char
        elif char in pairs:
            stack.append(pairs[char])
        elif char in pairs.values():
            if not stack or stack.pop() != char:
                raise SystemExit(f'Bracket mismatch: {path}')
    if stack:
        raise SystemExit(f'Unclosed bracket: {path}')
print(f'Dart bracket balance OK: {len(list(root.glob("**/*.dart")))} files')
