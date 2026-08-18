/**
 * Statistics view. Works either across every deck or scoped to one, and tries
 * to answer three questions: how much have I done, how well is it sticking,
 * and how much work is coming.
 */

import { el, clear, formatNumber, formatPercent, formatDuration, formatDate, sheet } from '../ui.js';
import { icon } from '../icons.js';
import { getAll, cardsForDeck, reviewsForDeck, get } from '../store.js';
import { currentSettings } from '../settings.js';
import { deckStats, leeches, MATURE_THRESHOLD_DAYS } from '../stats.js';
import { formatInterval, DAY } from '../scheduler.js';
import { stackedBarChart, legend, donut, CHART_COLORS, proportionBar } from '../charts.js';

export async function renderStats(container, { navigate, params }) {
  clear(container);
  const settings = currentSettings();
  const deckId = params?.deckId || null;

  const deck = deckId ? await get('decks', deckId) : null;
  const [cards, reviews] = deckId
    ? await Promise.all([cardsForDeck(deckId), reviewsForDeck(deckId)])
    : await Promise.all([getAll('cards'), getAll('reviews')]);

  const decks = await getAll('decks');
  const stats = deckStats(cards, reviews, settings);

  /* --- header --- */
  container.appendChild(
    el('header', { class: 'view__header' }, [
      deck
        ? el('button', {
            class: 'icon-btn', type: 'button', 'aria-label': 'Back',
            onclick: () => navigate('deck', { deckId }),
          }, [icon('back')])
        : null,
      el('div', { class: 'grow' }, [
        el('h1', { class: 'view__title', text: 'Statistics', style: deck ? { fontSize: '1.35rem' } : {} }),
        el('p', {
          class: 'view__subtitle',
          text: deck ? deck.name : `All decks · ${decks.length} deck${decks.length === 1 ? '' : 's'}`,
        }),
      ]),
      decks.length > 1
        ? el('button', {
            class: 'icon-btn', type: 'button', 'aria-label': 'Choose deck',
            onclick: () => chooseDeck(decks, deckId, navigate),
          }, [icon('decks')])
        : null,
    ])
  );

  if (!cards.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '📊' }),
      el('h3', { text: 'No data yet' }),
      el('p', { text: 'Statistics appear once you have cards and have started reviewing.' }),
    ]));
    return;
  }

  /* --- today --- */
  container.appendChild(
    section('Today', [
      el('div', { class: 'stat-grid' }, [
        tile(String(stats.today.total), 'Reviewed'),
        tile(
          stats.today.total
            ? formatPercent((stats.today.total - stats.today.again) / stats.today.total)
            : '—',
          'Recalled'
        ),
        tile(formatDuration(stats.today.timeMs), 'Time'),
        tile(
          `${stats.streak.current}`,
          'Day streak',
          stats.streak.longest > stats.streak.current ? `best ${stats.streak.longest}` : null
        ),
      ]),
    ])
  );

  /* --- workload --- */
  container.appendChild(
    section('Due', [
      el('div', { class: 'stat-grid' }, [
        tile(String(stats.due.dueNow), 'Due now'),
        tile(String(stats.due.dueToday), 'Due today'),
        tile(String(stats.due.newAvailable), 'New waiting'),
        tile(formatNumber(stats.reviewsPerDay30, 1), 'Reviews/day', 'last 30 days'),
      ]),
    ])
  );

  /* --- card mix --- */
  const mix = [
    { label: 'New', value: stats.breakdown.new, color: CHART_COLORS.new },
    { label: 'Learning', value: stats.breakdown.learning + stats.breakdown.relearning, color: CHART_COLORS.learning },
    { label: 'Young', value: stats.breakdown.young, color: CHART_COLORS.young },
    { label: 'Mature', value: stats.breakdown.mature, color: CHART_COLORS.mature },
    { label: 'Suspended', value: stats.breakdown.suspended, color: CHART_COLORS.suspended },
  ].filter((s) => s.value > 0);

  container.appendChild(
    section('Card mix', [
      el('div', { class: 'card', style: { padding: '18px 16px' } }, [
        donut({
          segments: mix,
          centerLabel: String(stats.breakdown.total),
          centerSub: 'cards',
        }),
        legend(mix.map((s) => ({ ...s, count: s.value }))),
        el('p', {
          class: 'small faint mt-4 center',
          text: `Mature = interval of ${MATURE_THRESHOLD_DAYS} days or more.`,
        }),
      ]),
    ])
  );

  /* --- review activity --- */
  const gradeSeries = [
    { key: 'again', label: 'Again', color: CHART_COLORS.again },
    { key: 'hard', label: 'Hard', color: CHART_COLORS.hard },
    { key: 'good', label: 'Good', color: CHART_COLORS.good },
    { key: 'easy', label: 'Easy', color: CHART_COLORS.easy },
  ];
  const totals = gradeSeries.map((s) => ({
    ...s,
    count: stats.history.reduce((a, b) => a + b[s.key], 0),
  }));

  container.appendChild(
    section('Review activity', [
      el('div', { class: 'card', style: { padding: '16px 14px 12px' } }, [
        stackedBarChart({
          buckets: stats.history,
          series: gradeSeries,
          height: 150,
          labelEvery: 7,
          labelFor: (b) => formatDate(b.ts + 12 * 3600000, { month: 'short', day: 'numeric' }),
          emptyMessage: 'No reviews in the last 30 days',
        }),
        legend(totals),
        el('p', {
          class: 'small faint mt-2',
          text: `${formatNumber(stats.totalReviews)} reviews all time · ${formatDuration(stats.totalTimeMs)} studied`,
        }),
      ]),
    ])
  );

  /* --- forecast --- */
  const forecastSeries = [
    { key: 'young', label: 'Young', color: CHART_COLORS.young },
    { key: 'mature', label: 'Mature', color: CHART_COLORS.mature },
  ];
  const forecastTotal = stats.forecast.buckets.reduce((a, b) => a + b.total, 0);

  container.appendChild(
    section('Coming up', [
      el('div', { class: 'card', style: { padding: '16px 14px 12px' } }, [
        stackedBarChart({
          buckets: stats.forecast.buckets,
          series: forecastSeries,
          height: 140,
          labelEvery: 7,
          labelFor: (b, i) => (i === 0 ? 'today' : formatDate(b.ts + 12 * 3600000, { month: 'short', day: 'numeric' })),
          emptyMessage: 'Nothing scheduled in the next 30 days',
        }),
        legend(forecastSeries.map((s) => ({
          ...s,
          count: stats.forecast.buckets.reduce((a, b) => a + b[s.key], 0),
        }))),
        el('p', {
          class: 'small faint mt-2',
          text: stats.forecast.backlog
            ? `${forecastTotal} reviews over 30 days, including a backlog of ${stats.forecast.backlog} overdue.`
            : `${forecastTotal} reviews scheduled over the next 30 days.`,
        }),
      ]),
    ])
  );

  /* --- retention --- */
  container.appendChild(renderRetention(stats, settings));

  /* --- memory state --- */
  container.appendChild(renderMemory(stats));

  /* --- leeches --- */
  const stuck = leeches(cards, 4);
  if (stuck.length) {
    container.appendChild(
      section(`Trouble cards (${stuck.length})`, [
        el('div', { class: 'card', style: { padding: '4px 0' } },
          stuck.slice(0, 8).map((c) =>
            el('div', { class: 'setting' }, [
              el('div', { class: 'setting__main' }, [
                el('div', { class: 'setting__label', text: c.question, style: { fontSize: '0.88rem', fontWeight: '550' } }),
                el('div', { class: 'setting__desc', text: c.answer }),
              ]),
              el('div', { class: 'setting__control' }, [
                el('span', { class: 'pill', style: { background: 'var(--again-soft)', color: 'var(--again)' }, text: `${c.lapses}×` }),
              ]),
            ])
          )
        ),
        el('p', {
          class: 'small faint mt-2',
          text: 'Cards forgotten four or more times. These are usually written badly rather than genuinely hard — try splitting them into smaller cards.',
        }),
      ])
    );
  }

  /* --- per-deck comparison (global view only) --- */
  if (!deckId && decks.length > 1) {
    container.appendChild(await renderDeckComparison(decks, settings, navigate));
  }
}

