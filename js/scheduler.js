/**
 * Scheduling layer: turns FSRS memory states into due dates.
 *
 * FSRS says how strong a memory is; it says nothing about learning steps,
 * relearning steps or day boundaries. Those live here, modelled on Anki's
 * FSRS integration so the behaviour is familiar.
 */

import {
  Rating,
  State,
  nextMemoryState,
  stabilityToInterval,
  retrievability,
} from './fsrs.js';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A freshly created card, before it has ever been shown. */
export function newCardState() {
  return {
    state: State.New,
    due: 0,
    stability: 0,
    difficulty: 0,
    step: 0,
    reps: 0,
    lapses: 0,
    lastReview: 0,
    scheduledDays: 0,
    elapsedDays: 0,
  };
}

/**
 * Start of the study day containing `ts`. Reviews after midnight belong to the
 * previous day until the cutoff hour, so a late-night session isn't split in
 * two on the stats screen.
 */
export function dayStart(ts, cutoffHour = 4) {
  const d = new Date(ts);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), cutoffHour, 0, 0, 0);
  if (d.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
  return start.getTime();
}

/** Index of the study day, for grouping and streak counting. */
export function dayIndex(ts, cutoffHour = 4) {
  return Math.floor(dayStart(ts, cutoffHour) / DAY);
}

/** End of the study day containing `ts` — anything due before this is "due today". */
export function dayEnd(ts, cutoffHour = 4) {
  return dayStart(ts, cutoffHour) + DAY;
}

/** Parse "1m 10m 1h 1d" into milliseconds. Invalid entries are dropped. */
export function parseSteps(text) {
  if (!text) return [];
  return String(text)
    .split(/[\s,]+/)
    .map((tok) => tok.trim().toLowerCase())
    .filter(Boolean)
    .map((tok) => {
      const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(tok);
      if (!m) return null;
      const n = parseFloat(m[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      const unit = m[2] || 'm';
      const mult = { s: 1000, m: MINUTE, h: HOUR, d: DAY }[unit];
      return n * mult;
    })
    .filter((x) => x !== null);
}

/** Render milliseconds as a compact human interval: 25m, 3h, 4d, 2.1mo, 1.4y. */
export function formatInterval(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) {
    const h = ms / HOUR;
    return `${h < 10 ? h.toFixed(h % 1 >= 0.1 ? 1 : 0) : Math.round(h)}h`;
  }
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30.44).toFixed(1)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

/** Elapsed days since the last review, as FSRS wants it (0 for a new card). */
function elapsedDaysFor(card, now) {
  if (!card.lastReview) return 0;
  return Math.max(0, (now - card.lastReview) / DAY);
}

/**
 * Compute what happens to `card` for a single rating, without mutating it.
 *
 * @returns {{card: object, interval: number, isSameDay: boolean}}
 *          `interval` is milliseconds from `now` until the card is due again.
 */
export function preview(card, rating, settings, now = Date.now()) {
  const w = settings.w;
  const learningSteps = parseSteps(settings.learningSteps);
  const relearningSteps = parseSteps(settings.relearningSteps);
  const elapsed = elapsedDaysFor(card, now);

  const memory = card.stability > 0
    ? { stability: card.stability, difficulty: card.difficulty }
    : null;
  const next = nextMemoryState(w, memory, rating, elapsed);

  const out = {
    ...card,
    stability: next.stability,
    difficulty: next.difficulty,
    reps: (card.reps || 0) + 1,
    lastReview: now,
    elapsedDays: elapsed,
  };

  /** Graduate to the review queue with a full FSRS-derived interval. */
  const toReview = (minDays = 1) => {
    const days = Math.max(
      minDays,
      stabilityToInterval(next.stability, {
        desiredRetention: settings.desiredRetention,
        maximumInterval: settings.maximumInterval,
        enableFuzz: settings.enableFuzz,
        elapsedDays: elapsed,
        seed: `${card.id}:${out.reps}`,
      })
    );
    out.state = State.Review;
    out.step = 0;
    out.scheduledDays = days;
    out.due = now + days * DAY;
    return { card: out, interval: days * DAY, isSameDay: false };
  };

  /** Stay in a step queue, due in minutes rather than days. */
  const toStep = (state, stepIndex, steps) => {
    const delay = steps[Math.min(stepIndex, steps.length - 1)] ?? 10 * MINUTE;
    out.state = state;
    out.step = stepIndex;
    out.scheduledDays = 0;
    out.due = now + delay;
    return { card: out, interval: delay, isSameDay: delay < DAY };
  };

  const isLearning = card.state === State.Learning || card.state === State.Relearning;
  const steps = card.state === State.Relearning ? relearningSteps : learningSteps;

  switch (card.state) {
    case State.New: {
      if (learningSteps.length === 0) return toReview();
      if (rating === Rating.Again) return toStep(State.Learning, 0, learningSteps);
      if (rating === Rating.Hard) {
        // Anki convention: Hard on the first step waits ~1.5× that step.
        const delay = learningSteps.length > 1
          ? (learningSteps[0] + learningSteps[1]) / 2
          : learningSteps[0] * 1.5;
        out.state = State.Learning;
        out.step = 0;
        out.scheduledDays = 0;
        out.due = now + delay;
        return { card: out, interval: delay, isSameDay: delay < DAY };
      }
      if (rating === Rating.Good) {
        if (learningSteps.length > 1) return toStep(State.Learning, 1, learningSteps);
        return toReview();
      }
      return toReview(); // Easy skips the learning queue entirely
    }

    case State.Learning:
    case State.Relearning: {
      const active = steps.length ? steps : learningSteps;
      if (active.length === 0) return toReview();
      if (rating === Rating.Again) return toStep(card.state, 0, active);
      if (rating === Rating.Hard) {
        const idx = Math.min(card.step || 0, active.length - 1);
        const delay = active.length > 1 && idx + 1 < active.length
          ? (active[idx] + active[idx + 1]) / 2
          : active[idx] * 1.5;
        out.state = card.state;
        out.step = idx;
        out.scheduledDays = 0;
        out.due = now + delay;
        return { card: out, interval: delay, isSameDay: delay < DAY };
      }
      if (rating === Rating.Good) {
        const nextStep = (card.step || 0) + 1;
        if (nextStep >= active.length) return toReview();
        return toStep(card.state, nextStep, active);
      }
      return toReview(); // Easy graduates immediately
    }

    case State.Review:
    default: {
      if (rating === Rating.Again) {
        out.lapses = (card.lapses || 0) + 1;
        if (relearningSteps.length === 0) return toReview();
        return toStep(State.Relearning, 0, relearningSteps);
      }
      return toReview();
    }
  }
}

/** Preview all four ratings at once, for the interval hints on the buttons. */
export function previewAll(card, settings, now = Date.now()) {
  const out = {};
  for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    out[rating] = preview(card, rating, settings, now);
  }
  return out;
}

