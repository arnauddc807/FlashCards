/**
 * Settings. Grouped so the everyday knobs (retention, daily limits, swipe
 * feel) come first and the raw FSRS weights sit behind a deliberate tap.
 */

import {
  el, clear, sheet, toast, confirmSheet, pickFiles, downloadText,
  shareFile, formatPercent, formatNumber,
} from '../ui.js';
import { icon } from '../icons.js';
import { DEFAULT_W, W_LABELS, W_COUNT, validateWeights } from '../fsrs.js';
import { parseSteps, formatInterval } from '../scheduler.js';
import {
  currentSettings, updateSettings, resetSettings, DEFAULT_SETTINGS,
} from '../settings.js';
import { exportAll, importAll, estimateUsage, getAll, clearStore } from '../store.js';
import { skillBlob, SKILL_FILENAME, SKILL_BYTES } from '../skillfile-util.js';
import { GENERATOR_PROMPT, EXTEND_PROMPT } from '../prompt.js';
import { applyTheme } from '../theme.js';

export async function renderSettings(container, { navigate }) {
  clear(container);
  const s = currentSettings();

  const refresh = () => renderSettings(container, { navigate });

  const set = async (patch, { rerender = false } = {}) => {
    await updateSettings(patch);
    if (patch.theme || patch.fontScale) applyTheme(currentSettings());
    if (rerender) refresh();
  };

  container.appendChild(
    el('header', { class: 'view__header' }, [
      el('div', {}, [
        el('h1', { class: 'view__title', text: 'Settings' }),
        el('p', { class: 'view__subtitle', text: 'Scheduling, gestures and your data' }),
      ]),
    ])
  );

  /* ---------------------------------------------------------- scheduling */

  container.appendChild(group('Scheduling', [
    sliderSetting({
      label: 'Desired retention',
      desc: 'How much you want to remember at review time. Higher means shorter intervals and more daily work.',
      value: s.desiredRetention,
      min: 0.7, max: 0.98, step: 0.01,
      format: (v) => formatPercent(v),
      onChange: (v) => set({ desiredRetention: v }),
      footer: retentionAdvice,
    }),

    numberSetting({
      label: 'Maximum interval',
      desc: 'Cards will never be scheduled further out than this.',
      value: s.maximumInterval,
      min: 1, max: 36500, step: 1,
      suffix: 'days',
      onChange: (v) => set({ maximumInterval: v }),
    }),

    textSetting({
      label: 'Learning steps',
      desc: 'Short same-day steps a new card passes through before FSRS takes over. Use m, h or d — e.g. "1m 10m".',
      value: s.learningSteps,
      placeholder: '1m 10m',
      onChange: (v) => set({ learningSteps: v }, { rerender: true }),
      preview: (v) => {
        const steps = parseSteps(v);
        return steps.length
          ? `${steps.length} step${steps.length === 1 ? '' : 's'}: ${steps.map(formatInterval).join(' → ')} → FSRS`
          : 'No steps — new cards go straight into FSRS scheduling.';
      },
    }),

    textSetting({
      label: 'Relearning steps',
      desc: 'What happens after you swipe left on a card you had already learned.',
      value: s.relearningSteps,
      placeholder: '10m',
      onChange: (v) => set({ relearningSteps: v }, { rerender: true }),
      preview: (v) => {
        const steps = parseSteps(v);
        return steps.length
          ? `${steps.map(formatInterval).join(' → ')} → back to review`
          : 'No steps — lapsed cards return straight to the review queue.';
      },
    }),

    toggleSetting({
      label: 'Fuzz intervals',
      desc: 'Spread due dates by a few percent so a deck imported in one go does not come back in one lump.',
      value: s.enableFuzz,
      onChange: (v) => set({ enableFuzz: v }),
    }),
  ]));

  /* -------------------------------------------------------------- limits */

  container.appendChild(group('Daily limits', [
    numberSetting({
      label: 'New cards per day',
      desc: 'Each new card becomes roughly ten future reviews, so this is the real workload dial.',
      value: s.newPerDay, min: 0, max: 9999,
      onChange: (v) => set({ newPerDay: v }),
    }),
    numberSetting({
      label: 'Maximum reviews per day',
      desc: 'A cap for catching up after a break. Skipped reviews roll over to tomorrow.',
      value: s.reviewsPerDay, min: 0, max: 99999,
      onChange: (v) => set({ reviewsPerDay: v }),
    }),
    selectSetting({
      label: 'New card order',
      value: s.newCardOrder,
      options: [
        ['sequential', 'In deck order'],
        ['random', 'Random'],
      ],
      onChange: (v) => set({ newCardOrder: v }),
    }),
    numberSetting({
      label: 'Next day starts at',
      desc: 'Reviews before this hour still count as yesterday, so a late session is not split in two.',
      value: s.dayCutoffHour, min: 0, max: 23,
      suffix: ':00',
      onChange: (v) => set({ dayCutoffHour: v }),
    }),
  ]));

  /* ------------------------------------------------------------ gestures */

  container.appendChild(group('Gestures & feel', [
    infoRow('Swipe left', 'Again — you did not know it', 'var(--again)'),
    infoRow('Swipe right', 'Good — you knew it', 'var(--good)'),
    infoRow('Star button / swipe up', 'Easy — instant recall', 'var(--easy)'),
    s.showHardButton ? infoRow('Swipe down', 'Hard — you barely got there', 'var(--hard)') : null,

    sliderSetting({
      label: 'Swipe sensitivity',
      desc: 'How far a card must travel before the swipe counts.',
      value: s.swipeThreshold,
      min: 0.12, max: 0.5, step: 0.02,
      format: (v) => (v <= 0.2 ? 'Light' : v <= 0.32 ? 'Medium' : 'Firm'),
      onChange: (v) => set({ swipeThreshold: v }),
    }),
    toggleSetting({
      label: 'Show Hard button',
      desc: 'Adds the fourth FSRS grade. Without it, "barely remembered" is graded the same as a clean recall.',
      value: s.showHardButton,
      onChange: (v) => set({ showHardButton: v }, { rerender: true }),
    }),
    toggleSetting({
      label: 'Answer before revealing',
      desc: 'Let a swipe grade the card without showing the answer first.',
      value: s.swipeBeforeReveal,
      onChange: (v) => set({ swipeBeforeReveal: v }),
    }),
    toggleSetting({
      label: 'Show next interval',
      desc: 'Print the resulting interval under each grade button.',
      value: s.showIntervalHints,
      onChange: (v) => set({ showIntervalHints: v }),
    }),
    toggleSetting({
      label: 'Haptic feedback',
      desc: 'A short vibration when a card is graded.',
      value: s.hapticsEnabled,
      onChange: (v) => set({ hapticsEnabled: v }),
    }),
  ]));

  /* ---------------------------------------------------------- appearance */

  container.appendChild(group('Appearance', [
    selectSetting({
      label: 'Theme',
      value: s.theme,
      options: [['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']],
      onChange: (v) => set({ theme: v }),
    }),
    sliderSetting({
      label: 'Text size',
      value: s.fontScale,
      min: 0.85, max: 1.4, step: 0.05,
      format: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => set({ fontScale: v }),
    }),
  ]));

  /* ------------------------------------------------------- FSRS internals */

  container.appendChild(group('Algorithm', [
    tapRow({
      label: 'FSRS parameters',
      desc: `${W_COUNT} weights driving the memory model. ${isDefaultW(s.w) ? 'Currently the defaults.' : 'Customised.'}`,
      onClick: () => showWeightsEditor(refresh),
    }),
    tapRow({
      label: 'How the algorithm works',
      desc: 'What stability, difficulty and retrievability actually mean.',
      onClick: () => showAlgorithmExplainer(),
    }),
  ]));

  /* ---------------------------------------------------------- AI decks */

  container.appendChild(group('Make decks with AI', [
    tapRow({
      label: 'Export the study-deck skill',
      desc: `${SKILL_FILENAME} · ${(SKILL_BYTES / 1024).toFixed(1)} KB — upload it to Claude, then feed it your notes.`,
      icon: 'download',
      onClick: async () => {
        const blob = await skillBlob();
        const result = await shareFile(blob, SKILL_FILENAME, 'study-deck skill');
        toast(result === 'shared' ? 'Skill shared' : 'Skill file saved', 'success');
      },
    }),
    tapRow({
      label: 'Copy the generation prompt',
      desc: 'Paste into Claude with the skill and your material attached.',
      icon: 'sparkles',
      onClick: () => copyOrShow(GENERATOR_PROMPT, 'Generation prompt'),
    }),
    tapRow({
      label: 'Copy the "extend a deck" prompt',
      desc: 'For adding cards to a deck you already have.',
      icon: 'sparkles',
      onClick: () => copyOrShow(EXTEND_PROMPT, 'Extend prompt'),
    }),
  ]));

  /* ---------------------------------------------------------------- data */

  const usage = await estimateUsage();
  const [decks, cards, reviews] = await Promise.all([getAll('decks'), getAll('cards'), getAll('reviews')]);

  container.appendChild(group('Data', [
    infoRow(
      'Stored on this device',
      `${decks.length} decks · ${formatNumber(cards.length)} cards · ${formatNumber(reviews.length)} reviews` +
        (usage?.usage ? ` · ${(usage.usage / 1048576).toFixed(1)} MB` : '')
    ),
    tapRow({
      label: 'Back up everything',
      desc: 'One JSON file with every deck, card and review.',
      icon: 'download',
      onClick: async () => {
        const snapshot = await exportAll();
        const name = `flashcards-backup-${new Date().toISOString().slice(0, 10)}.json`;
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const result = await shareFile(blob, name, 'Flashcards backup');
        toast(result === 'shared' ? 'Backup shared' : `Saved ${name}`, 'success');
      },
    }),
    tapRow({
      label: 'Restore from backup',
      desc: 'Replaces everything currently on this device.',
      icon: 'upload',
      onClick: async () => {
        const files = await pickFiles({ accept: '.json,application/json' });
        if (!files.length) return;
        const ok = await confirmSheet(
          'Restore backup?',
          'Every deck, card and review currently on this device will be replaced by the contents of the backup file.',
          'Restore'
        );
        if (!ok) return;
        try {
          const snapshot = JSON.parse(await files[0].text());
          await importAll(snapshot);
          toast('Backup restored', 'success');
          setTimeout(() => location.reload(), 700);
        } catch (err) {
          toast(err.message || 'Could not read that backup', 'error');
        }
      },
    }),
    tapRow({
      label: 'Reset settings to defaults',
      desc: 'Scheduling, gestures and appearance. Your decks are untouched.',
      icon: 'refresh',
      onClick: async () => {
        const ok = await confirmSheet('Reset settings?', 'All preferences return to their defaults. Decks and review history are kept.', 'Reset', 'danger');
        if (!ok) return;
        await resetSettings();
        applyTheme(currentSettings());
        toast('Settings reset', 'success');
        refresh();
      },
      danger: true,
    }),
    tapRow({
      label: 'Delete all data',
      desc: 'Every deck, card and review on this device.',
      icon: 'trash',
      onClick: async () => {
        const ok = await confirmSheet(
          'Delete everything?',
          'This permanently removes every deck, card and review from this device. Back up first if you might want any of it back.',
          'Delete everything'
        );
        if (!ok) return;
        await Promise.all([clearStore('decks'), clearStore('cards'), clearStore('reviews')]);
        toast('All data deleted');
        setTimeout(() => location.reload(), 700);
      },
      danger: true,
    }),
  ]));

  container.appendChild(
    el('p', { class: 'small faint center mt-4' }, [
      el('span', { text: 'Flashcards · FSRS-5 · offline-first. ' }),
      el('span', { text: 'Everything stays on this device.' }),
    ])
  );
}

