/**
 * Deck detail: due counts, the study button, a card browser and the deck's
 * own action menu.
 */

import {
  el, clear, sheet, toast, confirmSheet, formatRelative, formatNumber, formatPercent,
} from '../ui.js';
import { icon } from '../icons.js';
import { State, STATE_NAMES } from '../fsrs.js';
import { currentRetrievability, formatInterval } from '../scheduler.js';
import { dueCounts, stateBreakdown, deckStats } from '../stats.js';
import { get, cardsForDeck, reviewsForDeck, put, del, uid } from '../store.js';
import { currentSettings } from '../settings.js';
import { CHART_COLORS, proportionBar, legend } from '../charts.js';
import {
  exportDeck, renameDeck, deleteDeck, resetDeckProgress,
  importDeckFiles, pasteDeck, showGeneratorSheet,
} from './decks.js';
import { newCardState } from '../scheduler.js';

export async function renderDeck(container, { navigate, params }) {
  clear(container);
  const settings = currentSettings();
  const deck = await get('decks', params.deckId);

  if (!deck) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('h3', { text: 'Deck not found' }),
      el('button', { class: 'btn btn--ghost', type: 'button', text: 'Back to decks', onclick: () => navigate('decks') }),
    ]));
    return;
  }

  const [cards, reviews] = await Promise.all([cardsForDeck(deck.id), reviewsForDeck(deck.id)]);
  const due = dueCounts(cards, settings);
  const breakdown = stateBreakdown(cards);
  const stats = deckStats(cards, reviews, settings);
  const newShown = Math.min(due.newAvailable, settings.newPerDay);
  const workToday = due.dueToday + newShown;

  container.appendChild(
    el('header', { class: 'view__header' }, [
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Back',
        onclick: () => navigate('decks'),
      }, [icon('back')]),
      el('div', { class: 'grow', style: { minWidth: '0' } }, [
        el('h1', {
          class: 'view__title',
          text: deck.name,
          style: { fontSize: '1.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        }),
        el('p', { class: 'view__subtitle', text: `${breakdown.total} cards` }),
      ]),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Deck options',
        onclick: () => showDeckMenu(deck, { navigate }),
      }, [icon('more')]),
    ])
  );

  /* --- study call to action --- */
  container.appendChild(
    el('div', { class: 'section' }, [
      el('button', {
        class: `btn ${workToday ? 'btn--primary' : 'btn--ghost'} btn--block`,
        type: 'button',
        style: { minHeight: '54px', fontSize: '1rem' },
        onclick: () => navigate('study', { deckId: deck.id }),
      }, [
        icon('play'),
        el('span', {
          text: workToday
            ? `Study ${workToday} card${workToday === 1 ? '' : 's'}`
            : breakdown.total ? 'Nothing due — study anyway' : 'Add cards to begin',
        }),
      ]),
      workToday
        ? el('div', { class: 'row mt-2', style: { justifyContent: 'center', gap: '8px' } }, [
            newShown ? el('span', { class: 'pill pill--new', text: `${newShown} new` }) : null,
            due.learningDue ? el('span', { class: 'pill pill--learn', text: `${due.learningDue} learning` }) : null,
            due.dueToday - due.learningDue > 0
              ? el('span', { class: 'pill pill--due', text: `${due.dueToday - due.learningDue} review` })
              : null,
          ])
        : null,
      breakdown.total - breakdown.suspended >= 2
        ? el('button', {
            class: 'btn btn--ghost btn--block mt-2',
            type: 'button',
            onclick: () => configureExam(deck, breakdown.total - breakdown.suspended, { navigate }),
          }, [icon('edit'), el('span', { text: 'Take an exam' })])
        : null,
    ])
  );

  /* --- composition --- */
  if (breakdown.total) {
    const segments = [
      { label: 'New', value: breakdown.new, color: CHART_COLORS.new },
      { label: 'Learning', value: breakdown.learning + breakdown.relearning, color: CHART_COLORS.learning },
      { label: 'Young', value: breakdown.young, color: CHART_COLORS.young },
      { label: 'Mature', value: breakdown.mature, color: CHART_COLORS.mature },
      { label: 'Suspended', value: breakdown.suspended, color: CHART_COLORS.suspended },
    ];
    container.appendChild(
      el('section', { class: 'section' }, [
        el('h2', { class: 'section__title', text: 'Composition' }),
        el('div', { class: 'card', style: { padding: '14px 16px' } }, [
          proportionBar(segments),
          legend(segments.filter((s) => s.value > 0).map((s) => ({ ...s, count: s.value }))),
        ]),
      ])
    );
  }

  /* --- headline numbers --- */
  container.appendChild(
    el('section', { class: 'section' }, [
      el('h2', { class: 'section__title', text: 'At a glance' }),
      el('div', { class: 'stat-grid' }, [
        stat(formatNumber(stats.totalReviews), 'Reviews'),
        stat(stats.retention.all.rate == null ? '—' : formatPercent(stats.retention.all.rate), 'Retention'),
        stat(stats.averageInterval == null ? '—' : formatInterval(stats.averageInterval * 86400000), 'Avg interval'),
        stat(String(stats.streak.current), 'Day streak'),
      ]),
      el('button', {
        class: 'btn btn--quiet btn--block mt-2',
        type: 'button',
        text: 'Full statistics →',
        onclick: () => navigate('stats', { deckId: deck.id }),
      }),
    ])
  );

  /* --- card browser --- */
  container.appendChild(renderBrowser(cards, deck, { navigate }));
}

