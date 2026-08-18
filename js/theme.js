/** Applies the user's theme + text-size choice to the document root. */

export function applyTheme(settings) {
  const root = document.documentElement;

  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);

  root.style.setProperty('--font-scale', String(settings.fontScale || 1));

  // Keep the phone's status bar in step with the app background.
  const dark = settings.theme === 'dark'
    || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#0d1017' : '#f6f7fb';
}

/** Re-apply on system theme changes while the app is open in 'auto' mode. */
export function watchSystemTheme(getSettings) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    const s = getSettings();
    if (s.theme === 'auto') applyTheme(s);
  };
  mq.addEventListener?.('change', handler);
}
