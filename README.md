# Flashcards

A mobile, touch-first flashcard app built around the **FSRS** spaced-repetition
algorithm. Swipe right if you knew the card, left if you didn't, tap the star if
it was easy.

Runs entirely in the browser: no server, no account, no network. Everything is
stored on the device in IndexedDB, and it works offline once installed to the
home screen.

**▶ [Open the app](https://arnauddc807.github.io/FlashCards/)** — hosted on
GitHub Pages. On a phone, open that link and use **Add to Home Screen** to
install it; after the first load it works with no connection at all.

<!-- screenshots live in docs/ if you add them -->

## What it does

- **Swipe to grade.** Right = *Good*, left = *Again*, the round star = *Easy*.
  Swipe up for Easy and down for Hard if you prefer gestures to buttons. Every
  card can be tapped to reveal the answer first, or graded blind.
- **Real FSRS-5 scheduling.** The full 19-parameter memory model, not an SM-2
  approximation — including same-day review handling and the post-lapse
  stability cap.
- **Multiple decks**, each with its own counts, browser and statistics.
- **Statistics** that answer the three questions worth asking: how much have I
  done, how well is it sticking, and how much work is coming.
- **A settings panel** exposing the whole algorithm — desired retention,
  learning and relearning steps, interval cap, fuzz, daily limits, and all 19
  FSRS weights.
- **AI deck generation.** The bundled `study-deck` skill is exportable from
  inside the app, so you can hand it to Claude with your lecture notes and get a
  `.deck` file back.

## Running it

It is a static site with no build step.

```bash
git clone <this repo>
cd FlashCards
npm start            # python3 -m http.server 8080
```

Then open `http://localhost:8080`. On a phone, open the same URL over your local
network and use **Add to Home Screen** to install it as a standalone app.

ES modules need to be served over HTTP — opening `index.html` from the
filesystem will not work.

### Deploying

The app is deployed to GitHub Pages from `main` by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). Pull requests run
the test suite; only pushes to `main` deploy, and only if the tests pass.

The workflow turns Pages on itself (`configure-pages` runs with
`enablement: true`), so a fresh clone or fork only needs a push to `main`. The
site then appears at `https://<user>.github.io/<repo>/`, and the workflow prints
the URL in its run summary.

Two things are worth checking once:

- **Settings → Branches → Default branch** should be `main`.
- **Settings → Pages → Source** should read *GitHub Actions*. If it says
  *Deploy from a branch*, the legacy Jekyll builder is publishing the site
  instead of this workflow; the first Actions deploy switches it over.

GitHub Pages on a **private** repository requires a paid plan. On the free plan
either make the repository public or host the folder somewhere else — there is
nothing to build, so any static host works.

Every path in the app is relative and the manifest uses `"start_url": "./"`, so
it runs correctly from a project subpath such as `/FlashCards/` as well as from
a domain root.

## Making decks

A deck is a `.deck` file: [JSONL](https://jsonlines.org), one JSON object per
line, with exactly four string fields.

```jsonl
{"question": "Where does glycolysis take place?", "answer": "The cytosol.", "tag": "respiration", "extra": "Contrast with the citric acid cycle, which is mitochondrial — a favourite exam distinction."}
{"question": "What molecule feeds the citric acid cycle?", "answer": "Pyruvate.", "tag": "respiration", "extra": "Converted to acetyl-CoA by oxidative decarboxylation first."}
```

| field | meaning |
| --- | --- |
| `question` | the prompt. Self-contained — it must make sense months later with no source in front of you |
| `answer` | just the recall target, ideally under ~15 words |
| `tag` | lowercase sub-topic for filtering; reuse 3–8 across a deck |
| `extra` | shown *after* answering: the why, a common confusion, or a mnemonic |

The importer is deliberately forgiving: it accepts a JSON array instead of
JSONL, strips markdown code fences, tolerates trailing commas, understands
`front`/`back` aliases, and skips duplicates rather than importing them twice.

### Generating decks with Claude

`skill/study-deck.skill` turns any study material — slides, a textbook chapter,
a PDF, handwritten notes — into a well-formed deck. It is a normal Claude skill
and works in any conversation; it does not need this app.

1. In the app: **Settings → Export the study-deck skill** (also on the deck
   screen under *Generate a deck with AI*). The file is embedded in the app, so
   this works offline.
2. Upload it to Claude along with your material, and copy the prompt the app
   offers.
3. Claude returns `THEME_NAME.deck`.
4. Back in the app: **+ → Import a .deck file**.

The skill enforces the card-quality rules that make a deck worth reviewing —
atomic, self-contained, no yes/no questions, no whole-list cards — and ships
with a validator:

```bash
python3 skill-src/scripts/validate_deck.py decks/FSRS_AND_STUDY.deck
```

If you replace `skill/study-deck.skill`, regenerate its embedded copy:

```bash
npm run embed-skill
```

## How the scheduling works

FSRS tracks two numbers per card and predicts a third.

- **Stability** — how many days until your chance of recalling the card falls to
  90%. Successful reviews multiply it; a lapse cuts it back.
- **Difficulty** — how hard this card is for you, 1 to 10. It rises on *Again*,
  falls on *Easy*, and is pulled back toward a middle anchor so a single
  misgrade cannot distort it permanently.
- **Retrievability** — your predicted chance of recall right now, decaying along
  a power curve since the last review.

The next interval is simply where retrievability will have decayed to your
**desired retention** setting. Raise that setting and every interval shortens.

A card's path is `New → Learning → Review`, with a lapse sending it to
`Relearning`. The learning and relearning steps are same-day minute-scale steps
you control in Settings; once a card graduates, FSRS decides everything.

**Grade honestly.** Pressing *Good* on a lucky guess inflates that card's
stability, so it returns far too late and you lose it. The algorithm is only as
good as its input.

### Tuning it

The defaults are fitted on a very large public review dataset and are a good
starting point. Once you have a few thousand reviews, compare **actual
retention** on the stats screen against your target:

- actual well *below* target → intervals are too long
- actual well *above* target → you are reviewing more than you need to

You can then run the [FSRS optimizer](https://github.com/open-spaced-repetition)
against your own history and paste the resulting 19 weights into
**Settings → FSRS parameters**.

## Project layout

```
index.html              app shell
css/app.css             all styles, light + dark
js/
  fsrs.js               FSRS-5 memory model (pure functions)
  scheduler.js          memory state -> due dates, queue building
  store.js              IndexedDB persistence
  deckfile.js           .deck parsing and serialization
  stats.js              statistics, all pure
  settings.js           defaults, validation, persistence
  charts.js             inline-SVG charts
  ui.js  icons.js  theme.js
  skillfile.js          generated: the skill, base64-embedded
  views/                decks, deck, study, stats, settings
decks/                  sample deck
skill/study-deck.skill  the deck-generating Claude skill
test/                   node:test unit tests
tools/embed-skill.mjs   regenerates js/skillfile.js
sw.js                   service worker (offline)
.nojekyll               keeps Pages from running the files through Jekyll
.github/workflows/      tests on every PR, deploy to Pages from main
```

## Tests

```bash
npm test
```

Covers the FSRS model against its published formulas (retrievability is exactly
0.9 at `t = S`, grade ordering, difficulty clamping, lapses never increasing
stability), the scheduler's state machine and daily limits, and `.deck` parsing
including every malformed input the importer claims to tolerate.

## Data and privacy

Everything stays in the browser's IndexedDB on your device. There is no backend
and the app makes no network requests after loading. **Settings → Back up
everything** writes a single JSON file with every deck, card and review; clearing
site data or uninstalling the PWA deletes your decks, so back up before you do.