function stat(value, label, hint) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__value', text: value }),
    el('div', { class: 'stat__label', text: label }),
    hint ? el('div', { class: 'stat__hint', text: hint }) : null,
  ]);
}

/**
 * Ask how many random questions, then start the exam. Exams sample the whole
 * deck regardless of due dates and never touch the FSRS schedule.
 */
async function configureExam(deck, poolSize, { navigate }) {
  const max = poolSize;
  let count = Math.min(20, max);

  const out = el('output', {
    text: String(count),
    style: { fontSize: '1.6rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums' },
  });
  const slider = el('input', {
    class: 'slider',
    type: 'range',
    min: '1',
    max: String(max),
    step: '1',
    value: String(count),
    'aria-label': 'Number of questions',
  });
  slider.addEventListener('input', () => {
    count = parseInt(slider.value, 10);
    out.textContent = String(count);
  });

  const preset = (n, label) =>
    el('button', {
      class: 'tag-chip',
      type: 'button',
      text: label || String(n),
      onclick: () => { count = n; slider.value = String(n); out.textContent = String(n); },
    });
  const presets = [10, 20, 50].filter((n) => n < max);

  const body = el('div', {}, [
    el('div', { class: 'center mb-4' }, [out, el('div', { class: 'small faint', text: `of ${max} cards, drawn at random` })]),
    slider,
    el('div', { class: 'row row--wrap mt-2', style: { justifyContent: 'center' } }, [
      ...presets.map((n) => preset(n)),
      preset(max, `All ${max}`),
    ]),
    el('p', {
      class: 'small faint mt-4',
      text: 'Swipe right if you got it, left if you missed it. Your score comes at the end — exams never change your review schedule.',
    }),
  ]);

  const action = await sheet({
    title: 'Take an exam',
    body,
    actions: [
      { label: 'Cancel', value: null, kind: 'ghost' },
      { label: 'Start', value: 'start', kind: 'primary' },
    ],
  });
  if (action === 'start') navigate('exam', { deckId: deck.id, n: String(count) });
}

/* ------------------------------------------------------------- browser */

