import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  parseDeckFile, serializeDeckFile, deckFilename, deckNameFromFilename,
} from '../js/deckfile.js';

const line = (q, a, tag = 't', extra = 'e') =>
  JSON.stringify({ question: q, answer: a, tag, extra });

test('parses well-formed JSONL', () => {
  const text = [line('Q1', 'A1', 'bio', 'why'), line('Q2', 'A2', 'chem', '')].join('\n');
  const { cards, errors } = parseDeckFile(text);
  assert.equal(errors.length, 0);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], { question: 'Q1', answer: 'A1', tag: 'bio', extra: 'why' });
});

test('the bundled sample deck parses cleanly', () => {
  const text = fs.readFileSync(new URL('../decks/FSRS_AND_STUDY.deck', import.meta.url), 'utf8');
  const { cards, errors, warnings } = parseDeckFile(text);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
  assert.ok(cards.length >= 20);
  for (const c of cards) {
    assert.ok(c.question && c.answer, 'every card needs a question and an answer');
    assert.equal(c.tag, c.tag.toLowerCase());
  }
});

test('ignores blank lines and a trailing newline', () => {
  const { cards, errors } = parseDeckFile(`${line('Q', 'A')}\n\n\n${line('Q2', 'A2')}\n`);
  assert.equal(cards.length, 2);
  assert.equal(errors.length, 0);
});

test('recovers from markdown fences pasted out of a chat window', () => {
  const text = ['```json', line('Q', 'A'), line('Q2', 'A2'), '```'].join('\n');
  const { cards, warnings } = parseDeckFile(text);
  assert.equal(cards.length, 2);
  assert.ok(warnings.some((w) => /fence/i.test(w)));
});

test('accepts a JSON array as well as true JSONL', () => {
  const text = JSON.stringify([
    { question: 'Q', answer: 'A', tag: 't', extra: 'e' },
    { question: 'Q2', answer: 'A2', tag: 't', extra: 'e' },
  ]);
  const { cards, warnings } = parseDeckFile(text);
  assert.equal(cards.length, 2);
  assert.ok(warnings.some((w) => /array/i.test(w)));
});

test('tolerates trailing commas on each line', () => {
  const { cards, errors } = parseDeckFile(`${line('Q', 'A')},\n${line('Q2', 'A2')},`);
  assert.equal(cards.length, 2);
  assert.equal(errors.length, 0);
});

test('reports bad lines but keeps the good ones', () => {
  const text = [line('Q', 'A'), '{not json', line('Q2', 'A2')].join('\n');
  const { cards, errors } = parseDeckFile(text);
  assert.equal(cards.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
});

test('rejects cards missing a question or an answer', () => {
  const text = [
    JSON.stringify({ question: '', answer: 'A', tag: '', extra: '' }),
    JSON.stringify({ question: 'Q', tag: '', extra: '' }),
  ].join('\n');
  const { cards, errors } = parseDeckFile(text);
  assert.equal(cards.length, 0);
  assert.equal(errors.length, 2);
});

test('accepts front/back and q/a aliases', () => {
  const text = JSON.stringify({ front: 'Q', back: 'A', tags: ['Cell Biology'], note: 'n' });
  const { cards } = parseDeckFile(text);
  assert.equal(cards[0].question, 'Q');
  assert.equal(cards[0].answer, 'A');
  assert.equal(cards[0].tag, 'cell-biology', 'tags are lowercased and hyphenated');
  assert.equal(cards[0].extra, 'n');
});

test('flags duplicate questions as warnings, not errors', () => {
  const text = [line('Same question?', 'A1'), line('same question', 'A2')].join('\n');
  const { cards, errors, warnings } = parseDeckFile(text);
  assert.equal(cards.length, 2);
  assert.equal(errors.length, 0);
  assert.ok(warnings.some((w) => /duplicate/i.test(w)));
});

test('strips a BOM', () => {
  const { cards, errors } = parseDeckFile(`﻿${line('Q', 'A')}`);
  assert.equal(cards.length, 1);
  assert.equal(errors.length, 0);
});

test('serialize round-trips through parse with the fields in order', () => {
  const cards = [
    { question: 'Q1', answer: 'A1', tag: 'tag', extra: 'x' },
    { question: 'Unicode: café — ünïcode ✓', answer: 'Ok', tag: 'l', extra: '' },
  ];
  const text = serializeDeckFile(cards);
  assert.equal(text.split('\n')[0], JSON.stringify(cards[0]));
  const { cards: back, errors } = parseDeckFile(text);
  assert.equal(errors.length, 0);
  assert.deepEqual(back, cards);
});

test('serialize fills missing optional fields rather than omitting them', () => {
  const text = serializeDeckFile([{ question: 'Q', answer: 'A' }]);
  const obj = JSON.parse(text.trim());
  assert.deepEqual(Object.keys(obj), ['question', 'answer', 'tag', 'extra']);
  assert.equal(obj.tag, '');
});

test('deckFilename produces the UPPER_SNAKE_CASE.deck the skill specifies', () => {
  assert.equal(deckFilename('Roman Contract Law'), 'ROMAN_CONTRACT_LAW.deck');
  assert.equal(deckFilename('Café & Crème!'), 'CAFE_CREME.deck');
  assert.equal(deckFilename('  spaced  out  '), 'SPACED_OUT.deck');
  assert.equal(deckFilename(''), 'DECK.deck');
});

test('deckNameFromFilename reverses it into something readable', () => {
  assert.equal(deckNameFromFilename('ROMAN_CONTRACT_LAW.deck'), 'Roman Contract Law');
  assert.equal(deckNameFromFilename('CELL_BIOLOGY.deck'), 'Cell Biology');
  assert.equal(deckNameFromFilename('DNA_REPAIR.deck'), 'DNA Repair', 'vowel-less acronyms are kept');
  assert.equal(deckNameFromFilename('SQL_JOINS.deck'), 'SQL Joins');
  assert.equal(deckNameFromFilename('my-notes.jsonl'), 'My Notes');
});

test('an empty file yields no cards and no crash', () => {
  const { cards, errors } = parseDeckFile('');
  assert.equal(cards.length, 0);
  assert.equal(errors.length, 0);
  assert.equal(parseDeckFile(null).cards.length, 0);
});
