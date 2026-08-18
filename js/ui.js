/** Small DOM + interaction helpers shared by every view. */

/** Create an element. `attrs.class`, `attrs.text`, `attrs.html`, on* handlers. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Short-lived message at the bottom of the screen. */
let toastTimer = null;
export function toast(message, kind = 'info') {
  let host = document.getElementById('toast');
  if (!host) {
    host = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  host.textContent = message;
  host.className = `toast toast--${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('is-visible'), 2600);
}

/** Bottom sheet — the mobile-native way to show a form or a menu. */
export function sheet({ title, body, actions = [], dismissible = true }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'sheet-backdrop' });
    const panel = el('div', {
      class: 'sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title || 'Dialog',
    });

    const close = (value) => {
      backdrop.classList.remove('is-open');
      panel.classList.remove('is-open');
      setTimeout(() => {
        backdrop.remove();
        panel.remove();
        document.body.classList.remove('has-sheet');
      }, 220);
      resolve(value);
    };

    panel.appendChild(el('div', { class: 'sheet__grip' }));
    if (title) panel.appendChild(el('h2', { class: 'sheet__title', text: title }));
    const content = el('div', { class: 'sheet__body' });
    if (typeof body === 'string') content.appendChild(el('p', { text: body }));
    else if (body) content.appendChild(body);
    panel.appendChild(content);

    if (actions.length) {
      const row = el('div', { class: 'sheet__actions' });
      for (const action of actions) {
        row.appendChild(
          el('button', {
            class: `btn btn--${action.kind || 'ghost'}`,
            type: 'button',
            text: action.label,
            onclick: () => {
              const result = action.value !== undefined ? action.value : action.label;
              if (action.onClick) {
                const proceed = action.onClick();
                if (proceed === false) return;
              }
              close(result);
            },
          })
        );
      }
      panel.appendChild(row);
    }

    // A menu row always navigates somewhere, so dismiss the sheet as soon as
    // one is tapped — otherwise it stays stacked behind whatever opens next.
    panel.addEventListener('click', (event) => {
      if (event.target.closest('.menu-item')) close(null);
    });

    if (dismissible) backdrop.addEventListener('click', () => close(null));

    document.body.classList.add('has-sheet');
    document.body.append(backdrop, panel);
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      panel.classList.add('is-open');
    });
  });
}

export function confirmSheet(title, message, confirmLabel = 'Delete', kind = 'danger') {
  return sheet({
    title,
    body: message,
    actions: [
      { label: 'Cancel', value: false, kind: 'ghost' },
      { label: confirmLabel, value: true, kind },
    ],
  }).then((v) => v === true);
}

export async function promptSheet(title, { label, value = '', placeholder = '', multiline = false }) {
  const input = multiline
    ? el('textarea', { class: 'input input--area', placeholder, rows: 6 })
    : el('input', { class: 'input', type: 'text', placeholder, value });
  if (multiline) input.value = value;

  const body = el('label', { class: 'field' }, [
    label ? el('span', { class: 'field__label', text: label }) : null,
    input,
  ]);

  const result = await sheet({
    title,
    body,
    actions: [
      { label: 'Cancel', value: null, kind: 'ghost' },
      { label: 'Save', value: 'save', kind: 'primary' },
    ],
  });
  setTimeout(() => input.focus(), 120);
  return result === 'save' ? input.value : null;
}

/** Fire a haptic tick, if the device and the user's settings allow it. */
export function haptic(pattern = 10, enabled = true) {
  if (!enabled) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}

/** Save a Blob to the user's device. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text, filename, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/** Share a file through the OS share sheet, falling back to a download. */
export async function shareFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title || filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

/** Open a file picker and resolve with the chosen File objects. */
export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: accept || null, multiple, style: { display: 'none' } });
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      resolve([...(input.files || [])]);
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    input.click();
  });
}

/* ---------------- formatting ---------------- */

export function formatNumber(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(x, digits = 0) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function formatDuration(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatDate(ts, opts = { month: 'short', day: 'numeric' }) {
  return new Date(ts).toLocaleDateString(undefined, opts);
}

/** "in 3 days" / "2 hours ago" — relative time without a library. */
export function formatRelative(ts, now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units = [
    ['year', 365.25 * 86400000],
    ['month', 30.44 * 86400000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'minute') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return 'now';
}

/** Escape text for safe interpolation into innerHTML. */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}
