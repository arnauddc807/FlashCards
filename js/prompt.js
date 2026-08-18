/**
 * The prompt users copy into Claude alongside the skill file. Kept in one
 * place so the wording stays consistent with the skill's own contract.
 */

export const GENERATOR_PROMPT = `I've attached the study-deck skill. Please use it to turn the material below into a flashcard deck.

Output a single THEME_NAME.deck file in JSONL format — one JSON object per line with exactly the fields question, answer, tag and extra. Keep the cards atomic and self-contained, write them in the language of the source material, and use 3–8 reusable sub-topic tags across the deck.

Here is the material:
[paste your notes, or attach your slides / chapter / PDF here]`;

export const EXTEND_PROMPT = `I've attached the study-deck skill and an existing .deck file.

Please extend this deck with cards covering the material below. Match the existing tag vocabulary, language and style, and don't duplicate questions that are already in the file. Return the complete updated .deck file.

Here is the new material:
[paste your notes here]`;
