/*
 * Cookie Vault 3.0.1 — content script (MAIN world).
 * Публичный флаг присутствия на странице. Cookie-данных не касается.
 */
'use strict';

(function () {
  if (window.__COOKIE_VAULT_BRIDGE__) return;
  window.__COOKIE_VAULT_BRIDGE__ = { ready: true, version: '3.0.1', side: 'MAIN' };
  window.dispatchEvent(new CustomEvent('cookie-vault:hello', { detail: { version: '3.0.1' } }));
})();