/**
 * Apply a rating for real: returns the updated card plus the review-log entry
 * to append to history.
 */
export function applyReview(card, rating, settings, now = Date.now(), durationMs = 0) {
  const before = {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
  };
  const { card: updated, interval } = preview(card, rating, settings, now);
  const log = {
    cardId: card.id,
    deckId: card.deckId,
    ts: now,
    rating,
    stateBefore: before.state,
    stateAfter: updated.state,
    elapsedDays: updated.elapsedDays,
    scheduledDays: updated.scheduledDays,
    stability: updated.stability,
    difficulty: updated.difficulty,
    retrievability: before.stability > 0
      ? retrievability(updated.elapsedDays, before.stability)
      : 0,
    intervalMs: interval,
    durationMs,
  };
  return { card: updated, log };
}

/** Current recall probability, for the stats screen. */
export function currentRetrievability(card, now = Date.now()) {
  if (!card.stability || card.state === State.New) return null;
  return retrievability(elapsedDaysFor(card, now), card.stability);
}

/**
 * Build the study queue for a session.
 *
 * Order: cards already due in a learning step first (they are time-sensitive),
 * then reviews, then new cards — each capped by the daily limits, minus what
 * has already been studied today.
 */
export function buildQueue(cards, settings, now = Date.now(), doneToday = { new: 0, review: 0 }) {
  const endOfDay = dayEnd(now, settings.dayCutoffHour);
  const learning = [];
  const review = [];
  const fresh = [];

  for (const card of cards) {
    if (card.suspended) continue;
    if (card.state === State.New) {
      fresh.push(card);
    } else if (card.state === State.Learning || card.state === State.Relearning) {
      // Learning cards are due within the session, so pull them in slightly early.
      if (card.due <= Math.min(endOfDay, now + 20 * MINUTE)) learning.push(card);
    } else if (card.due < endOfDay) {
      review.push(card);
    }
  }

  learning.sort((a, b) => a.due - b.due);
  review.sort((a, b) => a.due - b.due);

  const newLimit = Math.max(0, (settings.newPerDay ?? 20) - (doneToday.new || 0));
  const reviewLimit = Math.max(0, (settings.reviewsPerDay ?? 200) - (doneToday.review || 0));

  const pickedNew = settings.newCardOrder === 'random'
    ? shuffle(fresh.slice()).slice(0, newLimit)
    : fresh.slice().sort((a, b) => (a.position || 0) - (b.position || 0)).slice(0, newLimit);

  return {
    learning,
    review: review.slice(0, reviewLimit),
    new: pickedNew,
    counts: {
      learning: learning.length,
      review: Math.min(review.length, reviewLimit),
      new: pickedNew.length,
      reviewAvailable: review.length,
      newAvailable: fresh.length,
    },
  };
}

/**
 * n items drawn uniformly at random, in random order, without repeats.
 * Partial Fisher-Yates over a copy; `rand` is injectable for tests.
 */
export function sampleRandom(items, n, rand = Math.random) {
  const pool = items.slice();
  const take = Math.max(0, Math.min(n, pool.length));
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.length = take;
  return pool;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
