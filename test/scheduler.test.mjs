import test from 'node:test';
import assert from 'node:assert/strict';

import { Rating, State, DEFAULT_W } from '../js/fsrs.js';
import {
  newCardState, parseSteps, formatInterval, preview, previewAll,
  applyReview, buildQueue, dayStart, dayEnd, dayIndex, MINUTE, DAY,
} from '../js/scheduler.js';

const settings = {
  w: DEFAULT_W,
  desiredRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: false,
  learningSteps: '1m 10m',
  relearningSteps: '10m',
  dayCutoffHour: 4,
  newPerDay: 20,
  reviewsPerDay: 200,
  newCardOrder: 'sequential',
};

const makeCard = (over = {}) => ({ id: 'c1', deckId: 'd1', ...newCardState(), ...over });

test('parseSteps understands seconds, minutes, hours and days', () => {
  assert.deepEqual(parseSteps('1m 10m'), [MINUTE, 10 * MINUTE]);
  assert.deepEqual(parseSteps('30s'), [30_000]);
  assert.deepEqual(parseSteps('2h'), [2 * 3600_000]);
  assert.deepEqual(parseSteps('3d'), [3 * DAY]);
  assert.deepEqual(parseSteps('15'), [15 * MINUTE], 'bare numbers mean minutes');
});

test('parseSteps drops junk instead of throwing', () => {
  assert.deepEqual(parseSteps('1m banana -5m 0m 10m'), [MINUTE, 10 * MINUTE]);
  assert.deepEqual(parseSteps(''), []);
  assert.deepEqual(parseSteps(null), []);
});

test('formatInterval picks a readable unit', () => {
  assert.equal(formatInterval(MINUTE), '1m');
  assert.equal(formatInterval(45 * MINUTE), '45m');
  assert.equal(formatInterval(3 * 3600_000), '3h');
  assert.equal(formatInterval(4 * DAY), '4d');
  assert.match(formatInterval(60 * DAY), /mo$/);
  assert.match(formatInterval(500 * DAY), /y$/);
});

test('a new card graded Good enters the second learning step', () => {
  const { card, interval } = preview(makeCard(), Rating.Good, settings);
  assert.equal(card.state, State.Learning);
  assert.equal(card.step, 1);
  assert.equal(interval, 10 * MINUTE);
});

test('a new card graded Easy skips learning entirely', () => {
  const { card, interval } = preview(makeCard(), Rating.Easy, settings);
  assert.equal(card.state, State.Review);
  assert.ok(interval >= DAY, 'Easy should graduate to at least a day');
});

test('a new card graded Again stays on the first learning step', () => {
  const { card, interval } = preview(makeCard(), Rating.Again, settings);
  assert.equal(card.state, State.Learning);
  assert.equal(card.step, 0);
  assert.equal(interval, MINUTE);
});

test('with no learning steps, a new card goes straight to review', () => {
  const noSteps = { ...settings, learningSteps: '' };
  const { card } = preview(makeCard(), Rating.Good, noSteps);
  assert.equal(card.state, State.Review);
});

test('the last learning step graduates the card on Good', () => {
  const card = makeCard({ state: State.Learning, step: 1, stability: 3.17, difficulty: 5, lastReview: Date.now() - MINUTE });
  const { card: next } = preview(card, Rating.Good, settings);
  assert.equal(next.state, State.Review);
  assert.ok(next.scheduledDays >= 1);
});

test('a review card graded Again lapses into relearning and counts the lapse', () => {
  const now = Date.now();
  const card = makeCard({
    state: State.Review, stability: 40, difficulty: 5,
    lastReview: now - 30 * DAY, scheduledDays: 30, lapses: 2, reps: 6,
  });
  const { card: next, interval } = preview(card, Rating.Again, settings, now);
  assert.equal(next.state, State.Relearning);
  assert.equal(next.lapses, 3);
  assert.equal(interval, 10 * MINUTE);
  assert.ok(next.stability < card.stability, 'a lapse must cut stability');
});

test('grade ordering holds: Again < Hard < Good < Easy intervals', () => {
  const now = Date.now();
  const card = makeCard({
    state: State.Review, stability: 30, difficulty: 5,
    lastReview: now - 25 * DAY, scheduledDays: 25,
  });
  const all = previewAll(card, settings, now);
  assert.ok(all[Rating.Again].interval < all[Rating.Hard].interval);
  assert.ok(all[Rating.Hard].interval < all[Rating.Good].interval);
  assert.ok(all[Rating.Good].interval < all[Rating.Easy].interval);
});

