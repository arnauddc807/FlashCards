/**
 * User settings: defaults, persistence, validation.
 *
 * The FSRS weights live here too, so the settings panel can expose the whole
 * algorithm rather than just a retention slider.
 */

import { DEFAULT_W, validateWeights, W_COUNT } from './fsrs.js';
import { getMeta, setMeta } from './store.js';

export const DEFAULT_SETTINGS = Object.freeze({
  // --- FSRS ---
  w: [...DEFAULT_W],
  desiredRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,

  // --- Queue shape ---
  learningSteps: '1m 10m',
  relearningSteps: '10m',
  newPerDay: 20,
  reviewsPerDay: 200,
  newCardOrder: 'sequential', // 'sequential' | 'random'
  dayCutoffHour: 4,

  // --- Interaction ---
  swipeThreshold: 0.28,   // fraction of card width before a swipe commits
  hapticsEnabled: true,
  showHardButton: true,
  autoRevealAnswer: false,
  swipeBeforeReveal: true,
  showIntervalHints: true,

  // --- Appearance ---
  theme: 'auto',          // 'auto' | 'dark' | 'light'
  fontScale: 1,
});

export const SETTINGS_KEY = 'settings';

let cache = null;

/** Merge stored settings over the defaults, dropping anything unrecognised. */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };

  s.w = Array.isArray(raw?.w) && validateWeights(raw.w) === null
    ? raw.w.slice(0, W_COUNT)
    : [...DEFAULT_W];

  s.desiredRetention = clampNum(s.desiredRetention, 0.7, 0.99, 0.9);
  s.maximumInterval = Math.round(clampNum(s.maximumInterval, 1, 36500, 36500));
  s.newPerDay = Math.round(clampNum(s.newPerDay, 0, 9999, 20));
  s.reviewsPerDay = Math.round(clampNum(s.reviewsPerDay, 0, 99999, 200));
  s.dayCutoffHour = Math.round(clampNum(s.dayCutoffHour, 0, 23, 4));
  s.swipeThreshold = clampNum(s.swipeThreshold, 0.1, 0.6, 0.28);
  s.fontScale = clampNum(s.fontScale, 0.8, 1.6, 1);

  s.enableFuzz = !!s.enableFuzz;
  s.hapticsEnabled = !!s.hapticsEnabled;
  s.showHardButton = !!s.showHardButton;
  s.autoRevealAnswer = !!s.autoRevealAnswer;
  s.swipeBeforeReveal = !!s.swipeBeforeReveal;
  s.showIntervalHints = !!s.showIntervalHints;

  if (!['auto', 'dark', 'light'].includes(s.theme)) s.theme = 'auto';
  if (!['sequential', 'random'].includes(s.newCardOrder)) s.newCardOrder = 'sequential';
  s.learningSteps = typeof s.learningSteps === 'string' ? s.learningSteps : '1m 10m';
  s.relearningSteps = typeof s.relearningSteps === 'string' ? s.relearningSteps : '10m';

  return s;
}

function clampNum(v, lo, hi, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, lo), hi);
}

export async function loadSettings() {
  if (cache) return cache;
  const stored = await getMeta(SETTINGS_KEY, null);
  cache = normalizeSettings(stored);
  return cache;
}

export async function saveSettings(next) {
  cache = normalizeSettings(next);
  await setMeta(SETTINGS_KEY, cache);
  return cache;
}

/** Settings already loaded this session — safe after the first loadSettings(). */
export function currentSettings() {
  return cache || normalizeSettings(null);
}

export async function updateSettings(patch) {
  const merged = { ...(cache || (await loadSettings())), ...patch };
  return saveSettings(merged);
}

export async function resetSettings() {
  return saveSettings({ ...DEFAULT_SETTINGS, w: [...DEFAULT_W] });
}

/** Which fields, when changed, alter future scheduling. Used to warn the user. */
export const SCHEDULING_FIELDS = Object.freeze([
  'w', 'desiredRetention', 'maximumInterval', 'enableFuzz',
  'learningSteps', 'relearningSteps',
]);
