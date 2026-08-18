#!/usr/bin/env python3
"""Validate a .deck file: JSONL structure, required fields, and card-quality heuristics.

Usage:
    python3 validate_deck.py path/to/THEME_NAME.deck

Exit code 0 if there are no errors (warnings are fine), 1 otherwise.
Warnings are judgement calls — read them, fix the ones that are real.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

REQUIRED_KEYS = {"question", "answer", "tag", "extra"}

CONTEXT_DEPENDENT = re.compile(
    r"\b(according to (the|this)|in the (text|slide|chapter|document|article|reading)"
    r"|as (mentioned|discussed|stated|shown) (above|earlier|in)|this (chapter|lecture|slide|course)"
    r"|the author (states|says|argues|claims)|volgens (de|het) tekst|zoals (vermeld|besproken)"
    r"|in dit hoofdstuk|selon le texte)\b",
    re.IGNORECASE,
)

YESNO_START = re.compile(
    r"^\s*(is|are|was|were|does|do|did|can|could|will|would|should|has|have|had)\b",
    re.IGNORECASE,
)

YESNO_ANSWER = {"yes", "no", "true", "false", "ja", "nee", "nein", "oui", "non", "vrai", "faux",
                "waar", "onwaar", "correct", "incorrect"}

ANSWER_WORD_LIMIT = 25
QUESTION_WORD_LIMIT = 35


def normalize(text):
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def words(text):
    return len(text.split())


def main():
    if len(sys.argv) != 2:
        print("usage: validate_deck.py path/to/THEME_NAME.deck", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 1

    errors, warnings = [], []

    if path.suffix != ".deck":
        errors.append(f"filename: must end in .deck (got '{path.name}')")
    stem = path.stem
    if stem and not re.fullmatch(r"[A-Z0-9]+(_[A-Z0-9]+)*", stem):
        warnings.append(
            f"filename: '{stem}' is not UPPER_SNAKE_CASE — expected e.g. CELL_BIOLOGY.deck"
        )

    raw = path.read_text(encoding="utf-8")
    if raw.startswith("\ufeff"):
        errors.append("file: starts with a BOM — write plain UTF-8")
    if "```" in raw:
        errors.append("file: contains markdown code fences — a .deck holds raw JSONL only")

    lines = raw.split("\n")
    if lines and lines[-1] == "":
        lines.pop()  # single trailing newline is fine

    cards = []
    seen_questions = {}
    tags = Counter()

    for i, line in enumerate(lines, start=1):
        where = f"line {i}"
        if not line.strip():
            errors.append(f"{where}: blank line (JSONL allows no blank lines)")
            continue
        if line.rstrip().endswith(","):
            errors.append(f"{where}: trailing comma — lines are separate objects, not array items")

        try:
            obj = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"{where}: invalid JSON ({exc.msg} at col {exc.colno})")
            continue

        if not isinstance(obj, dict):
            errors.append(f"{where}: expected a JSON object, got {type(obj).__name__}")
            continue

        keys = set(obj)
        for missing in sorted(REQUIRED_KEYS - keys):
            errors.append(f"{where}: missing required key '{missing}'")
        for extra_key in sorted(keys - REQUIRED_KEYS):
            errors.append(f"{where}: unexpected key '{extra_key}' (allowed: question, answer, tag, extra)")

        bad_type = False
        for key in sorted(REQUIRED_KEYS & keys):
            if not isinstance(obj[key], str):
                errors.append(f"{where}: '{key}' must be a string, got {type(obj[key]).__name__}")
                bad_type = True
        if bad_type or not REQUIRED_KEYS <= keys:
            continue

        q, a, tag, extra = obj["question"], obj["answer"], obj["tag"], obj["extra"]
        cards.append(obj)

        # --- errors ---
        for key, val in (("question", q), ("answer", a), ("tag", tag)):
            if not val.strip():
                errors.append(f"{where}: '{key}' is empty")

        if tag.strip():
            if tag != tag.lower():
                errors.append(f"{where}: tag '{tag}' must be lowercase")
            if re.search(r"\s", tag):
                errors.append(f"{where}: tag '{tag}' contains whitespace — use hyphens")
            tags[tag] += 1

        nq = normalize(q)
        if nq:
            if nq in seen_questions:
                errors.append(f"{where}: duplicate question, already on line {seen_questions[nq]}")
            else:
                seen_questions[nq] = i

        # --- warnings ---
        if not extra.strip():
            warnings.append(f"{where}: 'extra' is empty — add the why, a confusion, or a mnemonic")
        elif normalize(extra) == normalize(a) or (
            len(normalize(a)) > 12 and normalize(a) in normalize(extra)
        ):
            warnings.append(f"{where}: 'extra' restates the answer instead of adding something new")

        if words(a) > ANSWER_WORD_LIMIT:
            warnings.append(
                f"{where}: answer is {words(a)} words — move context into 'extra' or split the card"
            )
        if words(q) > QUESTION_WORD_LIMIT:
            warnings.append(f"{where}: question is {words(q)} words — likely testing several things at once")

        first_answer_word = normalize(a).split()[0] if normalize(a) else ""
        if normalize(a) in YESNO_ANSWER or (
            YESNO_START.match(q) and (words(a) <= 2 or first_answer_word in YESNO_ANSWER)
        ):
            warnings.append(f"{where}: looks like a yes/no card — rephrase as what/which/why")

        if CONTEXT_DEPENDENT.search(q):
            warnings.append(f"{where}: question depends on the source being present — make it self-contained")

        if re.search(r"\b(and|en|und|et)\b", a) and words(a) > 12:
            warnings.append(f"{where}: answer may join two independent facts — consider splitting")

    if not cards and not errors:
        errors.append("file: no cards found")

    if len(tags) > 12:
        warnings.append(f"tags: {len(tags)} distinct tags is a lot — consolidate to roughly 3–8")
    singletons = [t for t, n in tags.items() if n == 1]
    if len(cards) >= 15 and len(singletons) > max(2, len(tags) // 2):
        warnings.append(
            f"tags: {len(singletons)} tags used only once ({', '.join(sorted(singletons)[:5])}…) — reuse a smaller set"
        )

    # --- report ---
    print(f"Deck: {path.name}")
    print(f"Cards: {len(cards)}")
    if tags:
        print("Tags: " + ", ".join(f"{t} ({n})" for t, n in tags.most_common()))
    print()

    if errors:
        print(f"ERRORS ({len(errors)}) — must fix:")
        for e in errors:
            print(f"  ✗ {e}")
        print()
    if warnings:
        print(f"WARNINGS ({len(warnings)}) — review each:")
        for w in warnings:
            print(f"  ! {w}")
        print()
    if not errors and not warnings:
        print("Clean — no errors, no warnings.")
    elif not errors:
        print("No structural errors.")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
