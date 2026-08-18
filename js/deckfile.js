/**
 * Reading and writing `.deck` files — the JSONL format produced by the
 * study-deck skill. One JSON object per line, exactly four string fields:
 * question, answer, tag, extra.
 */

import { uid } from './store.js';
import { newCardState } from './scheduler.js';

export const DECK_FIELDS = ['question', 'answer', 'tag', 'extra'];

/**
 * Parse a .deck file body.
 *
 * Tolerant on input — blank lines, a stray wrapping array, markdown fences and
 * trailing commas all get repaired rather than rejected, because these files
 * arrive by copy-paste from a chat window as often as by download.
 *
 * @returns {{cards: object[], errors: {line:number,message:string}[], warnings: string[]}}
 */
export function parseDeckFile(text) {
  const errors = [];
  const warnings = [];
  const cards = [];

  let body = String(text ?? '').replace(/^﻿/, '');

  // Strip markdown fences if the file was pasted out of a chat reply.
  if (body.includes('```')) {
    warnings.push('Removed markdown code fences.');
    body = body.replace(/^\s*```[a-zA-Z]*\s*$/gm, '');
  }

  const trimmed = body.trim();

  // Accept a whole-file JSON array as well as true JSONL.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        warnings.push('File was a JSON array, not JSONL — imported anyway.');
        arr.forEach((obj, i) => {
          const res = normalizeCard(obj, i + 1);
          if (res.error) errors.push({ line: i + 1, message: res.error });
          else cards.push(res.card);
        });
        return { cards, errors, warnings };
      }
    } catch {
      // fall through to line-by-line
    }
  }

  const lines = body.split('\n');
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    let line = raw.trim();
    if (!line) return;
    if (line === '[' || line === ']') return;
    if (line.endsWith(',')) line = line.slice(0, -1);

    let obj;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      errors.push({ line: lineNo, message: `Invalid JSON (${err.message})` });
      return;
    }
    const res = normalizeCard(obj, lineNo);
    if (res.error) errors.push({ line: lineNo, message: res.error });
    else cards.push(res.card);
  });

  // Duplicate questions are a real problem in a study deck, not a parse error.
  const seen = new Map();
  cards.forEach((c, i) => {
    const key = c.question.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (!key) return;
    if (seen.has(key)) warnings.push(`Card ${i + 1} duplicates card ${seen.get(key) + 1}.`);
    else seen.set(key, i);
  });

  return { cards, errors, warnings };
}

function normalizeCard(obj, lineNo) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { error: `Expected a JSON object, got ${Array.isArray(obj) ? 'array' : typeof obj}` };
  }
  const question = str(obj.question ?? obj.front ?? obj.q);
  const answer = str(obj.answer ?? obj.back ?? obj.a);
  if (!question) return { error: 'Missing "question"' };
  if (!answer) return { error: 'Missing "answer"' };
  void lineNo;
  return {
    card: {
      question,
      answer,
      tag: str(obj.tag ?? obj.tags ?? '').toLowerCase().replace(/\s+/g, '-'),
      extra: str(obj.extra ?? obj.note ?? ''),
    },
  };
}

function str(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  return String(v).trim();
}

/** Serialize cards back to canonical .deck JSONL, field order preserved. */
export function serializeDeckFile(cards) {
  return cards
    .map((c) =>
      JSON.stringify({
        question: c.question ?? '',
        answer: c.answer ?? '',
        tag: c.tag ?? '',
        extra: c.extra ?? '',
      })
    )
    .join('\n') + '\n';
}

/** UPPER_SNAKE_CASE deck name → filename, matching the skill's contract. */
export function deckFilename(name) {
  const slug = String(name || 'DECK')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
    .replace(/^_+|_+$/g, '');
  return `${slug || 'DECK'}.deck`;
}

/** Words kept fully capitalised by deckNameFromFilename. */
const ACRONYMS = new Set([
  'DNA', 'RNA', 'ATP', 'ADP', 'PCR', 'EKG', 'ECG', 'MRI', 'CNS', 'PNS', 'GI',
  'SQL', 'XML', 'HTML', 'CSS', 'API', 'CPU', 'GPU', 'HTTP', 'HTTPS', 'TCP',
  'IP', 'UI', 'UX', 'AI', 'ML', 'OS', 'IO',
  'EU', 'UN', 'US', 'USA', 'UK', 'NATO', 'GDP', 'VAT', 'BW', 'SW',
  'PHD', 'MBA', 'WWI', 'WWII',
]);

/** Turn a filename like ROMAN_CONTRACT_LAW.deck into "Roman Contract Law". */
export function deckNameFromFilename(filename) {
  const stem = String(filename || '').replace(/\.deck$/i, '').replace(/\.jsonl?$/i, '');
  if (!stem) return 'Imported deck';
  return stem
    .split(/[_\-\s]+/)
    .filter(Boolean)
    // Title-case everything except recognised acronyms, so ROMAN_CONTRACT_LAW
    // comes back as "Roman Contract Law" while DNA_REPAIR keeps its acronym.
    // Deliberately a short list rather than a heuristic — "LAW" and "DNA" are
    // indistinguishable by shape, and the user can rename the deck anyway.
    .map((word) =>
      ACRONYMS.has(word.toUpperCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
}

/** Build storable card records from parsed rows. */
export function toCardRecords(parsedCards, deckId, startPosition = 0) {
  return parsedCards.map((c, i) => ({
    id: uid('card'),
    deckId,
    question: c.question,
    answer: c.answer,
    tag: c.tag || '',
    extra: c.extra || '',
    position: startPosition + i,
    createdAt: Date.now(),
    suspended: false,
    ...newCardState(),
  }));
}

/** Deck records carry only presentation + bookkeeping; scheduling lives on cards. */
export function makeDeck(name, extra = {}) {
  return {
    id: uid('deck'),
    name: name || 'New deck',
    createdAt: Date.now(),
    color: extra.color || pickColor(name),
    description: extra.description || '',
    ...extra,
  };
}

const DECK_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
];

export function pickColor(seed) {
  const s = String(seed || Math.random());
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return DECK_COLORS[h % DECK_COLORS.length];
}
