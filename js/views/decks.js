/**
 * Decks view: the home screen. Lists every deck with its live due counts and
 * owns deck creation, import and export.
 */

import {
  el, clear, sheet, confirmSheet, promptSheet, toast, pickFiles,
  downloadText, shareFile, formatRelative,
} from '../ui.js';
import { icon } from '../icons.js';
import { State } from '../fsrs.js';
import { dueCounts, stateBreakdown } from '../stats.js';
import {
  getAll, put, cardsForDeck, putMany, deleteDeckCascade, reviewsForDeck,
} from '../store.js';
import {
  parseDeckFile, serializeDeckFile, toCardRecords, makeDeck,
  deckFilename, deckNameFromFilename, pickColor,
} from '../deckfile.js';
import { currentSettings } from '../settings.js';
import { skillBlob, SKILL_FILENAME } from '../skillfile-util.js';
import { GENERATOR_PROMPT } from '../prompt.js';

export async function renderDecks(container, { navigate }) {
  clear(container);
  const settings = currentSettings();
  const decks = await getAll('decks');
  const allCards = await getAll('cards');

  const byDeck = new Map();
  for (const card of allCards) {
    if (!byDeck.has(card.deckId)) byDeck.set(card.deckId, []);
    byDeck.get(card.deckId).push(card);
  }

  container.appendChild(
    el('header', { class: 'view__header' }, [
      el('div', {}, [
        el('h1', { class: 'view__title', text: 'Decks' }),
        el('p', {
          class: 'view__subtitle',
          text: decks.length
            ? `${decks.length} deck${decks.length === 1 ? '' : 's'} · ${allCards.length} cards`
            : 'Nothing here yet',
        }),
      ]),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Add a deck',
        onclick: () => showAddMenu({ navigate }),
      }, [icon('plus')]),
    ])
  );

  if (!decks.length) {
    container.appendChild(renderEmptyState({ navigate }));
    return;
  }

  // Decks with work waiting float to the top.
  const rows = decks.map((deck) => {
    const cards = byDeck.get(deck.id) || [];
    return { deck, cards, due: dueCounts(cards, settings) };
  });
  rows.sort((a, b) => {
    const aWork = a.due.dueToday + Math.min(a.due.newAvailable, settings.newPerDay);
    const bWork = b.due.dueToday + Math.min(b.due.newAvailable, settings.newPerDay);
    if (aWork !== bWork) return bWork - aWork;
    return a.deck.name.localeCompare(b.deck.name);
  });

  const totalDue = rows.reduce((a, r) => a + r.due.dueToday, 0);
  const totalNew = rows.reduce((a, r) => a + Math.min(r.due.newAvailable, settings.newPerDay), 0);

  if (totalDue + totalNew > 0) {
    container.appendChild(
      el('div', { class: 'section' }, [
        el('button', {
          class: 'btn btn--primary btn--block',
          type: 'button',
          onclick: () => {
            const first = rows.find((r) => r.due.dueToday + r.due.newAvailable > 0);
            if (first) navigate('study', { deckId: first.deck.id });
          },
        }, [
          icon('play'),
          el('span', { text: `Study ${totalDue + totalNew} card${totalDue + totalNew === 1 ? '' : 's'}` }),
        ]),
      ])
    );
  }

  const list = el('div', { class: 'deck-list' });
  for (const row of rows) {
    list.appendChild(renderDeckRow(row, { navigate, settings }));
  }
  container.appendChild(list);

  container.appendChild(
    el('div', { class: 'section mt-4' }, [
      el('button', {
        class: 'btn btn--ghost btn--block',
        type: 'button',
        onclick: () => showAddMenu({ navigate }),
      }, [icon('plus'), el('span', { text: 'New deck' })]),
    ])
  );
}

function renderDeckRow({ deck, cards, due }, { navigate, settings }) {
  const breakdown = stateBreakdown(cards);
  const newShown = Math.min(due.newAvailable, settings.newPerDay);

  return el('button', {
    class: 'deck',
    type: 'button',
    onclick: () => navigate('deck', { deckId: deck.id }),
  }, [
    el('div', {
      class: 'deck__swatch',
      style: { background: deck.color || pickColor(deck.name) },
      text: initials(deck.name),
    }),
    el('div', { class: 'deck__main' }, [
      el('div', { class: 'deck__name', text: deck.name }),
      el('div', { class: 'deck__meta' }, [
        el('span', {
          class: `pill pill--due${due.dueToday ? '' : ' pill--zero'}`,
          text: `${due.dueToday} due`,
        }),
        el('span', {
          class: `pill pill--new${newShown ? '' : ' pill--zero'}`,
          text: `${newShown} new`,
        }),
        el('span', { class: 'pill', text: `${breakdown.total} cards` }),
      ]),
    ]),
    el('span', { class: 'faint', html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>' }),
  ]);
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function renderEmptyState({ navigate }) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty__icon', text: '🗂️' }),
    el('h3', { text: 'No decks yet' }),
    el('p', { text: 'Import a .deck file, or have Claude generate one for you from your course notes.' }),
    el('div', { class: 'row', style: { flexDirection: 'column', gap: '10px' } }, [
      el('button', {
        class: 'btn btn--primary btn--block',
        type: 'button',
        onclick: () => importDeckFiles({ navigate }),
      }, [icon('upload'), el('span', { text: 'Import a .deck file' })]),
      el('button', {
        class: 'btn btn--ghost btn--block',
        type: 'button',
        onclick: () => showGeneratorSheet(),
      }, [icon('sparkles'), el('span', { text: 'Generate a deck with AI' })]),
      el('button', {
        class: 'btn btn--quiet btn--block',
        type: 'button',
        text: 'Create an empty deck',
        onclick: () => createEmptyDeck({ navigate }),
      }),
    ]),
  ]);
}