/* ------------------------------------------------------------------ parts */

function renderRetention(stats, settings) {
  const target = settings.desiredRetention;
  const actual = stats.retention.all.rate;
  const rows = [
    ['All reviews', stats.retention.all],
    ['Last 30 days', stats.retention.last30],
    ['Young cards', stats.retention.young],
    ['Mature cards', stats.retention.mature],
  ];

  let verdict = null;
  if (actual != null && stats.retention.all.total >= 50) {
    const delta = actual - target;
    if (Math.abs(delta) < 0.04) {
      verdict = 'Your actual retention matches your target closely — the scheduler is well calibrated.';
    } else if (delta < 0) {
      verdict = `You are recalling ${formatPercent(Math.abs(delta), 1)} less often than your ${formatPercent(target)} target. Intervals may be too long: try raising desired retention.`;
    } else {
      verdict = `You are recalling ${formatPercent(delta, 1)} more often than your ${formatPercent(target)} target. You could lower desired retention and review less.`;
    }
  }

  return section('Retention', [
    el('div', { class: 'card', style: { padding: '16px' } }, [
      el('div', { class: 'stat-grid mb-4' }, [
        tile(actual == null ? '—' : formatPercent(actual, 1), 'Actual', `${stats.retention.all.total} reviews`),
        tile(formatPercent(target), 'Target', 'your setting'),
        tile(
          stats.averageRetrievability == null ? '—' : formatPercent(stats.averageRetrievability, 1),
          'Predicted now',
          'average recall'
        ),
      ]),
      el('div', {},
        rows.map(([label, r]) =>
          el('div', { class: 'row', style: { margin: '9px 0', gap: '12px' } }, [
            el('span', { class: 'small muted', style: { width: '104px', flex: '0 0 auto' }, text: label }),
            el('div', { class: 'grow' }, [
              proportionBar([
                { label: 'Recalled', value: r.passed, color: CHART_COLORS.good },
                { label: 'Forgotten', value: r.total - r.passed, color: CHART_COLORS.again },
              ]),
            ]),
            el('span', {
              class: 'small mono',
              style: { width: '46px', textAlign: 'right', flex: '0 0 auto' },
              text: r.rate == null ? '—' : formatPercent(r.rate),
            }),
          ])
        )
      ),
      verdict ? el('p', { class: 'small faint mt-4', text: verdict }) : el('p', {
        class: 'small faint mt-4',
        text: 'Retention compares how often you actually recall a review card against the target you set. It becomes meaningful after ~50 reviews.',
      }),
    ]),
  ]);
}