/* ------------------------------------------------------------- controls */

function group(title, rows) {
  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: title }),
    el('div', { class: 'setting-group' }, rows.filter(Boolean)),
  ]);
}

function labelBlock(label, desc) {
  return el('div', { class: 'setting__main' }, [
    el('div', { class: 'setting__label', text: label }),
    desc ? el('div', { class: 'setting__desc', text: desc }) : null,
  ]);
}

function toggleSetting({ label, desc, value, onChange }) {
  const btn = el('button', {
    class: 'toggle',
    type: 'button',
    role: 'switch',
    'aria-checked': String(!!value),
    'aria-label': label,
  });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return el('div', { class: 'setting' }, [labelBlock(label, desc), el('div', { class: 'setting__control' }, [btn])]);
}

function sliderSetting({ label, desc, value, min, max, step, format, onChange, footer }) {
  const out = el('output', { text: format ? format(value) : String(value) });
  const note = footer ? el('div', { class: 'setting__desc', text: footer(value) }) : null;

  const input = el('input', {
    class: 'slider', type: 'range',
    min: String(min), max: String(max), step: String(step), value: String(value),
    'aria-label': label,
  });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = format ? format(v) : String(v);
    if (note && footer) note.textContent = footer(v);
  });
  input.addEventListener('change', () => onChange(parseFloat(input.value)));

  return el('div', { class: 'setting setting--stacked' }, [
    labelBlock(label, desc),
    el('div', { class: 'setting__control' }, [
      el('div', { class: 'slider-row', style: { width: '100%' } }, [input, out]),
    ]),
    note,
  ]);
}

