/**
 * Statistics derived from cards and the review log.
 *
 * Everything here is pure: hand it cards + reviews, get numbers back. The stats
 * views only lay them out.
 */

import { State, Rating, retrievability } from './fsrs.js';
import { DAY, dayIndex, dayStart, dayEnd } from './scheduler.js';

export const MATURE_THRESHOLD_DAYS = 21;

/** Card counts broken down by lifecycle state, plus young/mature split. */
export function stateBreakdown(cards) {
  const out = {
    new: 0, learning: 0, review: 0, relearning: 0,
    young: 0, mature: 0, suspended: 0, total: cards.length,
  };
  for (const c of cards) {
    if (c.suspended) { out.suspended++; continue; }
    switch (c.state) {
      case State.New: out.new++; break;
      case State.Learning: out.learning++; break;
      case State.Relearning: out.relearning++; break;
      default:
        out.review++;
        if ((c.scheduledDays || 0) >= MATURE_THRESHOLD_DAYS) out.mature++;
        else out.young++;
    }
  }
  return out;
}

/** How many cards are actually waiting right now / before the day rolls over. */
export function dueCounts(cards, settings, now = Date.now()) {
  const end = dayEnd(now, settings.dayCutoffHour);
  let dueNow = 0, dueToday = 0, newAvailable = 0, learningDue = 0;
  for (const c of cards) {
    if (c.suspended) continue;
    if (c.state === State.New) { newAvailable++; continue; }
    if (c.due <= now) dueNow++;
    if (c.due < end) {
      dueToday++;
      if (c.state === State.Learning || c.state === State.Relearning) learningDue++;
    }
  }
  return { dueNow, dueToday, newAvailable, learningDue };
}

/**
 * Daily review counts for the last `days` days, split by grade.
 * Returned oldest-first so it plots left-to-right.
 */
export function reviewHistory(reviews, days = 30, cutoffHour = 4, now = Date.now()) {
  const todayIdx = dayIndex(now, cutoffHour);
  const startIdx = todayIdx - days + 1;
  const buckets = [];
  for (let i = 0; i < days; i++) {
    buckets.push({
      dayIdx: startIdx + i,
      ts: (startIdx + i) * DAY,
      again: 0, hard: 0, good: 0, easy: 0,
      total: 0, timeMs: 0,
    });
  }
  for (const r of reviews) {
    const idx = dayIndex(r.ts, cutoffHour);
    if (idx < startIdx || idx > todayIdx) continue;
    const b = buckets[idx - startIdx];
    if (!b) continue;
    b.total++;
    b.timeMs += r.durationMs || 0;
    if (r.rating === Rating.Again) b.again++;
    else if (r.rating === Rating.Hard) b.hard++;
    else if (r.rating === Rating.Good) b.good++;
    else b.easy++;
  }
  return buckets;
}

/**
 * How many cards fall due on each of the next `days` days, if nothing new is
 * studied. The honest answer to "how much work am I signing up for?".
 */
export function dueForecast(cards, days = 30, cutoffHour = 4, now = Date.now()) {
  const start = dayStart(now, cutoffHour);
  const buckets = Array.from({ length: days }, (_, i) => ({
    dayIdx: Math.floor(start / DAY) + i,
    ts: start + i * DAY,
    young: 0, mature: 0, total: 0,
  }));
  let backlog = 0;
  for (const c of cards) {
    if (c.suspended || c.state === State.New) continue;
    const offset = Math.floor((c.due - start) / DAY);
    if (offset < 0) { backlog++; continue; }
    if (offset >= days) continue;
    const b = buckets[offset];
    b.total++;
    if ((c.scheduledDays || 0) >= MATURE_THRESHOLD_DAYS) b.mature++;
    else b.young++;
  }
  // Anything overdue is work for today, so fold it into the first bar.
  if (buckets.length) {
    buckets[0].total += backlog;
    buckets[0].young += backlog;
  }
  return { buckets, backlog };
}

/**
 * True retention: of the reviews of already-learned cards, what share were
 * recalled? This is the number to compare against your desired-retention
 * setting — if they diverge, the FSRS weights need refitting.
 */
