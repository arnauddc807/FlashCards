import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Rating, State, DEFAULT_W, W_COUNT,
  retrievability, intervalForRetention, nextMemoryState,
  initialDifficulty, nextDifficulty, stabilityAfterForget,
  stabilityToInterval, validateWeights, fuzzRange, seededRandom,
} from '../js/fsrs.js';

test('retrievability is exactly 0.9 when elapsed equals stability', () => {
  for (const s of [1, 5, 42, 365]) {
    assert.ok(Math.abs(retrievability(s, s) - 0.9) < 1e-12, `S=${s}`);
  }
});

test('retrievability decays monotonically and stays in (0, 1]', () => {
  let prev = 1.1;
  for (const t of [0, 1, 5, 20, 100, 1000]) {
    const r = retrievability(t, 10);
    assert.ok(r <= prev, 'must not increase');
    assert.ok(r > 0 && r <= 1, `r=${r} out of range`);
    prev = r;
  }
});

test('intervalForRetention inverts the forgetting curve', () => {
  for (const s of [2, 17, 200]) {
    for (const target of [0.8, 0.9, 0.95]) {
      const ivl = intervalForRetention(s, target);
      assert.ok(Math.abs(retrievability(ivl, s) - target) < 1e-9);
    }
  }
});

test('lower desired retention produces longer intervals', () => {
  const s = 30;
  const strict = intervalForRetention(s, 0.95);
  const relaxed = intervalForRetention(s, 0.80);
  assert.ok(relaxed > strict);
});

test('initial stability is ordered Again < Hard < Good < Easy', () => {
  const s = [1, 2, 3, 4].map((g) => nextMemoryState(DEFAULT_W, null, g, 0).stability);
  assert.ok(s[0] < s[1] && s[1] < s[2] && s[2] < s[3], JSON.stringify(s));
});

test('initial difficulty falls as the first grade improves', () => {
  const d = [1, 2, 3, 4].map((g) => initialDifficulty(DEFAULT_W, g));
  assert.ok(d[0] > d[1] && d[1] > d[2] && d[2] > d[3], JSON.stringify(d));
  for (const x of d) assert.ok(x >= 1 && x <= 10);
});

test('difficulty stays clamped to 1..10 under repeated extreme grading', () => {
  let d = 5;
  for (let i = 0; i < 200; i++) d = nextDifficulty(DEFAULT_W, d, Rating.Again);
  assert.ok(d <= 10 && d >= 1, `d=${d}`);
  for (let i = 0; i < 200; i++) d = nextDifficulty(DEFAULT_W, d, Rating.Easy);
  assert.ok(d <= 10 && d >= 1, `d=${d}`);
});

test('a lapse never increases stability', () => {
  for (const s of [1, 10, 100, 1000]) {
    const after = stabilityAfterForget(DEFAULT_W, 5, s, 0.9);
    assert.ok(after <= s, `S=${s} -> ${after}`);
  }
});

test('successful reviews grow stability, Easy more than Good more than Hard', () => {
  const memory = { stability: 10, difficulty: 5 };
  const hard = nextMemoryState(DEFAULT_W, memory, Rating.Hard, 10).stability;
  const good = nextMemoryState(DEFAULT_W, memory, Rating.Good, 10).stability;
  const easy = nextMemoryState(DEFAULT_W, memory, Rating.Easy, 10).stability;
  assert.ok(hard > memory.stability, 'hard should still grow');
  assert.ok(good > hard, 'good > hard');
  assert.ok(easy > good, 'easy > good');
});

test('stability growth is larger when the card was closer to being forgotten', () => {
  const memory = { stability: 20, difficulty: 5 };
  const fresh = nextMemoryState(DEFAULT_W, memory, Rating.Good, 1).stability;
  const overdue = nextMemoryState(DEFAULT_W, memory, Rating.Good, 40).stability;
  assert.ok(overdue > fresh, `overdue=${overdue} fresh=${fresh}`);
});

test('easier cards gain stability faster than difficult ones', () => {
  const easyCard = nextMemoryState(DEFAULT_W, { stability: 10, difficulty: 2 }, Rating.Good, 10).stability;
  const hardCard = nextMemoryState(DEFAULT_W, { stability: 10, difficulty: 9 }, Rating.Good, 10).stability;
  assert.ok(easyCard > hardCard);
});