function renderBrowser(cards, deck, { navigate }) {
  const section = el('section', { class: 'section' });
  section.appendChild(
    el('div', { class: 'row mb-2' }, [
      el('h2', { class: 'section__title grow', text: `Cards (${cards.length})`, style: { marginBottom: '0' } }),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        onclick: () => editCard(null, deck, { navigate }),
      }, [icon('plus'), el('span', { text: 'Add' })]),
    ])
  );

  if (!cards.length) {
    section.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '📇' }),
      el('h3', { text: 'No cards in this deck' }),
      el('p', { text: 'Import a .deck file or write a card by hand.' }),
      el('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: () => importDeckFiles({ navigate, deckId: deck.id }),
      }, [icon('upload'), el('span', { text: 'Import cards' })]),
    ]));
    return section;
  }

  const tags = [...new Set(cards.map((c) => c.tag).filter(Boolean))].sort();
  let activeTag = null;
  let query = '';

  const search = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search questions and answers…',
    oninput: (e) => { query = e.target.value.toLowerCase(); paint(); },
  });
  section.appendChild(el('div', { class: 'search-bar' }, [search]));

  let tagRow = null;
  if (tags.length > 1) {
    tagRow = el('div', { class: 'row row--wrap mb-4' });
    section.appendChild(tagRow);
  }

  const list = el('div', { class: 'browse-list' });
  section.appendChild(list);

  const more = el('button', {
    class: 'btn btn--quiet btn--block mt-4',
    type: 'button',
    text: 'Show more',
    onclick: () => { limit += 50; paint(); },
  });
  section.appendChild(more);

  let limit = 30;

  const paint = () => {
    if (tagRow) {
      clear(tagRow);
      const chip = (label, value) =>
        el('button', {
          class: `tag-chip${activeTag === value ? ' is-active' : ''}`,
          type: 'button',
          text: label,
          onclick: () => { activeTag = activeTag === value ? null : value; limit = 30; paint(); },
        });
      tagRow.appendChild(chip('All', null));
      for (const t of tags) tagRow.appendChild(chip(t, t));
    }

    const filtered = cards.filter((c) => {
      if (activeTag && c.tag !== activeTag) return false;
      if (!query) return true;
      return (
        c.question.toLowerCase().includes(query) ||
        c.answer.toLowerCase().includes(query) ||
        (c.extra || '').toLowerCase().includes(query)
      );
    });

    clear(list);
    if (!filtered.length) {
      list.appendChild(el('p', { class: 'center faint small', text: 'No cards match.' }));
      more.style.display = 'none';
      return;
    }

    for (const card of filtered.slice(0, limit)) {
      list.appendChild(renderBrowseCard(card, deck, { navigate }));
    }
    more.style.display = filtered.length > limit ? '' : 'none';
    more.textContent = `Show more (${filtered.length - limit} left)`;
  };

  paint();
  return section;
}

function renderBrowseCard(card, deck, { navigate }) {
  const color = card.suspended
    ? CHART_COLORS.suspended
    : card.state === State.New ? CHART_COLORS.new
    : card.state === State.Review ? CHART_COLORS.review
    : CHART_COLORS.learning;

  return el('button', {
    class: 'browse-card',
    type: 'button',
    onclick: () => showCardSheet(card, deck, { navigate }),
  }, [
    el('span', { class: 'browse-card__state', style: { background: color } }),
    el('span', { class: 'browse-card__body' }, [
      el('span', { class: 'browse-card__q', text: card.question }),
      el('span', { class: 'browse-card__a', text: card.answer }),
    ]),
  ]);
}

/** Detail sheet for a single card, including its FSRS memory state. */
async function showCardSheet(card, deck, { navigate }) {
  const r = currentRetrievability(card);
  const rows = [
    ['State', card.suspended ? 'Suspended' : STATE_NAMES[card.state]],
    ['Due', card.state === State.New ? 'Not scheduled' : formatRelative(card.due)],
    ['Interval', card.scheduledDays ? formatInterval(card.scheduledDays * 86400000) : '—'],
    ['Stability', card.stability ? `${card.stability.toFixed(2)} d` : '—'],
    ['Difficulty', card.difficulty ? `${card.difficulty.toFixed(2)} / 10` : '—'],
    ['Recall now', r == null ? '—' : formatPercent(r, 1)],
    ['Reviews', String(card.reps || 0)],
    ['Lapses', String(card.lapses || 0)],
  ];

  const body = el('div', {}, [
    el('p', { style: { color: 'var(--text)', fontWeight: '600' }, text: card.question }),
    el('p', { text: card.answer }),
    card.extra ? el('p', { class: 'small', style: { fontStyle: 'italic' }, text: card.extra }) : null,
    card.tag ? el('span', { class: 'tag-chip', text: card.tag }) : null,
    el('div', { class: 'setting-group mt-4' },
      rows.map(([label, value]) =>
        el('div', { class: 'setting' }, [
          el('div', { class: 'setting__main' }, [el('div', { class: 'setting__label', text: label })]),
          el('div', { class: 'setting__control' }, [el('span', { class: 'mono small', text: value })]),
        ])
      )
    ),
    el('div', { class: 'menu-list mt-2' }, [
      menuBtn('edit', 'Edit card', () => editCard(card, deck, { navigate })),
      menuBtn(card.suspended ? 'play' : 'pause', card.suspended ? 'Unsuspend' : 'Suspend', async () => {
        await put('cards', { ...card, suspended: !card.suspended });
        toast(card.suspended ? 'Card unsuspended' : 'Card suspended');
        navigate();
      }),
      menuBtn('refresh', 'Reset this card', async () => {
        await put('cards', { ...card, ...newCardState() });
        toast('Card reset to new');
        navigate();
      }),
      menuBtn('trash', 'Delete card', async () => {
        const ok = await confirmSheet('Delete card?', 'This cannot be undone.', 'Delete');
        if (!ok) return;
        await del('cards', card.id);
        toast('Card deleted');
        navigate();
      }, true),
    ]),
  ]);

  return sheet({ title: 'Card', body });
}

