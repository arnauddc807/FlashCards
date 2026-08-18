/**
 * FSRS-5 (Free Spaced Repetition Scheduler) — pure functions, no side effects.
 *
 * Implements the memory model only: given a card's memory state (stability,
 * difficulty), how long ago it was seen, and how the user graded it, produce the
 * next memory state. Turning that state into a due date is scheduler.js's job.
 *
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki
 */

/** Grades. FSRS is defined over exactly these four. */
export const Rating = Object.freeze({
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
});

export const RATING_NAMES = Object.freeze({
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
});

/** Card lifecycle states. */
export const State = Object.freeze({
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
});

export const STATE_NAMES = Object.freeze({
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
});

/**
 * The 19 FSRS-5 weights, in the order the formulas below consume them.
 * These are the defaults fitted over the open Anki review dataset; a user who
 * runs an optimizer against their own history can paste better ones into
 * Settings.
 */
export const DEFAULT_W = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105,
  7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
]);

/** Human-readable meaning of each weight, for the settings editor. */
export const W_LABELS = Object.freeze([
  'Initial stability — Again',
  'Initial stability — Hard',
  'Initial stability — Good',
  'Initial stability — Easy',
  'Initial difficulty — base',
  'Initial difficulty — grade slope',
  'Difficulty change per grade',
  'Difficulty mean reversion',
  'Stability growth — base',
  'Stability growth — stability penalty',
  'Stability growth — retrievability bonus',
  'Post-lapse stability — base',
  'Post-lapse stability — difficulty penalty',
  'Post-lapse stability — stability factor',
  'Post-lapse stability — retrievability factor',
  'Hard penalty',
  'Easy bonus',
  'Same-day stability — scale',
  'Same-day stability — offset',
]);

export const W_COUNT = DEFAULT_W.length;

/**
 * Forgetting curve shape. FSRS-4.5 onwards uses a power law rather than an
 * exponential, which fits long intervals far better.
 */
export const DECAY = -0.5;
/** Chosen so that retrievability is exactly 0.9 when elapsed === stability. */
export const FACTOR = 19 / 81;

export const MIN_STABILITY = 0.01;
export const MAX_STABILITY = 36500;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

export const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

const clampS = (s) => clamp(s, MIN_STABILITY, MAX_STABILITY);
const clampD = (d) => clamp(d, MIN_DIFFICULTY, MAX_DIFFICULTY);

/**
 * Probability of recalling a card `elapsedDays` after the last review, given
 * its stability. R(t) = (1 + FACTOR · t/S)^DECAY
 */
export function retrievability(elapsedDays, stability) {
  if (!(stability > 0)) return 0;
  const t = Math.max(elapsedDays, 0);
  return Math.pow(1 + (FACTOR * t) / stability, DECAY);
}

/**
 * Inverse of the forgetting curve: the interval at which recall probability
 * will have decayed to `desiredRetention`.
 */
