/** Inline SVG icons. `currentColor` throughout so they follow the theme. */

const svg = (paths, opts = {}) =>
  `<svg viewBox="0 0 24 24" fill="${opts.fill || 'none'}" stroke="${opts.stroke || 'currentColor'}" ` +
  `stroke-width="${opts.width || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  decks: svg('<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v11"/>'),
  stats: svg('<path d="M3 20h18"/><rect x="5" y="11" width="3.5" height="6" rx="1"/><rect x="10.2" y="6" width="3.5" height="11" rx="1"/><rect x="15.4" y="13" width="3.5" height="4" rx="1"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  star: svg('<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.5l-5.8 3-1.1-6.45-4.7-4.6 6.5-.95z"/>', { fill: 'currentColor', stroke: 'currentColor', width: 1.5 }),
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>', { width: 2.6 }),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>', { width: 2.6 }),
  half: svg('<path d="M12 3a9 9 0 1 0 0 18z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  back: svg('<path d="M15 19l-7-7 7-7"/>'),
  more: svg('<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>'),
  upload: svg('<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  download: svg('<path d="M12 4v12m0 0l4.5-4.5M12 16l-4.5-4.5"/><path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>'),
  trash: svg('<path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"/>'),
  edit: svg('<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  sparkles: svg('<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  play: svg('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="currentColor"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-.7 4.3"/><path d="M20 4.5V11h-6.2"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>'),
  flame: svg('<path d="M12 22c4 0 6.5-2.7 6.5-6.2 0-4.4-4.3-6.3-3.4-11.3-2.6.9-4.6 3.3-4.6 5.6 0 1.2.4 2 .4 2S9.4 11 8.6 9.4C7 11 5.5 13 5.5 15.8 5.5 19.3 8 22 12 22z"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>'),
  share: svg('<path d="M12 15V3m0 0L8 7m4-4l4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/>'),
  undo: svg('<path d="M4 10h10a5 5 0 0 1 0 10h-3"/><path d="M4 10l4-4M4 10l4 4"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  pause: svg('<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>'),
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = icons[name] || '';
  return span.firstElementChild || span;
}
