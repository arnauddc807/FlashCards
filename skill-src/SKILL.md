---
name: study-deck
description: Turn any study material — lecture slides, textbook chapters, PDFs, handwritten notes, transcripts, pasted text, or just a named topic — into a deck of Anki-style flashcards, written out as a JSONL file called THEME_NAME.deck with question/answer/tag/extra fields. Use this skill whenever the user asks for flashcards, study cards, Anki cards, a revision or exam deck, "cards from these notes", "help me memorize this", "quiz me on this chapter", or uploads course material and asks for something to study from — even if they never say the words "Anki" or "flashcard". Also use it when the user wants to extend, regenerate, review, or fix an existing .deck file.
---

# Study Deck

Converts source material into spaced-repetition flashcards. The value of a deck is
entirely in the quality of the individual cards — a hundred sloppy cards are worse
than thirty sharp ones, because the learner will grind through them daily for weeks.
Write every card as though you personally have to review it 40 times.

## Output contract

One file: `THEME_NAME.deck`, saved in `/mnt/user-data/outputs/`.

- **Format**: JSONL — one complete JSON object per line, no wrapping array, no commas
  between lines, no markdown fences, no header. UTF-8.
- **Filename**: UPPER_SNAKE_CASE theme derived from the material, e.g.
  `CELL_BIOLOGY.deck`, `ROMAN_CONTRACT_LAW.deck`, `FRENCH_REVOLUTION.deck`. Keep it to
  1–4 words. Honour any name the user specifies instead.
- **Fields**: exactly four keys per line, always present, always strings —
  `question`, `answer`, `tag`, `extra`.

```
{"question": "What does DNS translate a domain name into?", "answer": "An IP address.", "tag": "networking", "extra": "Resolution order: browser cache → OS cache → resolver → root → TLD → authoritative server."}
{"question": "What is the function of the mitochondria?", "answer": "Producing ATP through oxidative phosphorylation.", "tag": "biology", "extra": "Has its own circular DNA, inherited maternally — evidence for the endosymbiotic theory."}
```

Write the cards in the **language of the source material**, unless the user asks for
another language. Dutch notes produce Dutch cards.

## Workflow

1. **Read the whole source first.** For uploads, read the actual file from
   `/mnt/user-data/uploads/` (consult the `file-reading` or `pdf-reading` skills for
   the right extraction method). Never write cards from a skim or a summary — you will
   silently drop half the syllabus. If the user named a topic instead of supplying
   material, gather the content yourself (search if you have the tool) before writing.
2. **Inventory the testable items, section by section, in source order.** Note each
   definition, mechanism, distinction, number, condition, and causal link. This step is
   what prevents the classic failure: dense cards for chapter 1, three cards for
   chapters 4–7. Coverage should be even across the whole document.
3. **Turn each item into cards** using the rules below. One item often becomes two or
   three atomic cards; some items become none.
4. **Write the file** to `/mnt/user-data/outputs/THEME_NAME.deck`.
5. **Validate**: `python3 scripts/validate_deck.py /mnt/user-data/outputs/THEME_NAME.deck`
   Fix every error and consider every warning, then re-run until clean.
6. **Present** the file with `present_files` and add two or three lines: card count,
   the tags used, and anything you deliberately left out or couldn't cover.

Split into several decks only when the material covers genuinely unrelated subjects
(a mixed exam-prep bundle, say). One coherent course or chapter = one deck.

## How many cards

Let the material decide; never pad to a round number and never stop early because the
document is long. Rough anchors: a 20-slide lecture ≈ 20–35 cards, a dense textbook
chapter ≈ 35–70, a two-page summary sheet ≈ 10–20. If the source is thin, a short deck
is the honest answer.

## Writing the cards

**Atomic.** One retrievable fact per card. "What are the causes and consequences of
inflation?" is a small essay, not a card — split it. If your answer contains "and" joining
two independent facts, it is two cards.

**Self-contained.** The question must make sense to someone who has never seen the
source. No "According to the text…", "What did he conclude?", "Which of the three
mentioned…". Name the entity: not "When was it signed?" but "When was the Treaty of
Versailles signed?"

**Answer = what must be recalled, and nothing else.** Aim for under ~15 words. Strip
hedging and restatement of the question. Everything that is context rather than the
recall target belongs in `extra`.

**Cue the retrieval precisely.** A good question has exactly one defensible answer.
If two different correct answers fit your question, the question is underspecified and
the learner will fail a card they actually knew.

**Avoid yes/no questions.** A 50% guess rate teaches nothing. "Is haemoglobin a
protein?" becomes "What class of molecule is haemoglobin?"

**Break up lists.** "Name the seven stages of X" is one card the learner fails forever.
Prefer per-item cards with a discriminating cue ("Which stage of X immediately follows
Y?", "In which stage of X does Z occur?"). Keep a whole-list card only when the list is
short, ordered, and genuinely memorised as a unit — and then put a mnemonic in `extra`.

**Vary the question type.** Definitions alone make a shallow deck. Mix in: function or
purpose, contrast between two confusable things, cause and effect, conditions or
requirements, numbers and thresholds, and application ("A patient presents with…, what
does this suggest?"). Contrast cards are especially valuable — exams test the boundary
between concepts, not the concepts alone.

**Make reverse cards only where both directions are useful** — vocabulary, translations,
symbol/name pairs. Don't mechanically mirror every definition.

**Skip the packaging.** No cards about slide numbers, figure captions, the lecturer's
name, "what does this chapter cover", or administrative front matter.

For formulas, use plain readable notation (`ΔG = ΔH − TΔS`, `a² + b² = c²`) rather than
LaTeX, unless the user asks for LaTeX — in which case remember every backslash must be
escaped in JSON.

## The `extra` field

Not a second answer and not padding. It is what the learner reads *after* they've
answered, and it should earn its place by adding one of:

- the **why** — the mechanism or reasoning behind the answer
- a **common confusion** — the thing this is usually mixed up with, and how to tell them apart
- a **mnemonic** or memory hook
- a **worked micro-example** or typical exam application
- **connective tissue** — how this links to another card in the deck

If genuinely nothing useful can be added, that is a sign the card may be trivia. Never
restate the answer in different words.

## The `tag` field

Lowercase, no spaces (hyphens if needed). Tags are for filtering during revision, so use
**sub-topics within the deck**, not the deck name repeated on every card. A deck of 40
cards wants roughly 3–8 tags, each used several times — reuse them deliberately rather
than inventing a fresh tag per card.

## Extending an existing deck

Read the current file first, match its tag vocabulary, language, and style, check the
existing questions so you don't duplicate them, then append. Validate the whole file
afterwards, not just the new lines.

## References

- `references/card_patterns.md` — worked before/after transformations for the awkward
  cases: enumerations, formulas, processes and timelines, legal material with statutes
  and case law, language vocabulary, and dates. Read it when the source contains any of
  these, or when a card feels hard to phrase.
- `scripts/validate_deck.py` — structural and quality checks. Always run it.