function numberSetting({ label, desc, value, min, max, step = 1, suffix, onChange }) {
  const input = el('input', {
    type: 'number', inputmode: 'numeric',
    min: String(min), max: String(max), step: String(step), value: String(value),
    'aria-label': label,
  });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (!Number.isFinite(v)) v = value;
    v = Math.min(Math.max(v, min), max);
    input.value = String(v);
    onChange(v);
  });
  return el('div', { class: 'setting' }, [
    labelBlock(label, desc),
    el('div', { class: 'setting__control' }, [input, suffix ? el('span', { class: 'small faint', text: suffix }) : null]),
  ]);
}

function textSetting({ label, desc, value, placeholder, onChange, preview }) {
  const input = el('input', {
    type: 'text', value, placeholder, 'aria-label': label,
    style: { width: '130px' },
  });
  const note = preview ? el('div', { class: 'setting__desc', style: { color: 'var(--accent)' }, text: preview(value) }) : null;
  input.addEventListener('input', () => { if (note && preview) note.textContent = preview(input.value); });
  input.addEventListener('change', () => onChange(input.value.trim()));
  return el('div', { class: 'setting setting--stacked' }, [
    labelBlock(label, desc),
    el('div', { class: 'setting__control' }, [input]),
    note,
  ]);
}

