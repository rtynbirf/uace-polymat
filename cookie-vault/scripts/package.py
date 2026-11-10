#!/usr/bin/env python3
"""Детерминированный упаковщик (канон POLYMAT): комплектность -> ZIP
с фиксированными таймстампами -> testzip -> повторная сверка -> SHA-256.

Использование:
  python package.py --src cookie-vault --out dist/Cookie-Vault-3.0.1-production.zip [--arcroot cookie-vault-3.0.1]

Любой сбой = exit 1, архив не считается готовым.
"""
import argparse
import hashlib
import os
import sys
import zipfile

FIXED_TS = (2026, 1, 1, 0, 0, 0)

EXPECTED = {
    'manifest.json',
    'background.js',
    'crypto.js',
    'content-isolated.js',
    'content-main.js',
    'popup.html',
    'popup.js',
    'options.html',
    'options.js',
    'README.md',
    'package.json',
    'icons/icon16.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'scripts/validate.py',
    'scripts/crypto_smoke.mjs',
}
# ВАЖНО: package.py — инструмент репозитория, в архив расширения не входит
# (канон артефакта = ровно 16 файлов, как в машинно-верифицированном релизе).


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='каталог исходников расширения')
    ap.add_argument('--out', required=True, help='путь выходного ZIP')
    ap.add_argument('--arcroot', default='cookie-vault-3.0.1', help='корень внутри архива')
    args = ap.parse_args()

    actual = set()
    for root, _dirs, files in os.walk(args.src):
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), args.src).replace(os.sep, '/')
            actual.add(rel)
    missing = EXPECTED - actual
    if missing:
        print('FAIL: отсутствуют обязательные файлы:', sorted(missing))
        sys.exit(1)
    print('COMPLETENESS: PASS ({0} обязательных файлов)'.format(len(EXPECTED)))

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    if os.path.exists(args.out):
        os.remove(args.out)
    with zipfile.ZipFile(args.out, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in sorted(EXPECTED):
            zi = zipfile.ZipInfo(args.arcroot + '/' + rel, FIXED_TS)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o100644 << 16
            with open(os.path.join(args.src, rel), 'rb') as fh:
                z.writestr(zi, fh.read())

    with zipfile.ZipFile(args.out) as z:
        bad = z.testzip()
        if bad is not None:
            print('FAIL: testzip -> повреждён член архива:', bad)
            sys.exit(1)
        names = z.namelist()
        absent = [e for e in sorted(EXPECTED) if (args.arcroot + '/' + e) not in names]
        if absent:
            print('FAIL: в архиве отсутствуют:', absent)
            sys.exit(1)
        file_count = len([n for n in names if not n.endswith('/')])

    size = os.path.getsize(args.out)
    digest = hashlib.sha256(open(args.out, 'rb').read()).hexdigest()
    print('ZIP integrity: PASS (testzip чистый, {0} членов)'.format(file_count))
    print('size bytes: {0}'.format(size))
    print('SHA-256: {0}'.format(digest))


if __name__ == '__main__':
    main()
