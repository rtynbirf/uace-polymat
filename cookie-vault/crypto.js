/*
 * Cookie Vault 3.0.1 — crypto.js
 * Чистый ES-модуль (строгий канон MV3): потребители — service worker с "type": "module"
 * и Node-рельсы (package.json type: module). CommonJS-механика не используется.
 * Схема: PIN -> PBKDF2-SHA256 (600000 итераций, соль 16B) -> AES-256-GCM (IV 12B, AAD).
 * 0 сети. Только WebCrypto + getRandomValues.
 */

const VERSION = '3.0.1';
const PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const AAD = 'COOKIE-VAULT-V1';
/* Фиксированная доменная соль для отпечатка PIN: отпечаток детерминирован по PIN,
   проверяется без расшифровки и не является секретом. Соль шифрования — всегда случайная. */
const FINGERPRINT_SALT = 'COOKIE-VAULT-FINGERPRINT-V1';

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('CV_NO_WEBCRYPTO');
  }
  return globalThis.crypto.subtle;
}

function randomBytes(n) {
  const u = new Uint8Array(n);
  globalThis.crypto.getRandomValues(u);
  return u;
}

function b64(bytes) {
  let s = '';
  const v = new Uint8Array(bytes);
  for (let i = 0; i < v.length; i++) {
    s += String.fromCharCode(v[i]);
  }
  return btoa(s);
}

function unb64(str) {
  const s = atob(String(str));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i);
  }
  return out;
}

function toHex(buf) {
  const v = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < v.length; i++) {
    s += v[i].toString(16).padStart(2, '0');
  }
  return s;
}

async function deriveBitsForPin(pin, salt, iterations) {
  const keyMaterial = await subtle().importKey(
    'raw',
    enc.encode(String(pin)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
    keyMaterial,
    KEY_BITS
  );
}

async function deriveKey(pin, salt, iterations) {
  const raw = await deriveBitsForPin(pin, salt, iterations || PBKDF2_ITERATIONS);
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function fingerprint(pin) {
  const bits = await deriveBitsForPin(pin, enc.encode(FINGERPRINT_SALT), PBKDF2_ITERATIONS);
  return toHex(bits.slice(0, 16));
}

async function encryptVault(pin, payload) {
  if (typeof pin !== 'string' || pin.length < 4) {
    throw new Error('CV_PIN_TOO_SHORT');
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const iterations = PBKDF2_ITERATIONS;
  const key = await deriveKey(pin, salt, iterations);
  const plaintext = enc.encode(JSON.stringify(payload));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv, additionalData: enc.encode(AAD) },
    key,
    plaintext
  );
  return {
    v: 1,
    format: 'cookie-vault',
    appVersion: VERSION,
    crypto: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: iterations,
    salt: b64(salt),
    iv: b64(iv),
    aad: AAD,
    ct: b64(ct),
    fingerprint: await fingerprint(pin),
    createdAt: new Date().toISOString()
  };
}

async function decryptVault(pin, record) {
  if (!record || record.format !== 'cookie-vault' || !record.ct) {
    const bad = new Error('CV_BAD_RECORD');
    bad.code = 'CV_BAD_RECORD';
    throw bad;
  }
  const key = await deriveKey(pin, unb64(record.salt), record.iterations);
  let pt;
  try {
    pt = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: unb64(record.iv),
        additionalData: enc.encode(record.aad || AAD)
      },
      key,
      unb64(record.ct)
    );
  } catch (_) {
    const wrong = new Error('CV_WRONG_PIN');
    wrong.code = 'CV_WRONG_PIN';
    throw wrong;
  }
  return JSON.parse(dec.decode(pt));
}

export const CookieVaultCrypto = {
  VERSION: VERSION,
  PBKDF2_ITERATIONS: PBKDF2_ITERATIONS,
  SALT_BYTES: SALT_BYTES,
  IV_BYTES: IV_BYTES,
  AAD: AAD,
  deriveKey: deriveKey,
  fingerprint: fingerprint,
  encryptVault: encryptVault,
  decryptVault: decryptVault,
  b64: b64,
  unb64: unb64,
  toHex: toHex,
  randomBytes: randomBytes
};
