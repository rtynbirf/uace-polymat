/*
 * Cookie Vault 3.0.1 — background service worker (строгий канон MV3: ES-модуль, "type": "module").
 * 0 сети. Все операции локальные: chrome.cookies + chrome.storage.local + WebCrypto (crypto.js, ES-модуль).
 */
import { CookieVaultCrypto } from './crypto.js';

const VAULT_KEY = 'vault';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { confirmDestructive: true, importMode: 'merge' };

/* ---------- utils ---------- */

function getVaultRecord() {
  return chrome.storage.local.get(VAULT_KEY).then((st) => st[VAULT_KEY] || null);
}

function cookieUrl(c) {
  const domain = c.domain && c.domain.charAt(0) === '.' ? c.domain.slice(1) : (c.domain || '');
  return (c.secure ? 'https://' : 'http://') + domain + (c.path || '/');
}

function toSetDetails(c) {
  const details = {
    url: cookieUrl(c),
    name: c.name,
    value: c.value,
    path: c.path || '/'
  };
  if (!c.hostOnly && c.domain) details.domain = c.domain;
  if (c.secure) details.secure = true;
  if (c.httpOnly) details.httpOnly = true;
  if (typeof c.expirationDate === 'number') details.expirationDate = c.expirationDate;
  if (c.sameSite && c.sameSite !== 'unspecified') {
    let ss = c.sameSite;
    if (ss === 'no_restriction' && !c.secure) ss = 'lax';
    details.sameSite = ss;
  }
  return details;
}

async function setCookie(c) {
  try {
    const res = await chrome.cookies.set(toSetDetails(c));
    return !!res;
  } catch (_) {
    return false;
  }
}

/* ---------- handlers ---------- */

async function handleStatus() {
  const record = await getVaultRecord();
  if (!record) return { ok: true, hasVault: false };
  return {
    ok: true,
    hasVault: true,
    total: record.total || null,
    capturedAt: record.capturedAt || record.createdAt || null,
    iterations: record.iterations || null,
    crypto: record.crypto || null,
    kdf: record.kdf || null
  };
}

async function handleExport(pin) {
  if (typeof pin !== 'string' || pin.length < 4) throw new Error('CV_PIN_TOO_SHORT');
  const cookies = await chrome.cookies.getAll({});
  if (!cookies || !cookies.length) throw new Error('CV_NO_COOKIES');
  const payload = {
    capturedAt: new Date().toISOString(),
    total: cookies.length,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      hostOnly: !!c.hostOnly,
      sameSite: c.sameSite || 'unspecified',
      expirationDate: typeof c.expirationDate === 'number' ? c.expirationDate : null,
      session: !c.expirationDate,
      storeId: c.storeId || '0'
    }))
  };
  const record = await CookieVaultCrypto.encryptVault(pin, payload);
  record.total = payload.total;
  record.capturedAt = payload.capturedAt;
  await chrome.storage.local.set({ [VAULT_KEY]: record });
  return { ok: true, total: payload.total, iterations: record.iterations };
}

async function handleImport(pin, mode) {
  if (typeof pin !== 'string' || pin.length < 4) throw new Error('CV_PIN_TOO_SHORT');
  const record = await getVaultRecord();
  if (!record) throw new Error('CV_NO_VAULT');
  const payload = await CookieVaultCrypto.decryptVault(pin, record);
  if (!payload || !Array.isArray(payload.cookies)) throw new Error('CV_BAD_RECORD');

  let removed = 0;
  if (mode === 'replace') {
    const existing = await chrome.cookies.getAll({});
    for (const c of existing) {
      try {
        await chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId });
        removed++;
      } catch (_) { /* cookie could vanish between getAll and remove — not fatal */ }
    }
  }

  let restored = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of payload.cookies) {
    if (!c || !c.name || !c.domain) { skipped++; continue; }
    const okCookie = await setCookie(c);
    if (okCookie) restored++; else failed++;
  }
  return {
    ok: true,
    mode: mode === 'replace' ? 'replace' : 'merge',
    total: payload.cookies.length,
    restored,
    failed,
    skipped,
    removed
  };
}

async function handleVerify(pin) {
  if (typeof pin !== 'string' || pin.length < 4) throw new Error('CV_PIN_TOO_SHORT');
  const record = await getVaultRecord();
  if (!record) throw new Error('CV_NO_VAULT');
  const payload = await CookieVaultCrypto.decryptVault(pin, record);
  return { ok: true, valid: true, total: (payload && payload.total) || null };
}

async function handleWipe() {
  await chrome.storage.local.remove(VAULT_KEY);
  return { ok: true, wiped: true };
}

async function handleHousekeeping() {
  const st = await chrome.storage.local.get([VAULT_KEY, SETTINGS_KEY]);
  const record = st[VAULT_KEY] || null;
  const required = ['v', 'format', 'crypto', 'kdf', 'iterations', 'salt', 'iv', 'ct', 'fingerprint'];
  const missing = record ? required.filter((k) => !(k in record)) : required.slice();
  const settings = Object.assign({}, DEFAULT_SETTINGS, st[SETTINGS_KEY] || {});
  settings.lastHousekeepingAt = new Date().toISOString();
  settings.lastHousekeepingOk = !!record && missing.length === 0;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return { ok: true, hasVault: !!record, integrity: settings.lastHousekeepingOk ? 'PASS' : 'FAIL', missing };
}

/* ---------- wiring ---------- */

chrome.runtime.onInstalled.addListener(async () => {
  const st = await chrome.storage.local.get(SETTINGS_KEY);
  if (!st[SETTINGS_KEY]) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
  chrome.alarms.create('vaultHousekeeping', { periodInMinutes: 60 * 24 * 7 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === 'vaultHousekeeping') {
    handleHousekeeping().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.action) {
        case 'vault:status': sendResponse(await handleStatus()); break;
        case 'vault:export': sendResponse(await handleExport(msg.pin)); break;
        case 'vault:import': sendResponse(await handleImport(msg.pin, msg.mode === 'replace' ? 'replace' : 'merge')); break;
        case 'vault:verify': sendResponse(await handleVerify(msg.pin)); break;
        case 'vault:wipe': sendResponse(await handleWipe()); break;
        case 'vault:housekeeping': sendResponse(await handleHousekeeping()); break;
        case 'bridge:hello': sendResponse({ ok: true }); break;
        default: sendResponse({ ok: false, error: 'CV_UNKNOWN_ACTION' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || 'CV_INTERNAL_ERROR' });
    }
  })();
  return true; /* async response */
});