function menuBtn(iconName, label, onClick, danger = false) {
  return el('button', {
    class: `menu-item${danger ? ' menu-item--danger' : ''}`,
    type: 'button',
    onclick: () => setTimeout(onClick, 180),
  }, [icon(iconName), el('span', { text: label })]);
}

/** Create or edit a card by hand. */
async function editCard(card, deck, { navigate }) {
  const isNew = !card;
  const q = el('textarea', { class: 'input input--area', rows: 3, style: { minHeight: '72px', fontFamily: 'inherit', fontSize: '1rem' } });
  const a = el('textarea', { class: 'input input--area', rows: 3, style: { minHeight: '72px', fontFamily: 'inherit', fontSize: '1rem' } });
  const tag = el('input', { class: 'input', type: 'text', placeholder: 'sub-topic' });
  const extra = el('textarea', { class: 'input input--area', rows: 3, style: { minHeight: '72px', fontFamily: 'inherit', fontSize: '0.95rem' } });

  q.value = card?.question || '';
  a.value = card?.answer || '';
  tag.value = card?.tag || '';
  extra.value = card?.extra || '';

  const body = el('div', {}, [
    field('Question', q),
    field('Answer', a),
    field('Tag', tag, 'Lowercase sub-topic, reused across the deck.'),
    field('Extra', extra, 'Shown after the answer: the why, a confusion to avoid, a mnemonic.'),
  ]);

  const action = await sheet({
    title: isNew ? 'New card' : 'Edit card',
    body,
    actions: [
      { label: 'Cancel', value: null, kind: 'ghost' },
      { label: 'Save', value: 'save', kind: 'primary' },
    ],
  });
  if (action !== 'save') return;

  if (!q.value.trim() || !a.value.trim()) {
    toast('Question and answer are both required', 'error');
    return;
  }

  const fields = {
    question: q.value.trim(),
    answer: a.value.trim(),
    tag: tag.value.trim().toLowerCase().replace(/\s+/g, '-'),
    extra: extra.value.trim(),
  };

  if (isNew) {
    const existing = await cardsForDeck(deck.id);
    await put('cards', {
      id: uid('card'),
      deckId: deck.id,
      position: existing.length,
      createdAt: Date.now(),
      suspended: false,
      ...newCardState(),
      ...fields,
    });
    toast('Card added', 'success');
  } else {
    await put('cards', { ...card, ...fields });
    toast('Card saved', 'success');
  }
  navigate();
}

function field(label, input, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    input,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
}

/* ------------------------------------------------------------- deck menu */

export function showDeckMenu(deck, { navigate }) {
  return sheet({
    title: deck.name,
    body: el('div', { class: 'menu-list' }, [
      menuBtn('upload', 'Import cards into this deck', () => importDeckFiles({ navigate, deckId: deck.id })),
      menuBtn('edit', 'Paste cards into this deck', () => pasteDeck({ navigate, deckId: deck.id })),
      menuBtn('sparkles', 'Generate more with AI', () => showGeneratorSheet()),
      menuBtn('download', 'Export as .deck', () => exportDeck(deck)),
      menuBtn('stats', 'Statistics', () => navigate('stats', { deckId: deck.id })),
      menuBtn('edit', 'Rename deck', async () => { if (await renameDeck(deck)) navigate(); }),
      menuBtn('refresh', 'Reset all progress', async () => { if (await resetDeckProgress(deck)) navigate(); }, true),
      menuBtn('trash', 'Delete deck', async () => { if (await deleteDeck(deck)) navigate('decks'); }, true),
    ]),
  });
}
