#!/usr/bin/env python3
"""Cookie Vault 3.0.1 — статический валидатор проекта (Chrome MV3).

Машинно проверяемый результат: печатает PASS/FAIL по каждой проверке,
exit code 0 = PASS, 1 = FAIL. При FAIL архив не выдаётся.
"""
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

failures = []
checks = 0


def check(name, cond, detail=''):
    global checks
    checks += 1
    ok = bool(cond)
    if not ok:
        failures.append('{0}: {1}'.format(name, detail))
    line = ('PASS  ' if ok else 'FAIL  ') + name
    if detail and not ok:
        line += '  -- ' + str(detail)
    print(line)


def read(path, mode='r'):
    with open(os.path.join(ROOT, path), mode) as f:
        return f.read()


man = json.loads(read('manifest.json'))

# --- manifest ---
check('manifest_version == 3', man.get('manifest_version') == 3, man.get('manifest_version'))
check('version == 3.0.1', man.get('version') == '3.0.1', man.get('version'))
mcv = str(man.get('minimum_chrome_version', ''))
check('minimum_chrome_version >= 111', mcv.isdigit() and int(mcv) >= 111, mcv)

perms = man.get('permissions', [])
for need in ('cookies', 'storage', 'alarms'):
    check('permission "{0}" присутствует'.format(need), need in perms, perms)
check('host_permissions <all_urls> присутствует',
      '<all_urls>' in man.get('host_permissions', []), man.get('host_permissions'))

bg = man.get('background', {})
sw = bg.get('service_worker', '')
check('background.service_worker объявлен', sw == 'background.js', bg)
check('service_worker файл существует',
      bool(sw) and os.path.isfile(os.path.join(ROOT, sw)), sw)
check('service_worker type == module (строгий канон MV3: ES-модуль)',
      bg.get('type') == 'module', bg.get('type'))

# --- package.json (Node-рельсы ESM; Chrome его игнорирует) ---
pkg = json.loads(read('package.json'))
check('package.json type == module', pkg.get('type') == 'module', pkg.get('type'))
check('package.json private == true', pkg.get('private') is True, pkg.get('private'))
check('package.json version == 3.0.1', pkg.get('version') == '3.0.1', pkg.get('version'))

act = man.get('action', {})
pop = act.get('default_popup', '')
check('action.default_popup существует',
      bool(pop) and os.path.isfile(os.path.join(ROOT, pop)), pop)

opt = man.get('options_ui', {}).get('page', '')
check('options_ui.page существует',
      bool(opt) and os.path.isfile(os.path.join(ROOT, opt)), opt)

# --- иконки: существуют, настоящие PNG, правильные размеры ---
icons = man.get('icons', {})
for size in (16, 48, 128):
    p = icons.get(str(size), '')
    detail = p
    okf = False
    okd = False
    try:
        raw = read(p, 'rb')
        okf = raw[:8] == b'\x89PNG\r\n\x1a\n'
        w, h = struct.unpack('>II', raw[16:24])
        okd = (w == size and h == size)
        detail = '{0} -> {1}x{2}'.format(p, w, h)
    except Exception as exc:
        detail = '{0} -> {1}'.format(p, exc)
    check('иконка {0}x{0} существует и настоящий PNG {0}x{0}'.format(size), okf and okd, detail)

# --- content scripts ---
for cs in man.get('content_scripts', []):
    for js in cs.get('js', []):
        check('content_script "{0}" существует'.format(js),
              os.path.isfile(os.path.join(ROOT, js)), js)
    check('content_script {0} имеет matches'.format(cs.get('js', ['?'])),
          bool(cs.get('matches')), cs.get('matches'))

# --- MV3-канон: importScripts запрещён (classic-SW пережиток), ES-экспорт обязателен ---
bg_src = read('background.js')
check('background.js: importScripts отсутствует (канон ES-модуля)', 'importScripts' not in bg_src)
check('background.js: ES-импорт crypto.js присутствует',
      "import { CookieVaultCrypto } from './crypto.js'" in bg_src)

crypto_src = read('crypto.js')
check('crypto.js: ES-экспорт CookieVaultCrypto присутствует',
      'export const CookieVaultCrypto' in crypto_src)
check('crypto.js: нет CommonJS module.exports', 'module.exports' not in crypto_src)

# --- опасные конструкции в JS ---
DANGEROUS_JS = [
    (r'\beval\s*\(', 'eval('),
    (r'new\s+Function\s*\(', 'new Function('),
    (r'document\.write', 'document.write'),
    (r'\.innerHTML\s*=', '.innerHTML ='),
    (r'importScripts\s*\(\s*[\'"]https?:', 'remote importScripts'),
    (r'fetch\s*\(\s*[\'"]https?://', 'remote fetch'),
]
for jf in ['background.js', 'crypto.js', 'content-isolated.js', 'content-main.js', 'popup.js', 'options.js']:
    src = read(jf)
    for pat, label in DANGEROUS_JS:
        check('{0}: нет "{1}"'.format(jf, label), re.search(pat, src) is None)

# --- MV3 CSP-гигиена в HTML ---
for hf in ['popup.html', 'options.html']:
    src = read(hf)
    check('{0}: нет inline <script> без src'.format(hf),
          re.search(r'<script(?![^>]*\bsrc=)[^>]*>', src) is None)
    check('{0}: нет inline on*= обработчиков'.format(hf),
          re.search(r'\son[a-z]+\s*=\s*[\'"]', src) is None)

# --- криптопараметры ---
m = re.search(r'PBKDF2_ITERATIONS\s*=\s*(\d+)', crypto_src)
iters = int(m.group(1)) if m else 0
check('PBKDF2_ITERATIONS >= 600000', iters >= 600000, iters)
check('AES-GCM используется', "'AES-GCM'" in crypto_src)
check('SHA-256 используется', "'SHA-256'" in crypto_src)
check('getRandomValues используется', 'getRandomValues' in crypto_src)

# --- комплектность документации и тестов ---
check('README.md существует', os.path.isfile(os.path.join(ROOT, 'README.md')))
check('scripts/validate.py существует',
      os.path.isfile(os.path.join(ROOT, 'scripts', 'validate.py')))
check('scripts/crypto_smoke.mjs существует',
      os.path.isfile(os.path.join(ROOT, 'scripts', 'crypto_smoke.mjs')))

print()
print('Всего проверок: {0}; провалено: {1}'.format(checks, len(failures)))
if failures:
    print('VALIDATION: FAIL')
    for f in failures:
        print('  - ' + f)
    sys.exit(1)
print('VALIDATION: PASS')
sys.exit(0)
