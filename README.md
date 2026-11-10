# UACE × PML — POLYMAT UNIFIED

![CI](https://github.com/rtynbirf/uace-polymat/actions/workflows/ci.yml/badge.svg)
![Release](https://img.shields.io/github/v/release/rtynbirf/uace-polymat)

**Единый арсенал POLYMAT**: юзерскрипты для Tampermonkey + Chrome-расширение Cookie Vault (Manifest V3).
Канон проекта: **0 сетевых запросов**, **0 заглушек и эмуляций**, каждая функция исполняется по-настоящему, каждый релиз проходит машинную цепочку проверок.

---

## Состав арсенала

| Продукт | Тип | Версия | SHA-256 (первые байты) | Установка |
|---|---|---|---|---|
| **POLYMAT UNIFIED** | юзерскрипт | v34.3.2 | `18d32676…9e3d48` | [клик-установка](https://rtynbirf.github.io/uace-polymat/userscripts/UACE-POLYMAT-UNIFIED-v34.3.2.user.js) |
| **TXT-EXPORT** (полигон первенца) | юзерскрипт | 1.0.1 | `8b7377de…4bae` | [клик-установка (стабильный канал)](https://rtynbirf.github.io/uace-polymat/userscripts/UACE-TXT-EXPORT.user.js) — **с 1.0.1 канал автообновления работает** |
| **Cookie Vault** | Chrome-расширение (MV3) | 3.0.1 | `b643fa3d…f269` | [Release ZIP](https://github.com/rtynbirf/uace-polymat/releases) → распаковать → `chrome://extensions` → «Загрузить распакованное» |

> TXT-EXPORT: на любом сайте **Alt+T** или пилюля «TXT» справа внизу → честный `.txt` страницы
> (Shadow DOM без границ, гигиена шума, дедупликация, FNV-1a целостность, 0 сеть).

## Канон качества (каждый релиз)

1. **ФАЙЛЫ** — реальный код, без трансформаций.
2. **SYNTAX** — `node --check` на каждом JS-файле.
3. **СТАТИКА** — `validate.py`: 73 проверки (manifest MV3, permissions, PNG IHDR, CSP-гигиена, криптопараметры, опасные конструкции).
4. **КРИПТО** — `crypto_smoke.mjs`: 8 тестов WebCrypto.
5. **АРХИВ** — ZIP → `testzip()` побайтово → сверка состава.
6. **SHA-256** — hashlib и sha256sum кросс-сверка; дайджесты публикуются в Release.

CI выполняет пункты 2–4 на каждом пуше: [actions/workflows/ci.yml](.github/workflows/ci.yml).
**Релизы собираются CI автоматически**: тег `v*` / `txt-export-v*` → [release.yml](.github/workflows/release.yml) верифицирует, пакует детерминированный ZIP, кладёт `checksums.txt` и публикует Release через gh CLI. Все действия запинены по коммит-SHA. Дифф-доказательство релиза 1.0.1: только 3 строки метаданных (@version + @updateURL + @downloadURL), рельсы 30/0.

## Cookie Vault 3.0.1 — криптосхема

| Параметр | Значение |
|---|---|
| Вывод ключа | PBKDF2-SHA256, **600 000** итераций, соль 16 Б случайная |
| Шифрование | **AES-256-GCM** (ключ 256 бит, неэкспортируемый), IV 12 Б случайный |
| Аутентификация | AAD `COOKIE-VAULT-V1`; неверный PIN / подмена шифротекста отклоняются GCM |
| Хранилище | `chrome.storage.local`, 0 сетевых запросов |
| Канон MV3 | `manifest_version: 3`, service worker **ES-модуль** (`type: module`), Chrome ≥ 111, ноль V2-пережитков |

## Структура репозитория

```
userscripts/    — юзерскрипты (байт-в-байт канонические SHA)
cookie-vault/   — исходники расширения (16 файлов) + scripts/ (валидатор и смок-тесты)
verification/   — протоколы машинных проверок релизов
.github/workflows/ci.yml — CI: node --check + validate.py + crypto_smoke
```

## Политика безопасности

- Ни один скрипт/расширение не выполняет сетевых запросов — проверяется статическим валидатором (поиск `fetch`, `XMLHttpRequest`, `WebSocket`, remote `<script>`).
- Секреты (токены GitHub и любые другие) **никогда** не попадают в репозиторий;см. [SECURITY.md](SECURITY.md).
- Канал автообновления юзерскриптов: GitHub Pages + `@updateURL`/`@downloadURL` (порт в метаданные — следующим релизом полигонной линии, логика не трогается).

---

*POLYMAT · Линия UACE × PML · «ТО ЧТО РАБОТАЕТ — НЕ ТРОГАЕМ»*
