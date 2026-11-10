#!/usr/bin/env python3
"""CHANGELOG-генератор арсенала POLYMAT (zero-dependency).

Правила Conventional Commits: feat/fix/perf/docs/refactor/chore.
Использование: python gen_changelog.py --tag txt-export-v1.0.2 --out CHANGELOG.md
"""
import argparse
import datetime
import subprocess

SECTIONS = [
    ('feat', 'Фичи'),
    ('fix', 'Фиксы'),
    ('perf', 'Производительность'),
    ('docs', 'Документация'),
    ('refactor', 'Рефактор'),
    ('chore', 'Прочее'),
]


def git_log() -> list:
    raw = subprocess.run(
        ['git', 'log', '--pretty=%H%x1f%s%x1f%h', '-n', '120'],
        capture_output=True, text=True, check=True,
    ).stdout
    out = []
    for line in raw.splitlines():
        parts = line.split('\x1f')
        if len(parts) == 3:
            out.append({'sha': parts[2], 'subject': parts[1]})
    return out


def classify(subject: str) -> str:
    s = subject.lower()
    for key, _title in SECTIONS:
        if s.startswith(key + ':') or s.startswith(key + '('):
            return key
    return 'chore'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', default='', help='имя тега текущего релиза')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    commits = git_log()
    grouped = {key: [] for key, _t in SECTIONS}
    for c in commits:
        grouped[classify(c['subject'])].append('- {0} ({1})'.format(c['subject'], c['sha']))

    lines = [
        '# CHANGELOG — арсенал POLYMAT',
        '',
        'Сгенерирован автоматически из истории коммитов (Conventional Commits).',
        'Текущий релиз: **{0}** · дата сборки: {1} UTC'.format(
            args.tag or '(без тега)', datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M')),
        '',
    ]
    for key, title in SECTIONS:
        if grouped[key]:
            lines.append('## ' + title)
            lines.extend(grouped[key])
            lines.append('')
    if not any(grouped.values()):
        lines.append('(история коммитов пуста)')

    open(args.out, 'w', encoding='utf-8').write('\n'.join(lines))
    print('CHANGELOG written:', args.out, '· commits:', len(commits))


if __name__ == '__main__':
    main()
