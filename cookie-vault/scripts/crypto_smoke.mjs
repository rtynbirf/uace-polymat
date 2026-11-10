/*
 * Cookie Vault 3.0.1 — функциональный smoke-тест криптографии.
 * Требуется Node >= 18. Запуск: node scripts/crypto_smoke.mjs
 * Нативный ESM-импорт того же файла, что грузит service worker (строгий канон MV3).
 */
import { CookieVaultCrypto as CVC } from '../crypto.js';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  const tail = detail ? '  [' + detail + ']' : '';
  if (cond) { passed++; console.log('PASS  ' + name + tail); }
  else { failed++; console.log('FAIL  ' + name + tail); }
}

const SAMPLE = {
  capturedAt: '2026-09-24T00:00:00.000Z',
  total: 2,
  cookies: [
    {
      name: 'sid', value: 'abc123', domain: '.example.com', path: '/',
      secure: true, httpOnly: true, hostOnly: false, sameSite: 'lax',
      expirationDate: 1893456000, session: false, storeId: '0'
    },
    {
      name: 'theme', value: 'dark', domain: 'example.org', path: '/',
      secure: false, httpOnly: false, hostOnly: true, sameSite: 'unspecified',
      expirationDate: null, session: true, storeId: '0'
    }
  ]
};

try {
  // 1. encrypt -> decrypt roundtrip
  const rec = await CVC.encryptVault('correct horse battery', SAMPLE);
  const back = await CVC.decryptVault('correct horse battery', rec);
  check('encrypt -> decrypt roundtrip', JSON.stringify(back) === JSON.stringify(SAMPLE));

  // 2. случайность соли/IV: одинаковый payload -> разный шифротекст
  const rec2 = await CVC.encryptVault('correct horse battery', SAMPLE);
  check('salt/IV randomization', rec.ct !== rec2.ct && rec.salt !== rec2.salt);

  // 3. тот же PIN -> тот же отпечаток
  const f1 = await CVC.fingerprint('pin123');
  const f2 = await CVC.fingerprint('pin123');
  check('same PIN -> same fingerprint', f1 === f2, f1.slice(0, 12) + '...');

  // 4. другой PIN -> другой отпечаток
  const f3 = await CVC.fingerprint('pin124');
  check('different PIN -> different fingerprint', f1 !== f3);

  // 5. неверный PIN -> отказ расшифровки
  let wrongRejected = false;
  try {
    await CVC.decryptVault('Tr0ub4dor&3', rec);
  } catch (e) {
    wrongRejected = e.code === 'CV_WRONG_PIN' || e.message === 'CV_WRONG_PIN';
  }
  check('wrong PIN -> failure', wrongRejected);

  // 6. подмена шифротекста -> отказ (GCM-аутентификация)
  const tampered = Object.assign({}, rec, {
    ct: rec.ct.slice(0, -4) + (rec.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  });
  let tamperRejected = false;
  try {
    await CVC.decryptVault('correct horse battery', tampered);
  } catch (e) {
    tamperRejected = e.code === 'CV_WRONG_PIN' || e.message === 'CV_WRONG_PIN';
  }
  check('tampered ciphertext -> failure', tamperRejected);

  // 7. криптопараметры соответствуют спецификации
  check('PBKDF2_ITERATIONS >= 600000', CVC.PBKDF2_ITERATIONS >= 600000, String(CVC.PBKDF2_ITERATIONS));
  const requiredFields = ['v', 'format', 'crypto', 'kdf', 'iterations', 'salt', 'iv', 'aad', 'ct', 'fingerprint', 'createdAt'];
  check('record fields complete', requiredFields.every((k) => k in rec));
} catch (e) {
  failed++;
  console.log('FAIL  unexpected exception: ' + ((e && e.stack) || e));
}

console.log('crypto smoke: passed=' + passed + ' failed=' + failed);
if (failed > 0) {
  console.log('CRYPTO SMOKE FAIL');
  process.exit(1);
}
console.log('CRYPTO SMOKE PASS');
process.exit(0);
