# Cookie Vault 3.0.1

Расширение Chrome MV3: зашифрованное резервное хранилище cookies браузера.
Снимок всех cookies шифруется по PIN и хранится локально; в любой момент восстанавливается обратно (слияние или полная замена).

**Канон Manifest V3 соблюдён строго:**

- `"manifest_version": 3`; service worker объявлен как ES-модуль: `"background": {"service_worker": ..., "type": "module"}` — современная рекомендованная форма, без `importScripts`;
- `action` (не V2 `browser_action`), отдельный блок `host_permissions`, никаких `persistent`/`webRequestBlocking`;
- контент-скрипт в `"world": "MAIN"` — возможность именно MV3 (отсюда минимум Chrome 111; Яндекс.Браузер/Edge/Opera на Chromium ≥ 111 совместимы);
- ноль remote code: весь код упакован локально, CSP MV3 по умолчанию не тронут.

**Приватность: 0 сетевых запросов.** Ни телеметрии, ни аналитики, ни CDN — только `chrome.cookies`, `chrome.storage.local`, `chrome.alarms` и WebCrypto.

## Возможности

- **Снимок (экспорт)** — все cookies текущего профиля собираются через `chrome.cookies.getAll({})`, упаковываются в JSON и шифруются: AES-256-GCM, ключ из PIN через PBKDF2-SHA256 (600 000 итераций, свежая 16-байтная соль на каждый снимок).
- **Восстановление (импорт)** — два режима: `слияние` (поверх текущих) и `заменить всё` (текущие cookies удаляются, затем восстанавливается снимок).
- **Проверка PIN** — расшифровка контрольного доступа без выдачи содержимого; неверный PIN отклоняется аутентификацией GCM.
- **Стирание хранилища** — двойное подтверждение, необратимо.
- **Обслуживание** — еженедельный будильник `chrome.alarms` проверяет структуру записи; то же доступно вручную на странице настроек.
- **Мост MAIN-world** — контент-скрипты лишь сигнализируют присутствие (`window.__COOKIE_VAULT_BRIDGE__`), данных cookies не касаются.

## Установка

1. Распаковать архив так, чтобы внутри была папка `cookie-vault-3.0.1/`.
2. Открыть `chrome://extensions`, включить **Режим разработчика**.
3. **Load unpacked** → выбрать папку `cookie-vault-3.0.1`.
4. Закрепить иконку, открыть popup, задать PIN (минимум 4 символа) и сделать снимок.

Минимальная версия Chrome — 111 (нужна для контент-скрипта в `world: "MAIN"`); Яндекс.Браузер, Edge и Opera на Chromium ≥ 111 совместимы.

## Криптографическая схема

| Параметр | Значение |
|---|---|
| KDF | PBKDF2-HMAC-SHA256 |
| Итерации | 600 000 |
| Соль шифрования | 16 байт, случайная на каждый экспорт (`getRandomValues`) |
| Шифр | AES-256-GCM, ключ 256 бит, ключ неэкспортируемый |
| IV | 12 байт, случайный на каждый экспорт |
| AAD | `COOKIE-VAULT-V1` (привязка записи к формату) |
| Отпечаток PIN | PBKDF2-SHA256 с фиксированной доменной солью, 128 бит hex |

Неверный PIN → другой ключ → GCM-аутентификация падает → `CV_WRONG_PIN`. Подмена шифротекста обнаруживается тем же механизмом.

Отпечаток PIN детерминирован по PIN (проверка без расшифровки) и **не является секретом**: он не позволяет восстановить PIN, но допускает офлайн-перебор держателем записи. Это осознанный компромисс для локального хранилища.

## Формат записи (`chrome.storage.local` → ключ `vault`)

```json
{
  "v": 1,
  "format": "cookie-vault",
  "crypto": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "<base64, 16 байт>",
  "iv": "<base64, 12 байт>",
  "aad": "COOKIE-VAULT-V1",
  "ct": "<base64 шифротекст>",
  "fingerprint": "<hex, 32 символа>",
  "total": 123,
  "capturedAt": "ISO-8601",
  "createdAt": "ISO-8601"
}
```

Внутри шифротекста: `{ capturedAt, total, cookies: [ { name, value, domain, path, secure, httpOnly, hostOnly, sameSite, expirationDate, session, storeId } ] }`.

При импорте корректно обрабатываются: `hostOnly` (домен не передаётся), сессионные cookies (`expirationDate` не передаётся), `sameSite: no_restriction` без `secure` понижается до `lax` (требование Chrome).

## Структура проекта

```
cookie-vault-3.0.1/
├── manifest.json          MV3, Chrome ≥ 111, service worker type: module
├── background.js          ES-модуль service worker: команды, экспорт/импорт, обслуживание
├── crypto.js              ES-модуль криптографии (SW + Node-рельсы, единый код)
├── package.json           type: module — рельсы Node (Chrome игнорирует)
├── content-isolated.js    ISOLATED-мост
├── content-main.js        MAIN-world флаг присутствия
├── popup.html / popup.js  UI: снимок, восстановление, проверка PIN, стирание
├── options.html / options.js  настройки + ручная проверка целостности
├── README.md
├── icons/                 icon16/48/128.png
└── scripts/
    ├── validate.py        статический валидатор проекта
    └── crypto_smoke.mjs   функциональный smoke-тест криптографии (Node ≥ 18)
```

## Проверки

```bash
node --check background.js && node --check crypto.js && node --check popup.js \
  && node --check options.js && node --check content-isolated.js && node --check content-main.js
python3 scripts/validate.py          # VALIDATION: PASS
node scripts/crypto_smoke.mjs        # CRYPTO SMOKE PASS
```

## Ограничения и совместимость

- Cookies оперируют в рамках текущего профиля; cookies других профилей недоступны.
- Partitioned (CHIPS) cookies с `storeId` вне хранилища по умолчанию ставятся в `storeId: 0`; часть сторонних партиционированных cookies может быть пропущена Chrome при установке — счётчик `skipped/failed` это покажет.
- Сессионные cookies после восстановления остаются сессионными — это их природа.
- Расширение намеренно не хранит PIN и не держит ключ в памяти дольше одной операции: service worker штата «разблокировано» не имеет.
