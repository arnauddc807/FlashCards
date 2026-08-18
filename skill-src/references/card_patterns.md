# Card patterns: worked transformations

Before/after examples for source material that resists straightforward carding. Each
"before" is a plausible bad card; the "after" shows what to write instead.

Contents:
1. Enumerations and lists
2. Processes, sequences and timelines
3. Formulas and quantitative material
4. Definitions that are too broad
5. Contrast and confusion pairs
6. Legal material (statutes, case law, doctrine)
7. Language vocabulary
8. Dates and numbers
9. Diagrams, tables and figures
10. Material that should not become cards

---

## 1. Enumerations and lists

**Source:** "The five Kübler-Ross stages of grief are denial, anger, bargaining, depression and acceptance."

Bad — one card the learner will fail every single time:
```
{"question": "Name the five stages of grief.", "answer": "Denial, anger, bargaining, depression, acceptance.", ...}
```

Better — one whole-list card (the list is short, ordered and canonical, so it earns
its place) plus per-item cards that test the discriminations an exam actually asks for:
```
{"question": "What are the five Kübler-Ross stages of grief, in order?", "answer": "Denial, anger, bargaining, depression, acceptance.", "tag": "grief-models", "extra": "Mnemonic: DABDA. Kübler-Ross described these in dying patients, not the bereaved — the extension to grief came later."}
{"question": "Which Kübler-Ross stage follows anger?", "answer": "Bargaining.", "tag": "grief-models", "extra": "Bargaining is the attempt to postpone the outcome by negotiating — 'if I do X, then…'."}
{"question": "In which Kübler-Ross stage does the person attempt to negotiate a way out of the outcome?", "answer": "Bargaining.", "tag": "grief-models", "extra": "Distinguish from denial, which refuses the outcome outright rather than trading against it."}
```

For an **unordered list of seven or more** (risk factors, exceptions, criteria), drop the
whole-list card entirely and card the items individually, or card the organising principle:
"What do the four exceptions to X have in common?" is often the real insight.

---

## 2. Processes, sequences and timelines

Card the **transitions and the triggers**, not the whole chain.

**Source:** glycolysis → pyruvate → citric acid cycle → electron transport chain.

```
{"question": "What molecule does glycolysis produce that feeds into the citric acid cycle?", "answer": "Pyruvate (converted to acetyl-CoA).", "tag": "cellular-respiration", "extra": "The conversion is oxidative decarboxylation by pyruvate dehydrogenase, releasing CO₂ and reducing NAD⁺."}
{"question": "Where in the cell does glycolysis take place?", "answer": "The cytosol.", "tag": "cellular-respiration", "extra": "Contrast with the citric acid cycle and electron transport chain, which are mitochondrial — a favourite exam distinction."}
{"question": "Which stage of cellular respiration generates the most ATP?", "answer": "The electron transport chain (oxidative phosphorylation).", "tag": "cellular-respiration", "extra": "Roughly 26–28 of the ~30–32 ATP per glucose; glycolysis and the citric acid cycle each yield only 2 directly."}
```

Useful question shapes: "What triggers the transition from A to B?", "What is the input
to step X?", "What happens if step X fails?"

---

## 3. Formulas and quantitative material

Don't stop at reproducing the formula — card what each term means and when the formula
applies, because that's where marks are lost.

```
{"question": "What is the Gibbs free energy equation?", "answer": "ΔG = ΔH − TΔS", "tag": "thermodynamics", "extra": "T is absolute temperature in kelvin — using °C is the most common error."}
{"question": "What does a negative ΔG indicate about a reaction?", "answer": "It is spontaneous (exergonic) under those conditions.", "tag": "thermodynamics", "extra": "Spontaneous says nothing about rate — a spontaneous reaction can still be kinetically blocked, e.g. diamond → graphite."}
{"question": "Under what condition does an endothermic reaction become spontaneous?", "answer": "When TΔS exceeds ΔH — high temperature with a positive entropy change.", "tag": "thermodynamics", "extra": "This is why solid→gas transitions happen on heating despite absorbing energy."}
```

Use plain Unicode notation. If the user wants LaTeX, remember JSON needs each backslash
doubled: `"answer": "\\frac{a}{b}"`.

---

## 4. Definitions that are too broad

**Source:** a paragraph defining "federalism".

Bad: `"What is federalism?"` — the answer is a paragraph, and the learner can never tell
whether they got it right.