/* ------------------------------------------------------------------ menus */

export function showAddMenu({ navigate }) {
  return sheet({
    title: 'Add cards',
    body: el('div', { class: 'menu-list' }, [
      menuItem('upload', 'Import a .deck file', 'JSONL from the study-deck skill', () =>
        importDeckFiles({ navigate })),
      menuItem('sparkles', 'Generate with AI', 'Get the skill + prompt for Claude', () =>
        showGeneratorSheet()),
      menuItem('edit', 'Paste deck text', 'Drop in JSONL you copied from a chat', () =>
        pasteDeck({ navigate })),
      menuItem('plus', 'Empty deck', 'Write the cards yourself', () =>
        createEmptyDeck({ navigate })),
    ]),
  });
}

function menuItem(iconName, label, description, onClick) {
  return el('button', {
    class: 'menu-item',
    type: 'button',
    onclick: () => setTimeout(onClick, 200),
  }, [
    icon(iconName),
    el('span', {}, [
      el('span', { text: label }),
      description ? el('small', { text: description }) : null,
    ]),
  ]);
}

/* --------------------------------------------------------------- creation */

export async function createEmptyDeck({ navigate }) {
  const name = await promptSheet('New deck', {
    label: 'Deck name',
    placeholder: 'e.g. Roman Contract Law',
  });
  if (!name?.trim()) return;
  const deck = makeDeck(name.trim());
  await put('decks', deck);
  toast('Deck created', 'success');
  navigate('deck', { deckId: deck.id });
}

export async function importDeckFiles({ navigate, deckId = null }) {
  // No `accept` filter: iOS maps accept extensions to registered file types,
  // and `.deck` is not one, so the Files picker greys .deck files out instead
  // of offering them. Accept anything and let parseDeckFile judge the content.
  const files = await pickFiles({ multiple: !deckId });
  if (!files.length) return;

  let lastDeckId = null;
  let totalImported = 0;
  const problems = [];

  for (const file of files) {
    const text = await file.text();
    const { cards, errors, warnings } = parseDeckFile(text);

    if (!cards.length) {
      problems.push(`${file.name}: no valid cards (${errors[0]?.message || 'empty file'})`);
      continue;
    }
    if (errors.length) problems.push(`${file.name}: skipped ${errors.length} bad line(s)`);
    if (warnings.length) problems.push(`${file.name}: ${warnings[0]}`);

    const targetId = deckId || (await createDeckForImport(file.name)).id;
    const existing = await cardsForDeck(targetId);
    const records = toCardRecords(cards, targetId, existing.length);

    // Don't re-import a card that's already in the deck — importing an updated
    // file should add the new cards, not duplicate the whole deck. The same set
    // also catches duplicates *within* the incoming file.
    const seen = new Set(existing.map((c) => normalizeQ(c.question)));
    const fresh = records.filter((c) => {
      const key = normalizeQ(c.question);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const skipped = records.length - fresh.length;

    await putMany('cards', fresh);
    totalImported += fresh.length;
    lastDeckId = targetId;
    if (skipped) problems.push(`${file.name}: ${skipped} duplicate(s) skipped`);
  }

  if (problems.length) {
    await sheet({
      title: totalImported ? 'Imported with notes' : 'Import failed',
      body: el('div', {}, [
        el('p', { text: `${totalImported} card${totalImported === 1 ? '' : 's'} imported.` }),
        el('ul', { class: 'small muted', style: { paddingLeft: '18px', margin: '0' } },
          problems.slice(0, 6).map((p) => el('li', { text: p }))),
      ]),
      actions: [{ label: 'OK', kind: 'primary' }],
    });
  } else {
    toast(`Imported ${totalImported} cards`, 'success');
  }

  if (lastDeckId && !deckId) navigate('deck', { deckId: lastDeckId });
  else navigate();
}

function normalizeQ(q) {
  return String(q || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function createDeckForImport(filename) {
  const deck = makeDeck(deckNameFromFilename(filename), { sourceFile: filename });
  await put('decks', deck);
  return deck;
}

export async function pasteDeck({ navigate, deckId = null }) {
  const textarea = el('textarea', {
    class: 'input input--area',
    rows: 8,
    placeholder: '{"question": "...", "answer": "...", "tag": "...", "extra": "..."}\n{"question": "...", ...}',
  });
  const nameInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Deck name',
    value: '',
  });

  const body = el('div', {}, [
    !deckId
      ? el('label', { class: 'field' }, [
          el('span', { class: 'field__label', text: 'Deck name' }),
          nameInput,
        ])
      : null,
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'JSONL card data' }),
      textarea,
      el('span', {
        class: 'field__hint',
        text: 'One JSON object per line with question, answer, tag and extra fields.',
      }),
    ]),
  ]);

  const action = await sheet({
    title: 'Paste deck text',
    body,
    actions: [
      { label: 'Cancel', value: null, kind: 'ghost' },
      { label: 'Import', value: 'import', kind: 'primary' },
    ],
  });
  if (action !== 'import') return;

  const { cards, errors } = parseDeckFile(textarea.value);
  if (!cards.length) {
    toast(errors[0]?.message || 'No valid cards found', 'error');
    return;
  }

  const targetId = deckId || (await (async () => {
    const deck = makeDeck(nameInput.value.trim() || 'Pasted deck');
    await put('decks', deck);
    return deck;
  })()).id;

  const existing = await cardsForDeck(targetId);
  await putMany('cards', toCardRecords(cards, targetId, existing.length));
  toast(`Imported ${cards.length} cards${errors.length ? ` (${errors.length} skipped)` : ''}`, 'success');
  navigate('deck', { deckId: targetId });
}

