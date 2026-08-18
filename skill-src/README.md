# study-deck (unpacked)

This is the unpacked source of `../skill/study-deck.skill`, kept in the repo so
the card-writing rules are readable and the validator is runnable without
unzipping the archive.

- `SKILL.md` — the skill itself: output contract, workflow, card-writing rules
- `references/card_patterns.md` — worked before/after examples for awkward
  material (enumerations, formulas, timelines, legal citation, vocabulary)
- `scripts/validate_deck.py` — structural and quality checks on a `.deck` file

```bash
python3 skill-src/scripts/validate_deck.py decks/FSRS_AND_STUDY.deck
```

The zipped `.skill` in `../skill/` is what the app exports and what you upload
to Claude. If you edit anything here, re-zip it and run `npm run embed-skill`
so the in-app copy matches.
