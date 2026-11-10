/*
 * Cookie Vault 3.0.1 — popup.js
 * Только textContent/createElement — никаких innerHTML. Вся связь с фоном — chrome.runtime.sendMessage.
 */
'use strict';

const ERRORS = {
  CV_WRONG_PIN: 'Неверный PIN.',
  CV_PIN_TOO_SHORT: 'PIN слишком короткий — минимум 4 символа.',
  CV_NO_VAULT: 'Хранилище пусто. Сначала сделайте снимок (экспорт).',
  CV_NO_COOKIES: 'Не найдено ни одного cookie.',
  CV_BAD_RECORD: 'Запись хранилища повреждена или имеет чужой формат.',
  CV_UNKNOWN_ACTION: 'Неизвестная команда.',
  CV_INTERNAL_ERROR: 'Внутренняя ошибка.'
};

const SETTINGS = { confirmDestructive: true };

function el(id) { return document.getElementById(id); }
function fmtError(code) { return ERRORS[code] || ('Ошибка: ' + (code || 'CV_INTERNAL_ERROR')); }
function setStatus(text, kind) { const s = el('status'); s.textContent = text; s.className = 'box' + (kind ? ' ' + kind : ''); }
function getMode() { const r = document.querySelector('input[name="mode"]:checked'); return r ? r.value : 'merge'; }
function readPin() { return el('pin').value; }

async function send(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (!res) throw new Error('CV_INTERNAL_ERROR');
  if (!res.ok) {
    const e = new Error(res.error || 'CV_INTERNAL_ERROR');
    e.code = res.error;
    throw e;
  }
  return res;
}

async function maybeConfirm(text) {
  if (!SETTINGS.confirmDestructive) return true;
  return confirm(text);
}

async function refreshStatus() {
  try {
    const st = await send({ action: 'vault:status' });
    if (!st.hasVault) {
      setStatus('Хранилище пусто.\nСделайте снимок cookies с PIN — он будет зашифрован и сохранён локально.', 'ok');
      el('meta').textContent = '—';
      return;
    }
    setStatus('Хранилище готово.', 'ok');
    el('meta').textContent = [
      'cookies в снимке: ' + (st.total != null ? st.total : '?'),
      'создан: ' + (st.capturedAt ? new Date(st.capturedAt).toLocaleString() : '?'),
      'KDF: ' + (st.kdf || '?') + ' · ' + (st.iterations ? st.iterations.toLocaleString('ru-RU') : '?') + ' итераций',
      'шифр: ' + (st.crypto || '?')
    ].join('\n');
  } catch (e) {
    setStatus(fmtError(e.code || e.message), 'err');
  }
}

async function loadSettings() {
  try {
    const st = await chrome.storage.local.get('settings');
    if (st.settings) SETTINGS.confirmDestructive = st.settings.confirmDestructive !== false;
  } catch (_) { /* настройки по умолчанию */ }
}

function bind() {
  el('btn-export').addEventListener('click', async () => {
    const pin = readPin();
    if (pin.length < 4) return setStatus(ERRORS.CV_PIN_TOO_SHORT, 'err');
    if (!(await maybeConfirm('Сделать снимок ВСЕХ cookies браузера и зашифровать его текущим PIN?'))) return;
    try {
      const r = await send({ action: 'vault:export', pin: pin });
      setStatus('Снимок создан: ' + r.total + ' cookies зашифровано.', 'ok');
      refreshStatus();
    } catch (e) {
      setStatus(fmtError(e.code || e.message), 'err');
    }
  });

  el('btn-restore').addEventListener('click', async () => {
    const pin = readPin();
    if (pin.length < 4) return setStatus(ERRORS.CV_PIN_TOO_SHORT, 'err');
    const mode = getMode();
    if (mode === 'replace') {
      if (!(await maybeConfirm('Режим «заменить всё»: текущие cookies будут УДАЛЕНЫ, затем восстановлены из хранилища. Продолжить?'))) return;
    }
    try {
      const r = await send({ action: 'vault:import', pin: pin, mode: mode });
      setStatus(
        'Восстановлено ' + r.restored + ' из ' + r.total +
        ' (пропущено ' + r.skipped + ', ошибок ' + r.failed +
        (r.removed ? ', удалено перед заменой ' + r.removed : '') + ').',
        'ok'
      );
    } catch (e) {
      setStatus(fmtError(e.code || e.message), 'err');
    }
  });

  el('btn-verify').addEventListener('click', async () => {
    const pin = readPin();
    if (pin.length < 4) return setStatus(ERRORS.CV_PIN_TOO_SHORT, 'err');
    try {
      const r = await send({ action: 'vault:verify', pin: pin });
      setStatus('PIN верен: хранилище расшифровывается (' + (r.total != null ? r.total : '?') + ' cookies).', 'ok');
    } catch (e) {
      setStatus(fmtError(e.code || e.message), 'err');
    }
  });

  el('btn-wipe').addEventListener('click', async () => {
    if (!(await maybeConfirm('Стереть зашифрованное хранилище? Восстановить будет невозможно.'))) return;
    if (!(await maybeConfirm('Точно стереть? Действие необратимо.'))) return;
    try {
      await send({ action: 'vault:wipe' });
      setStatus('Хранилище стёрто.', 'ok');
      refreshStatus();
    } catch (e) {
      setStatus(fmtError(e.code || e.message), 'err');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bind();
  refreshStatus();
});
