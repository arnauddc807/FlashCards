/**
 * App shell: a tiny hash router, the tab bar, and first-run setup.
 */

import { el, clear, toast } from './ui.js';
import { icon } from './icons.js';
import { loadSettings, currentSettings } from './settings.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { openDB, getAll } from './store.js';
import { renderDecks } from './views/decks.js';
import { renderDeck } from './views/deck.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { openStudy } from './views/study.js';

const TABS = [
  { id: 'decks', label: 'Decks', icon: 'decks' },
  { id: 'stats', label: 'Stats', icon: 'stats' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const ROUTES = {
  decks: renderDecks,
  deck: renderDeck,
  stats: renderStats,
  settings: renderSettings,
};

/** Which tab is highlighted for a given route. */
const TAB_FOR_ROUTE = { decks: 'decks', deck: 'decks', stats: 'stats', settings: 'settings' };

const app = {
  route: 'decks',
  params: {},
  container: null,
  tabbar: null,
  studySession: null,
};

/* --------------------------------------------------------------- routing */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return { route: 'decks', params: {} };
  const [path, query] = raw.split('?');
  const params = {};
  if (query) {
    for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  }
  const known = Boolean(ROUTES[path]) || path === 'study';
  const route = known ? path : 'decks';
  return { route, params };
}

function hashFor(route, params = {}) {
  const query = new URLSearchParams(params).toString();
  return `#/${route}${query ? `?${query}` : ''}`;
}

/**
 * Navigate. Called with no arguments it re-renders the current route, which is
 * what most mutations want after they finish.
 */
export function navigate(route, params) {
  if (route === undefined) {
    render();
    return;
  }
  const target = hashFor(route, params);
  if (location.hash === target) render();
  else location.hash = target;
}

async function render() {
  const { route, params } = parseHash();
  app.route = route;
  app.params = params;

  // Study is a full-screen overlay rather than a tab.
  if (route === 'study') {
    await enterStudy(params);
    return;
  }

  const renderer = ROUTES[route] || renderDecks;
  try {
    await renderer(app.container, { navigate, params });
  } catch (err) {
    console.error(err);
    clear(app.container);
    app.container.appendChild(
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '⚠️' }),
        el('h3', { text: 'Something went wrong' }),
        el('p', { text: err.message || String(err) }),
        el('button', {
          class: 'btn btn--ghost', type: 'button', text: 'Back to decks',
          onclick: () => navigate('decks'),
        }),
      ])
    );
  }

  updateTabbar();
  app.container.scrollTop = 0;
  window.scrollTo(0, 0);
}

async function enterStudy(params) {
  if (app.studySession) return;
  const deck = (await getAll('decks')).find((d) => d.id === params.deckId);
  if (!deck) { navigate('decks'); return; }

  app.tabbar.style.display = 'none';
  app.studySession = await openStudy(deck, {
    onExit: () => {
      app.studySession = null;
      app.tabbar.style.display = '';
      navigate('deck', { deckId: deck.id });
    },
  });
}

function updateTabbar() {
  const activeTab = TAB_FOR_ROUTE[app.route] || 'decks';
  for (const btn of app.tabbar.children) {
    btn.classList.toggle('is-active', btn.dataset.tab === activeTab);
  }
}

function buildTabbar() {
  const bar = el('nav', { class: 'tabbar', role: 'tablist', 'aria-label': 'Main' });
  for (const tab of TABS) {
    bar.appendChild(
      el('button', {
        class: 'tabbar__item',
        type: 'button',
        role: 'tab',
        dataset: { tab: tab.id },
        onclick: () => navigate(tab.id),
      }, [icon(tab.icon), el('span', { text: tab.label })])
    );
  }
  return bar;
}

/* ----------------------------------------------------------- first run */

/**
 * Seed the sample deck the first time the app opens, so a new user has
 * something to swipe immediately rather than an empty screen.
 */
async function maybeSeedSampleDeck() {
  const { getMeta, setMeta, put, putMany } = await import('./store.js');
  if (await getMeta('seeded', false)) return;
  await setMeta('seeded', true);

  const decks = await getAll('decks');
  if (decks.length) return;

  try {
    const res = await fetch('decks/FSRS_AND_STUDY.deck');
    if (!res.ok) return;
    const text = await res.text();
    const { parseDeckFile, toCardRecords, makeDeck } = await import('./deckfile.js');
    const { cards } = parseDeckFile(text);
    if (!cards.length) return;
    const deck = makeDeck('Spaced Repetition Basics', { description: 'A sample deck — delete it once you have your own.' });
    await put('decks', deck);
    await putMany('cards', toCardRecords(cards, deck.id, 0));
  } catch {
    // Offline or the sample is missing — not worth bothering the user about.
  }
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  await openDB();
  const settings = await loadSettings();
  applyTheme(settings);
  watchSystemTheme(currentSettings);

  app.container = document.getElementById('view');
  app.tabbar = buildTabbar();
  document.getElementById('app').appendChild(app.tabbar);

  await maybeSeedSampleDeck();

  window.addEventListener('hashchange', () => {
    // Leaving study by the back gesture should tear the session down.
    if (app.studySession && parseHash().route !== 'study') {
      app.studySession.destroy();
      app.studySession = null;
      app.tabbar.style.display = '';
    }
    render();
  });

  await render();

  document.getElementById('splash')?.remove();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('splash')?.remove();
  const view = document.getElementById('view');
  if (view) {
    clear(view);
    view.appendChild(
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '⚠️' }),
        el('h3', { text: 'Could not start' }),
        el('p', { text: err.message || String(err) }),
        el('p', { class: 'small faint', text: 'Private browsing can block the local database this app needs.' }),
      ])
    );
  }
});

export { toast };