Better — split into the components the definition actually contains:
```
{"question": "In a federal system, how is sovereignty distributed?", "answer": "Constitutionally divided between a central government and regional governments, each supreme in its own sphere.", "tag": "state-forms", "extra": "The division is entrenched in the constitution — the centre cannot unilaterally revoke regional powers, which is what separates federalism from devolution."}
{"question": "What distinguishes federalism from devolution?", "answer": "Federal powers are constitutionally entrenched; devolved powers are delegated and revocable by the centre.", "tag": "state-forms", "extra": "The UK is devolved, not federal: Westminster retains legal sovereignty over Holyrood."}
```

Rule of thumb: if the answer needs more than about 20 words, you are carding a section
heading rather than a fact.

---

## 5. Contrast and confusion pairs

Whenever the source says "unlike", "in contrast", "whereas", or introduces two similar
terms in the same breath, write a contrast card. These are disproportionately what exams
test.

```
{"question": "What distinguishes mitosis from meiosis in terms of the resulting cells?", "answer": "Mitosis yields two genetically identical diploid cells; meiosis yields four genetically distinct haploid cells.", "tag": "cell-division", "extra": "The distinctness comes from crossing over in prophase I plus independent assortment in metaphase I."}
```

Card the discriminator, not each concept in isolation — "which one has feature F?" is the
question that fails on exam day.

---

## 6. Legal material

Card the **rule, its conditions, its exceptions, and the case that established it**
separately. Statute references belong in `extra`, not in the question stem.

```
{"question": "What are the cumulative conditions for a valid contract under Belgian law?", "answer": "Consent, capacity, a determined or determinable object, and a lawful cause.", "tag": "contract-formation", "extra": "Old art. 1108 BW; now art. 5.27 of the new Burgerlijk Wetboek. 'Cumulative' matters — failing one condition is enough to void."}
{"question": "Which defect of consent requires that the error concern a substantial quality the parties treated as decisive?", "answer": "Dwaling (error).", "tag": "consent-defects", "extra": "Distinguish from bedrog (fraud), where the error is deliberately induced — bedrog gives damages as well as nullity."}
{"question": "What sanction attaches to a contract with an unlawful cause?", "answer": "Absolute nullity.", "tag": "contract-formation", "extra": "Absolute nullity can be raised by any interested party and by the court on its own motion; relative nullity only by the protected party."}
```

Never make the question "What does article 1382 say?" unless the learner must recite
article numbers — card the rule, and put the article in `extra`.

---

## 7. Language vocabulary

This is the one case where reverse cards are worth making systematically, because
recognition and production are different skills.

```
{"question": "What does the German noun 'die Ausnahme' mean?", "answer": "The exception.", "tag": "vocab-nouns", "extra": "Plural: die Ausnahmen. From 'ausnehmen' (to take out). Idiom: 'Ausnahmen bestätigen die Regel'."}
{"question": "How do you say 'the exception' in German?", "answer": "Die Ausnahme.", "tag": "vocab-nouns", "extra": "Feminine — nearly all German nouns ending in -e that denote abstractions are feminine."}
```

Card gender, plural, and irregular forms with the word rather than as separate cards
where possible; `extra` is the right home for them.

---

## 8. Dates and numbers

Only card a number when the number itself is examinable. When you do, anchor it with
something memorable in `extra`.

```
{"question": "In which year was the Treaty of Westphalia signed?", "answer": "1648.", "tag": "early-modern", "extra": "Ended the Thirty Years' War and the Eighty Years' War; conventionally marks the start of the sovereign-state system."}
```

Prefer "what happened in year X" *and* "in which year did X happen" only when both
directions are genuinely tested — usually the event→date direction suffices.

---

## 9. Diagrams, tables and figures

A table of comparisons is a goldmine: each row/column intersection is a potential card,
and the table's axis is a contrast card. A labelled diagram becomes location and function
cards ("Which structure sits between X and Y?", "What is the function of the structure at
the base of Z?"). Describe spatial relationships in words — the learner won't have the
image.

---

## 10. Material that should not become cards

- Course admin: deadlines, exam dates, reading lists, lecturer names
- Slide furniture: "Overview", "Any questions?", agenda slides, figure numbers
- Narrative filler and anecdotes with no testable content
- Anything whose only possible question is "did this appear in the material?"

Leaving these out is part of the job. Mention in your reply what you deliberately skipped
so the user can overrule you.