test('intervals never exceed the configured maximum', () => {
  const capped = { ...settings, maximumInterval: 30 };
  const now = Date.now();
  const card = makeCard({
    state: State.Review, stability: 5000, difficulty: 2,
    lastReview: now - 400 * DAY, scheduledDays: 400,
  });
  const { card: next } = preview(card, Rating.Easy, capped, now);
  assert.ok(next.scheduledDays <= 30, `got ${next.scheduledDays}`);
});

test('applyReview produces a log entry describing the transition', () => {
  const now = Date.now();
  const card = makeCard({
    state: State.Review, stability: 20, difficulty: 5,
    lastReview: now - 18 * DAY, scheduledDays: 18,
  });
  const { card: next, log } = applyReview(card, Rating.Good, settings, now, 4200);
  assert.equal(log.cardId, card.id);
  assert.equal(log.deckId, card.deckId);
  assert.equal(log.rating, Rating.Good);
  assert.equal(log.stateBefore, State.Review);
  assert.equal(log.stateAfter, next.state);
  assert.equal(log.durationMs, 4200);
  assert.ok(log.retrievability > 0 && log.retrievability < 1);
  assert.ok(Math.abs(log.elapsedDays - 18) < 0.001);
});

test('preview never mutates the card it is given', () => {
  const card = makeCard({ state: State.Review, stability: 10, difficulty: 5, lastReview: Date.now() - DAY });
  const snapshot = JSON.stringify(card);
  preview(card, Rating.Again, settings);
  previewAll(card, settings);
  assert.equal(JSON.stringify(card), snapshot);
});

test('day boundaries respect the cutoff hour', () => {
  const at2am = new Date(2026, 0, 15, 2, 0, 0).getTime();
  const at6am = new Date(2026, 0, 15, 6, 0, 0).getTime();
  // 2am belongs to the previous study day when the cutoff is 4am.
  assert.equal(dayIndex(at2am, 4) + 1, dayIndex(at6am, 4));
  assert.equal(dayEnd(at6am, 4) - dayStart(at6am, 4), DAY);
});

test('buildQueue respects daily limits and what is already done today', () => {
  const now = Date.now();
  const cards = [
    ...Array.from({ length: 50 }, (_, i) => makeCard({ id: `n${i}`, position: i })),
    ...Array.from({ length: 40 }, (_, i) => makeCard({
      id: `r${i}`, state: State.Review, due: now - DAY, stability: 10, difficulty: 5, lastReview: now - 10 * DAY,
    })),
  ];
  const limited = { ...settings, newPerDay: 5, reviewsPerDay: 10 };
  const q = buildQueue(cards, limited, now, { new: 2, review: 3 });
  assert.equal(q.new.length, 3, '5 per day minus 2 already done');
  assert.equal(q.review.length, 7, '10 per day minus 3 already done');
  assert.equal(q.counts.newAvailable, 50);
});

test('buildQueue skips suspended cards and cards not yet due', () => {
  const now = Date.now();
  const cards = [
    makeCard({ id: 'a', state: State.Review, due: now - DAY, stability: 5, difficulty: 5 }),
    makeCard({ id: 'b', state: State.Review, due: now + 30 * DAY, stability: 5, difficulty: 5 }),
    makeCard({ id: 'c', state: State.Review, due: now - DAY, stability: 5, difficulty: 5, suspended: true }),
    makeCard({ id: 'd', suspended: true }),
  ];
  const q = buildQueue(cards, settings, now);
  assert.deepEqual(q.review.map((c) => c.id), ['a']);
  assert.equal(q.new.length, 0);
});

test('learning cards due within the session are pulled into the queue', () => {
  const now = Date.now();
  const cards = [
    makeCard({ id: 'soon', state: State.Learning, due: now + 5 * MINUTE, stability: 1, difficulty: 5 }),
    makeCard({ id: 'later', state: State.Learning, due: now + 6 * 3600_000, stability: 1, difficulty: 5 }),
  ];
  const q = buildQueue(cards, settings, now);
  assert.deepEqual(q.learning.map((c) => c.id), ['soon']);
});

test('a full lifecycle keeps every value finite and sane', () => {
  let card = makeCard();
  let now = Date.now();
  const grades = [3, 3, 1, 3, 2, 3, 4, 1, 3, 3, 4, 3];
  for (const g of grades) {
    const { card: next } = preview(card, g, settings, now);
    assert.ok(Number.isFinite(next.stability) && next.stability > 0);
    assert.ok(next.difficulty >= 1 && next.difficulty <= 10);
    assert.ok(next.due > now, 'a graded card must be scheduled into the future');
    card = next;
    now = card.due;
  }
  assert.ok(card.reps === grades.length);
});