export function trueRetention(reviews, { sinceTs = 0, matureOnly = null } = {}) {
  let passed = 0, total = 0;
  for (const r of reviews) {
    if (r.ts < sinceTs) continue;
    if (r.stateBefore !== State.Review) continue; // learning reps aren't retention
    if (matureOnly !== null) {
      const isMature = (r.scheduledDays || 0) >= MATURE_THRESHOLD_DAYS;
      if (matureOnly !== isMature) continue;
    }
    total++;
    if (r.rating !== Rating.Again) passed++;
  }
  return { passed, total, rate: total ? passed / total : null };
}

/** Average predicted recall across the collection, right now. */
export function averageRetrievability(cards, now = Date.now()) {
  let sum = 0, n = 0;
  for (const c of cards) {
    if (c.suspended || c.state === State.New || !c.stability) continue;
    const elapsed = c.lastReview ? Math.max(0, (now - c.lastReview) / DAY) : 0;
    sum += retrievability(elapsed, c.stability);
    n++;
  }
  return n ? sum / n : null;
}

/** Histogram of a numeric card property, for the difficulty/stability charts. */
export function histogram(values, binCount, min, max) {
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: min + ((max - min) * i) / binCount,
    to: min + ((max - min) * (i + 1)) / binCount,
    count: 0,
  }));
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor(((v - min) / (max - min)) * binCount);
    idx = Math.min(Math.max(idx, 0), binCount - 1);
    bins[idx].count++;
  }
  return bins;
}

/** Consecutive study days ending today (or yesterday — today still counts as alive). */
export function studyStreak(reviews, cutoffHour = 4, now = Date.now()) {
  if (!reviews.length) return { current: 0, longest: 0, studiedToday: false };
  const daysWithReviews = new Set(reviews.map((r) => dayIndex(r.ts, cutoffHour)));
  const today = dayIndex(now, cutoffHour);
  const studiedToday = daysWithReviews.has(today);

  let current = 0;
  let cursor = studiedToday ? today : today - 1;
  while (daysWithReviews.has(cursor)) { current++; cursor--; }

  const sorted = [...daysWithReviews].sort((a, b) => a - b);
  let longest = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, studiedToday };
}

/** Everything the deck stats screen needs, in one pass. */
export function deckStats(cards, reviews, settings, now = Date.now()) {
  const breakdown = stateBreakdown(cards);
  const due = dueCounts(cards, settings, now);
  const history = reviewHistory(reviews, 30, settings.dayCutoffHour, now);
  const forecast = dueForecast(cards, 30, settings.dayCutoffHour, now);
  const streak = studyStreak(reviews, settings.dayCutoffHour, now);

  const monthAgo = now - 30 * DAY;
  const retentionAll = trueRetention(reviews);
  const retention30 = trueRetention(reviews, { sinceTs: monthAgo });
  const retentionMature = trueRetention(reviews, { matureOnly: true });
  const retentionYoung = trueRetention(reviews, { matureOnly: false });

  const reviewCards = cards.filter((c) => !c.suspended && c.state !== State.New && c.stability > 0);
  const stabilities = reviewCards.map((c) => c.stability);
  const difficulties = reviewCards.map((c) => c.difficulty);
  const intervals = reviewCards.map((c) => c.scheduledDays || 0);

  const todayIdx = dayIndex(now, settings.dayCutoffHour);
  const todayBucket = history.find((b) => b.dayIdx === todayIdx);

  return {
    breakdown,
    due,
    history,
    forecast,
    streak,
    retention: {
      all: retentionAll,
      last30: retention30,
      mature: retentionMature,
      young: retentionYoung,
    },
    averageRetrievability: averageRetrievability(cards, now),
    averageStability: mean(stabilities),
    averageDifficulty: mean(difficulties),
    averageInterval: mean(intervals),
    difficultyHistogram: histogram(difficulties, 9, 1, 10),
    stabilityValues: stabilities,
    totalReviews: reviews.length,
    totalTimeMs: reviews.reduce((a, r) => a + (r.durationMs || 0), 0),
    today: todayBucket || { total: 0, again: 0, hard: 0, good: 0, easy: 0, timeMs: 0 },
    lapses: cards.reduce((a, c) => a + (c.lapses || 0), 0),
    reviewsPerDay30: history.reduce((a, b) => a + b.total, 0) / 30,
  };
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Cards that keep being forgotten — worth rewriting rather than re-drilling. */
export function leeches(cards, threshold = 4) {
  return cards
    .filter((c) => (c.lapses || 0) >= threshold)
    .sort((a, b) => (b.lapses || 0) - (a.lapses || 0));
}