export function intervalForRetention(stability, desiredRetention) {
  const r = clamp(desiredRetention, 0.5, 0.999);
  return (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

/** Stability of a brand-new card, straight from the weights. */
export function initialStability(w, rating) {
  return clampS(w[rating - 1]);
}

/** Difficulty of a brand-new card. D0(G) = w4 − e^(w5·(G−1)) + 1 */
export function initialDifficulty(w, rating) {
  return clampD(w[4] - Math.exp(w[5] * (rating - 1)) + 1);
}

/**
 * Difficulty update: a linear step toward easier/harder, damped near the ends
 * of the scale, then pulled back toward the "Easy" anchor (mean reversion) so
 * difficulty cannot drift forever.
 */
export function nextDifficulty(w, difficulty, rating) {
  const delta = -w[6] * (rating - Rating.Good);
  // Linear damping: the closer D is to 10, the less an Again moves it.
  const damped = difficulty + (delta * (10 - difficulty)) / 9;
  const anchor = initialDifficulty(w, Rating.Easy);
  return clampD(w[7] * anchor + (1 - w[7]) * damped);
}

/**
 * Stability after a successful recall (Hard / Good / Easy). Growth shrinks as
 * stability rises and as retrievability rises — reviewing something you were
 * about to forget teaches you more than reviewing something fresh.
 */
export function stabilityAfterRecall(w, difficulty, stability, r, rating) {
  const hardPenalty = rating === Rating.Hard ? w[15] : 1;
  const easyBonus = rating === Rating.Easy ? w[16] : 1;
  const growth =
    Math.exp(w[8]) *
    (11 - difficulty) *
    Math.pow(stability, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return clampS(stability * (1 + growth));
}

/**
 * Stability after a lapse (Again). FSRS-5 additionally caps this at the old
 * stability: forgetting a card must never make it stronger.
 */
export function stabilityAfterForget(w, difficulty, stability, r) {
  const sf =
    w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  return clampS(Math.min(sf, stability));
}

/**
 * Stability after a same-day repeat. New in FSRS-5: previously, re-reviews
 * inside a single day were simply ignored by the model.
 */
export function stabilityAfterSameDay(w, stability, rating) {
  return clampS(stability * Math.exp(w[17] * (rating - 3 + w[18])));
}

/**
 * Advance a memory state by one review.
 *
 * @param {number[]} w              19 FSRS-5 weights
 * @param {{stability:number,difficulty:number}|null} memory  null for a new card
 * @param {number} rating           Rating.*
 * @param {number} elapsedDays      days since the last review (0 for same-day)
 * @returns {{stability:number, difficulty:number, retrievability:number}}
 */
export function nextMemoryState(w, memory, rating, elapsedDays) {
  if (!memory || !(memory.stability > 0)) {
    return {
      stability: initialStability(w, rating),
      difficulty: initialDifficulty(w, rating),
      retrievability: 0,
    };
  }

  const r = retrievability(elapsedDays, memory.stability);
  const difficulty = nextDifficulty(w, memory.difficulty, rating);

  let stability;
  if (elapsedDays < 1) {
    // Same-day repeat — the forgetting curve has barely moved, so the
    // long-term formulas would wildly overestimate what was learned.
    stability = stabilityAfterSameDay(w, memory.stability, rating);
  } else if (rating === Rating.Again) {
    stability = stabilityAfterForget(w, difficulty, memory.stability, r);
  } else {
    stability = stabilityAfterRecall(w, difficulty, memory.stability, r, rating);
  }

  return { stability, difficulty, retrievability: r };
}

/* ------------------------------------------------------------------ *
 * Interval fuzz
 * ------------------------------------------------------------------ */

const FUZZ_RANGES = [
  { start: 2.5, end: 7.0, factor: 0.15 },
  { start: 7.0, end: 20.0, factor: 0.1 },
  { start: 20.0, end: Infinity, factor: 0.05 },
];

/**
 * Spread of acceptable intervals around the ideal one. Without this, a deck
 * imported in one sitting comes back in one lump forever.
 */
export function fuzzRange(interval, elapsedDays, maximumInterval) {
  let delta = 1.0;
  for (const range of FUZZ_RANGES) {
    delta += range.factor * Math.max(Math.min(interval, range.end) - range.start, 0);
  }
  const i = Math.min(interval, maximumInterval);
  let minIvl = Math.max(2, Math.round(i - delta));
  const maxIvl = Math.min(Math.round(i + delta), maximumInterval);
  if (i > elapsedDays) minIvl = Math.max(minIvl, elapsedDays + 1);
  minIvl = Math.min(minIvl, maxIvl);
  return [minIvl, maxIvl];
}

/** Deterministic PRNG so a card's fuzz doesn't change when the app reloads. */
export function seededRandom(seed) {
  let h = 2166136261 >>> 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // xorshift32
  let x = h >>> 0 || 1;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

/** Apply fuzz to an interval that is already rounded to whole days. */
export function applyFuzz(interval, elapsedDays, maximumInterval, seed) {
  if (interval < 2.5) return interval;
  const [minIvl, maxIvl] = fuzzRange(interval, elapsedDays, maximumInterval);
  if (maxIvl <= minIvl) return minIvl;
  return Math.floor(seededRandom(seed) * (maxIvl - minIvl + 1)) + minIvl;
}

/**
 * Turn a stability into a whole-day interval, honouring the user's retention
 * target, interval cap and fuzz preference.
 */
export function stabilityToInterval(stability, opts) {
  const {
    desiredRetention = 0.9,
    maximumInterval = 36500,
    enableFuzz = true,
    elapsedDays = 0,
    seed = 0,
  } = opts || {};
  const ideal = intervalForRetention(stability, desiredRetention);
  let days = clamp(Math.round(ideal), 1, maximumInterval);
  if (enableFuzz) days = applyFuzz(days, elapsedDays, maximumInterval, seed);
  return clamp(Math.round(days), 1, maximumInterval);
}

/** Validate a weight vector pasted by the user. Returns an error string or null. */
export function validateWeights(w) {
  if (!Array.isArray(w)) return 'Parameters must be a list of numbers.';
  if (w.length !== W_COUNT) return `Expected ${W_COUNT} parameters, got ${w.length}.`;
  for (let i = 0; i < w.length; i++) {
    if (typeof w[i] !== 'number' || !Number.isFinite(w[i])) {
      return `Parameter ${i} is not a finite number.`;
    }
  }
  if (w.slice(0, 4).some((x) => x <= 0)) return 'Initial stabilities (0–3) must be positive.';
  return null;
}
