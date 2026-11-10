/*
 * Cookie Vault 3.0.1 — content script (ISOLATED world).
 * Мост MAIN-world -> extension. Данных cookies не получает и не передаёт: только сигнал присутствия.
 */
'use strict';

(function () {
  if (window.__COOKIE_VAULT_ISOLATED__) return;
  window.__COOKIE_VAULT_ISOLATED__ = true;

  window.addEventListener('cookie-vault:hello', function (ev) {
    try {
      chrome.runtime.sendMessage(
        { action: 'bridge:hello', version: ev && ev.detail && ev.detail.version },
        function () { void chrome.runtime.lastError; }
      );
    } catch (_) { /* context invalidated — молча, это норма при reload расширения */ }
  });
})();