function selectSetting({ label, desc, value, options, onChange }) {
  const select = el('select', { 'aria-label': label },
    options.map(([v, text]) => el('option', { value: v, text, selected: v === value })));
  select.addEventListener('change', () => onChange(select.value));
  return el('div', { class: 'setting' }, [
    labelBlock(label, desc),
    el('div', { class: 'setting__control' }, [select]),
  ]);
}

function tapRow({ label, desc, onClick, icon: iconName, danger }) {
  return el('button', {
    class: 'setting setting--tappable',
    type: 'button',
    style: { width: '100%', background: 'none', border: '0', borderBottom: '1px solid var(--border)', textAlign: 'left' },
    onclick: onClick,
  }, [
    iconName ? el('span', { style: { color: danger ? 'var(--again)' : 'var(--text-muted)', display: 'flex' } }, [icon(iconName)]) : null,
    el('div', { class: 'setting__main' }, [
      el('div', { class: 'setting__label', text: label, style: danger ? { color: 'var(--again)' } : {} }),
      desc ? el('div', { class: 'setting__desc', text: desc }) : null,
    ]),
    el('span', { class: 'faint', html: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>' }),
  ]);
}

function infoRow(label, desc, color) {
  return el('div', { class: 'setting' }, [
    color ? el('span', { class: 'legend__swatch', style: { background: color, width: '10px', height: '10px' } }) : null,
    labelBlock(label, desc),
  ]);
}

function retentionAdvice(v) {
  if (v >= 0.95) return 'Very high — expect a lot of reviews for a small gain in recall.';
  if (v >= 0.92) return 'Higher than default. Good for an exam you cannot afford to fail.';
  if (v >= 0.88) return 'The default. A good balance of effort and recall for most material.';
  if (v >= 0.82) return 'Relaxed — fewer reviews, more forgetting. Fine for broad background reading.';
  return 'Very relaxed. You will forget a lot between reviews.';
}

function isDefaultW(w) {
  return w.length === DEFAULT_W.length && w.every((x, i) => Math.abs(x - DEFAULT_W[i]) < 1e-9);
}

async function copyOrShow(text, title) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'success');
  } catch {
    const area = el('textarea', { class: 'input input--area', rows: 10, readonly: true });
    area.value = text;
    await sheet({ title, body: area, actions: [{ label: 'Close', kind: 'primary' }] });
  }
}

