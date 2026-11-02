/* T995 display preference: local to this browser; no account or data writes. */
(function () {
  'use strict';
  const key = 't995-display-mode';
  let mode = 'system';
  try { if (localStorage.getItem(key) === 'light') mode = 'light'; } catch (_) {}
  let meta = document.querySelector('meta[name="color-scheme"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'color-scheme'; document.head.appendChild(meta); }
  function apply() {
    const light = mode === 'light';
    document.documentElement.dataset.displayMode = mode;
    document.documentElement.style.colorScheme = light ? 'only light' : 'normal';
    meta.content = light ? 'only light' : 'normal';
    document.querySelectorAll('[data-display-mode-toggle]').forEach(button => {
      button.textContent = light ? '跟隨裝置' : '日間模式';
      button.setAttribute('aria-pressed', String(light));
      button.setAttribute('aria-label', light ? '目前為日間模式，切換為跟隨裝置' : '切換為日間模式，方便拍照');
      button.title = light ? '切回跟隨裝置顯示設定' : '以淺色畫面顯示，方便拍照';
    });
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-display-mode-toggle]').forEach(button => button.addEventListener('click', () => {
      mode = mode === 'light' ? 'system' : 'light';
      try { localStorage.setItem(key, mode); } catch (_) {}
      apply();
    }));
  });
})();