function renderMemory(stats) {
  const bins = stats.difficultyHistogram;
  const buckets = bins.map((b, i) => ({ count: b.count, from: b.from, idx: i, total: b.count }));

  return section('Memory state', [
    el('div', { class: 'card', style: { padding: '16px 14px 12px' } }, [
      el('div', { class: 'stat-grid mb-4' }, [
        tile(
          stats.averageStability == null ? '—' : formatInterval(stats.averageStability * DAY),
          'Avg stability',
          'time to 90% recall'
        ),
        tile(
          stats.averageDifficulty == null ? '—' : stats.averageDifficulty.toFixed(1),
          'Avg difficulty',
          'out of 10'
        ),
        tile(formatNumber(stats.lapses), 'Total lapses'),
      ]),
      el('h3', { class: 'section__title', text: 'Difficulty distribution' }),
      stackedBarChart({
        buckets,
        series: [{ key: 'count', label: 'Cards', color: CHART_COLORS.new }],
        height: 110,
        labelEvery: 2,
        labelFor: (b) => b.from.toFixed(0),
        valueFor: (b) => b.count,
        emptyMessage: 'No reviewed cards yet',
      }),
      el('p', {
        class: 'small faint mt-2',
        text: 'FSRS difficulty, 1 (easy) to 10 (hard). A deck skewed right is usually a sign the cards ask too much at once.',
      }),
    ]),
  ]);
}

async function renderDeckComparison(decks, settings, navigate) {
  const rows = [];
  for (const deck of decks) {
    const [cards, reviews] = await Promise.all([cardsForDeck(deck.id), reviewsForDeck(deck.id)]);
    const s = deckStats(cards, reviews, settings);
    rows.push({ deck, cards: cards.length, stats: s });
  }
  rows.sort((a, b) => b.stats.totalReviews - a.stats.totalReviews);

  return section('By deck', [
    el('div', { class: 'card', style: { padding: '4px 0' } },
      rows.map(({ deck, cards, stats }) =>
        el('button', {
          class: 'setting setting--tappable',
          type: 'button',
          style: { width: '100%', background: 'none', border: '0', borderBottom: '1px solid var(--border)', textAlign: 'left' },
          onclick: () => navigate('stats', { deckId: deck.id }),
        }, [
          el('span', {
            class: 'deck__swatch',
            style: { background: deck.color, width: '32px', height: '32px', borderRadius: '10px', fontSize: '0.78rem' },
            text: deck.name.slice(0, 2).toUpperCase(),
          }),
          el('div', { class: 'setting__main' }, [
            el('div', { class: 'setting__label', text: deck.name }),
            el('div', {
              class: 'setting__desc',
              text: `${cards} cards · ${stats.totalReviews} reviews · ${stats.due.dueToday} due`,
            }),
          ]),
          el('div', { class: 'setting__control' }, [
            el('span', {
              class: 'mono small',
              text: stats.retention.all.rate == null ? '—' : formatPercent(stats.retention.all.rate),
            }),
          ]),
        ])
      )
    ),
  ]);
}

function chooseDeck(decks, activeId, navigate) {
  return sheet({
    title: 'Statistics for',
    body: el('div', { class: 'menu-list' }, [
      el('button', {
        class: `menu-item${!activeId ? ' is-active' : ''}`,
        type: 'button',
        onclick: () => setTimeout(() => navigate('stats', {}), 180),
      }, [icon('stats'), el('span', { text: 'All decks' })]),
      ...decks.map((d) =>
        el('button', {
          class: 'menu-item',
          type: 'button',
          onclick: () => setTimeout(() => navigate('stats', { deckId: d.id }), 180),
        }, [
          el('span', {
            class: 'legend__swatch',
            style: { background: d.color, width: '12px', height: '12px' },
          }),
          el('span', { text: d.name }),
        ])
      ),
    ]),
  });
}

function section(title, children) {
  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: title }),
    ...children,
  ]);
}

function tile(value, label, hint) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__value', text: value }),
    el('div', { class: 'stat__label', text: label }),
    hint ? el('div', { class: 'stat__hint', text: hint }) : null,
  ]);
}