/* --------------------------------------------------------- weights editor */

async function showWeightsEditor(refresh) {
  const s = currentSettings();
  const inputs = [];

  const grid = el('div', { class: 'w-grid' },
    s.w.map((value, i) => {
      const input = el('input', {
        type: 'number', step: '0.00001', inputmode: 'decimal',
        value: String(value), 'aria-label': `w${i} — ${W_LABELS[i]}`,
      });
      inputs.push(input);
      return el('div', { class: 'w-item' }, [
        el('label', { text: `w${i} · ${W_LABELS[i]}` }),
        input,
      ]);
    })
  );

  const pasteArea = el('textarea', {
    class: 'input input--area',
    rows: 3,
    placeholder: '0.4025, 1.1838, 3.173, …  — paste optimizer output here',
  });
  pasteArea.addEventListener('input', () => {
    const nums = parseWeightList(pasteArea.value);
    if (nums.length === W_COUNT) {
      nums.forEach((n, i) => { inputs[i].value = String(n); });
      toast('Parameters filled in from paste');
    }
  });

  const body = el('div', {}, [
    el('p', {
      class: 'small',
      text: `These ${W_COUNT} numbers are the FSRS-5 memory model. The defaults were fitted across a very large public review dataset and work well for most people — change them only if you have run the FSRS optimizer against your own review history.`,
    }),
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Paste a parameter list' }),
      pasteArea,
    ]),
    grid,
  ]);

  const action = await sheet({
    title: 'FSRS parameters',
    body,
    actions: [
      { label: 'Reset', value: 'reset', kind: 'ghost' },
      { label: 'Save', value: 'save', kind: 'primary' },
    ],
  });

  if (action === 'reset') {
    await updateSettings({ w: [...DEFAULT_W] });
    toast('Parameters reset to defaults', 'success');
    refresh();
    return;
  }
  if (action !== 'save') return;

  const w = inputs.map((input) => parseFloat(input.value));
  const error = validateWeights(w);
  if (error) { toast(error, 'error'); return; }

  await updateSettings({ w });
  toast('Parameters saved — applies to future reviews', 'success');
  refresh();
}

function parseWeightList(text) {
  const cleaned = String(text).replace(/[[\]]/g, ' ');
  return cleaned
    .split(/[\s,]+/)
    .map((t) => parseFloat(t))
    .filter((n) => Number.isFinite(n));
}

/* ------------------------------------------------------------- explainer */

function showAlgorithmExplainer() {
  const p = (text) => el('p', { text });
  const h = (text) => el('h4', { text, style: { marginTop: '16px', color: 'var(--text)' } });

  return sheet({
    title: 'How FSRS schedules your cards',
    body: el('div', { class: 'small' }, [
      p('FSRS models each card with two numbers and predicts a third.'),
      h('Stability'),
      p('How long the memory lasts: the number of days until your chance of recalling the card drops to 90%. Every successful review multiplies it; a lapse cuts it back.'),
      h('Difficulty'),
      p('How hard this particular card is for you, from 1 to 10. It rises when you press Again and falls when you press Easy, with a pull back toward the middle so it cannot drift forever.'),
      h('Retrievability'),
      p('Your predicted chance of recalling the card right now, which decays along a power curve as time passes since the last review.'),
      h('The scheduling decision'),
      p('The next interval is simply the point where retrievability will have fallen to your desired-retention setting. Raise that setting and every interval shortens.'),
      h('Why grading honestly matters'),
      p('Pressing Good on a card you actually guessed inflates its stability, so it comes back far too late and you lose it. Swipe left whenever recall was not genuine — the algorithm handles the rest.'),
    ]),
    actions: [{ label: 'Got it', kind: 'primary' }],
  });
}

export { DEFAULT_SETTINGS, downloadText };