/* ------------------------------------------------------- AI deck generation */

/**
 * The bridge to Claude: hand the user the skill file plus a prompt they can
 * paste, so generating a new deck is a two-tap operation.
 */
export function showGeneratorSheet() {
  const body = el('div', {}, [
    el('div', { class: 'callout mb-4' }, [
      el('h4', { text: 'Make decks with Claude' }),
      el('p', { text: 'Send the study-deck skill to Claude once, then upload any lecture slides, chapter or notes and ask for a deck. You get back a .deck file you can import here.' }),
    ]),
    el('div', { class: 'menu-list' }, [
      menuItem('download', 'Get the skill file', `${SKILL_FILENAME} — upload it to Claude`, async () => {
        const blob = await skillBlob();
        const result = await shareFile(blob, SKILL_FILENAME, 'study-deck skill');
        toast(result === 'shared' ? 'Skill shared' : 'Skill file saved', 'success');
      }),
      menuItem('edit', 'Copy the prompt', 'Ready-made instructions for Claude', async () => {
        try {
          await navigator.clipboard.writeText(GENERATOR_PROMPT);
          toast('Prompt copied', 'success');
        } catch {
          await sheet({
            title: 'Prompt',
            body: el('textarea', { class: 'input input--area', rows: 10, readonly: true }, [GENERATOR_PROMPT]),
            actions: [{ label: 'Close', kind: 'primary' }],
          });
        }
      }),
      menuItem('upload', 'Import the result', 'Once Claude gives you the .deck file', () =>
        importDeckFiles({ navigate: () => location.reload() })),
    ]),
    el('p', { class: 'small faint mt-4', text: 'The skill works in any Claude conversation — it does not need this app.' }),
  ]);

  return sheet({ title: 'Generate a deck with AI', body });
}

/* --------------------------------------------------------------- deck ops */

export async function exportDeck(deck) {
  const cards = await cardsForDeck(deck.id);
  if (!cards.length) { toast('Deck is empty', 'error'); return; }
  const sorted = [...cards].sort((a, b) => (a.position || 0) - (b.position || 0));
  const text = serializeDeckFile(sorted);
  const filename = deckFilename(deck.name);
  const blob = new Blob([text], { type: 'application/x-ndjson' });
  const result = await shareFile(blob, filename, deck.name);
  toast(result === 'shared' ? 'Deck shared' : `Saved ${filename}`, 'success');
}

export async function renameDeck(deck) {
  const name = await promptSheet('Rename deck', { label: 'Deck name', value: deck.name });
  if (!name?.trim()) return false;
  await put('decks', { ...deck, name: name.trim() });
  toast('Deck renamed', 'success');
  return true;
}

export async function deleteDeck(deck) {
  const cards = await cardsForDeck(deck.id);
  const ok = await confirmSheet(
    `Delete "${deck.name}"?`,
    `${cards.length} card${cards.length === 1 ? '' : 's'} and all their review history will be permanently deleted. Export the deck first if you want to keep it.`,
    'Delete deck'
  );
  if (!ok) return false;
  await deleteDeckCascade(deck.id);
  toast('Deck deleted');
  return true;
}

/** Wipe scheduling but keep the cards — a fresh start on the same material. */
export async function resetDeckProgress(deck) {
  const ok = await confirmSheet(
    'Reset progress?',
    `Every card in "${deck.name}" goes back to new. The cards themselves are kept, but their FSRS memory state and review history are cleared.`,
    'Reset progress',
    'danger'
  );
  if (!ok) return false;

  const { newCardState } = await import('../scheduler.js');
  const cards = await cardsForDeck(deck.id);
  await putMany('cards', cards.map((c) => ({ ...c, ...newCardState() })));

  const { del } = await import('../store.js');
  const reviews = await reviewsForDeck(deck.id);
  for (const r of reviews) await del('reviews', r.id);

  toast('Progress reset', 'success');
  return true;
}

export { State, formatRelative, downloadText };