test('same-day repeats use the short-term formula, not the long-term one', () => {
  const memory = { stability: 10, difficulty: 5 };
  // The short-term formula is a fixed multiplier exp(w17*(g-3+w18)) on
  // stability, independent of difficulty and of how much time has passed.
  for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const expected = memory.stability * Math.exp(DEFAULT_W[17] * (grade - 3 + DEFAULT_W[18]));
    const actual = nextMemoryState(DEFAULT_W, memory, grade, 0).stability;
    assert.ok(Math.abs(actual - expected) < 1e-9, `grade ${grade}: ${actual} vs ${expected}`);
  }
});

test('a same-day repeat shrinks stability when graded Again', () => {
  const memory = { stability: 10, difficulty: 5 };
  const after = nextMemoryState(DEFAULT_W, memory, Rating.Again, 0).stability;
  assert.ok(after < memory.stability, `${after} should be below ${memory.stability}`);
});

test('a same-day repeat teaches less than a properly spaced review', () => {
  const memory = { stability: 10, difficulty: 5 };
  const sameDay = nextMemoryState(DEFAULT_W, memory, Rating.Good, 0).stability;
  // Reviewed at its scheduled interval, where retrievability has decayed to 90%.
  const spaced = nextMemoryState(DEFAULT_W, memory, Rating.Good, 10).stability;
  assert.ok(spaced > sameDay, `spaced=${spaced} sameDay=${sameDay}`);
});

test('stability never leaves its clamp under a long random walk', () => {
  let memory = null;
  let elapsed = 0;
  for (let i = 0; i < 500; i++) {
    const grade = [1, 2, 3, 4][i % 4];
    memory = nextMemoryState(DEFAULT_W, memory, grade, elapsed);
    assert.ok(Number.isFinite(memory.stability), 'stability finite');
    assert.ok(memory.stability >= 0.01 && memory.stability <= 36500);
    assert.ok(memory.difficulty >= 1 && memory.difficulty <= 10);
    elapsed = stabilityToInterval(memory.stability, { desiredRetention: 0.9, enableFuzz: false });
  }
});

test('intervals are whole days, at least 1, and respect the maximum', () => {
  for (const s of [0.01, 1, 50, 100000]) {
    const ivl = stabilityToInterval(s, { desiredRetention: 0.9, maximumInterval: 365, enableFuzz: false });
    assert.equal(ivl, Math.round(ivl));
    assert.ok(ivl >= 1 && ivl <= 365, `ivl=${ivl}`);
  }
});

test('fuzz keeps the interval within a sane band and never exceeds the cap', () => {
  for (const ivl of [3, 10, 60, 400]) {
    const [lo, hi] = fuzzRange(ivl, 0, 36500);
    assert.ok(lo <= hi);
    assert.ok(lo >= 2);
    const fuzzed = stabilityToInterval(ivl, { desiredRetention: 0.9, maximumInterval: 100, enableFuzz: true, seed: 'x' });
    assert.ok(fuzzed <= 100);
  }
});

test('seeded random is deterministic and in [0, 1)', () => {
  assert.equal(seededRandom('card1:3'), seededRandom('card1:3'));
  assert.notEqual(seededRandom('card1:3'), seededRandom('card1:4'));
  for (const seed of ['a', 'b', 'c', 'card_x:9']) {
    const v = seededRandom(seed);
    assert.ok(v >= 0 && v < 1, `v=${v}`);
  }
});

test('weight validation catches wrong length and bad values', () => {
  assert.equal(validateWeights(DEFAULT_W), null);
  assert.equal(validateWeights([...DEFAULT_W].slice(0, 5))?.includes(String(W_COUNT)), true);
  assert.ok(validateWeights('nope'));
  const bad = [...DEFAULT_W]; bad[0] = NaN;
  assert.ok(validateWeights(bad));
  const negative = [...DEFAULT_W]; negative[0] = -1;
  assert.ok(validateWeights(negative));
});

test('states and ratings have the values the rest of the app assumes', () => {
  assert.deepEqual({ ...Rating }, { Again: 1, Hard: 2, Good: 3, Easy: 4 });
  assert.deepEqual({ ...State }, { New: 0, Learning: 1, Review: 2, Relearning: 3 });
});
