/*
 * Cookie Vault 3.0.1 — options.js
 * Настройки поведения + ручная проверка целостности записи хранилища.
 */
'use strict';

const DEFAULTS = { confirmDestructive: true, importMode: 'merge' };

function el(id) { return document.getElementById(id); }

async function load() {
  const st = await chrome.storage.local.get('settings');
  const s = Object.assign({}, DEFAULTS, st.settings || {});
  el('confirm-destructive').checked = !!s.confirmDestructive;
  el('import-mode').value = s.importMode === 'replace' ? 'replace' : 'merge';
}

async function save() {
  const s = {
    confirmDestructive: el('confirm-destructive').checked,
    importMode: el('import-mode').value === 'replace' ? 'replace' : 'merge'
  };
  await chrome.storage.local.set({ settings: s });
  el('out').textContent = 'Сохранено: ' + new Date().toLocaleTimeString();
}

el('confirm-destructive').addEventListener('change', save);
el('import-mode').addEventListener('change', save);

el('btn-housekeeping').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ action: 'vault:housekeeping' });
  if (!r || !r.ok) {
    el('out').textContent = 'Ошибка проверки.';
    return;
  }
  el('out').textContent = r.hasVault
    ? 'Запись: есть · целостность структуры: ' + r.integrity +
      (r.missing && r.missing.length ? ' · отсутствуют поля: ' + r.missing.join(', ') : ' · все обязательные поля на месте')
    : 'Записи нет — сделайте снимок во всплывающем окне.';
});

document.addEventListener('DOMContentLoaded', load);
