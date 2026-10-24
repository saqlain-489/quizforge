import type { Draft, FillBlankDraft, McqDraft, Passage, ShortAnswerDraft, TrueFalseDraft } from '../schema.ts';
import { containsVerbatim, loose, norm, wordCount } from '../text.ts';

/**
 * A defect a checker can prove without a model. `refuse` decides what happens
 * when the writer's retries run out: a refused item is dropped from the quiz,
 * anything else ships with a warning. The rule of thumb: refuse what makes an
 * item unanswerable or wrong, warn about what makes it worse.
 */
export interface Defect {
  code: string;
  message: string;
  refuse: boolean;
}

export interface CheckDef {
  code: string;
  appliesTo: Draft['type'][] | 'all';
  refuse: boolean;
  description: string;
}

export const CHECKS: CheckDef[] = [
  { code: 'empty_field', appliesTo: 'all', refuse: true, description: 'A required field (question, answer, quote…) is empty.' },
  { code: 'quote_not_in_passage', appliesTo: 'all', refuse: true, description: 'The cited source quote is not copied word for word from the passage the item is answered from.' },
  { code: 'meta_language', appliesTo: 'all', refuse: false, description: 'The item talks about itself or the AI ("as an AI", "the passage provided") instead of the subject.' },
  { code: 'stem_too_long', appliesTo: 'all', refuse: false, description: 'The question or statement is over 300 characters.' },
  { code: 'mcq_option_count', appliesTo: ['mcq'], refuse: true, description: 'A multiple-choice item does not have exactly four options.' },
  { code: 'mcq_duplicate_options', appliesTo: ['mcq'], refuse: true, description: 'Two options say the same thing.' },
  { code: 'mcq_answer_not_an_option', appliesTo: ['mcq'], refuse: true, description: 'The keyed answer is not exactly one of the options.' },
  { code: 'mcq_key_is_longest', appliesTo: ['mcq'], refuse: false, description: 'The correct option is visibly longer than every distractor, so it can be picked without reading.' },
  { code: 'mcq_all_or_none_of_the_above', appliesTo: ['mcq'], refuse: false, description: '"All of the above" / "None of the above" options.' },
  { code: 'answer_in_stem', appliesTo: ['mcq', 'short_answer'], refuse: false, description: 'The question already contains the answer.' },
  { code: 'negative_stem_unmarked', appliesTo: ['mcq'], refuse: false, description: 'A negative question ("which is not…") without the NOT or EXCEPT in capitals.' },
  { code: 'tf_is_a_question', appliesTo: ['true_false'], refuse: true, description: 'A true/false statement is phrased as a question.' },
  { code: 'tf_absolute_word', appliesTo: ['true_false'], refuse: false, description: '"Always" or "never" in a true/false statement, which gives the answer away.' },
  { code: 'blank_count', appliesTo: ['fill_blank'], refuse: true, description: 'A fill-in-the-blank sentence does not have exactly one ____ blank.' },
  { code: 'blank_answer_visible', appliesTo: ['fill_blank'], refuse: false, description: 'The answer to the blank also appears elsewhere in the sentence.' },
  { code: 'blank_answer_too_long', appliesTo: ['fill_blank'], refuse: false, description: 'The blank asks for more than four words.' },
  { code: 'rubric_size', appliesTo: ['short_answer'], refuse: true, description: 'A short-answer rubric does not have two to four points.' },
];

const DEF = Object.fromEntries(CHECKS.map((c) => [c.code, c]));

function defect(code: string, message: string): Defect {
  return { code, message, refuse: DEF[code]?.refuse ?? false };
}

/** The correct option must be BOTH this many times the average distractor… */
export const MCQ_KEY_LENGTH_RATIO = 1.5;
/** …and this many characters longer than the longest one. Either measure alone flags near-misses. */
export const MCQ_KEY_LENGTH_GAP = 12;

const BLANK = /_{3,}/g;

export function stemOf(d: Draft): string {
  switch (d.type) {
    case 'mcq': return d.question;
    case 'true_false': return d.statement;
    case 'fill_blank': return d.sentence;
    case 'short_answer': return d.question;
  }
}

/** Every visible string of an item, for "is this quote really from the item" checks. */
export function itemText(d: Draft): string {
  switch (d.type) {
    case 'mcq': return [d.question, ...d.options, d.explanation].join('\n');
    case 'true_false': return [d.statement, d.explanation].join('\n');
    case 'fill_blank': return [d.sentence, d.answer, ...d.alternatives, d.explanation].join('\n');
    case 'short_answer': return [d.question, d.modelAnswer, ...d.rubric].join('\n');
  }
}

/** All checks for one item against the passage it is meant to be answered from. */
export function checkItem(d: Draft, passage: Passage): Defect[] {
  const found: Defect[] = [...common(d, passage)];
  switch (d.type) {
    case 'mcq': found.push(...mcq(d)); break;
    case 'true_false': found.push(...trueFalse(d)); break;
    case 'fill_blank': found.push(...fillBlank(d)); break;
    case 'short_answer': found.push(...shortAnswer(d)); break;
  }
  return found;
}

function common(d: Draft, passage: Passage): Defect[] {
  const out: Defect[] = [];
  const stem = stemOf(d);
  const empty = [stem, d.sourceQuote, d.type === 'mcq' ? d.answer : d.type === 'fill_blank' ? d.answer : d.type === 'short_answer' ? d.modelAnswer : 'ok']
    .some((s) => !String(s ?? '').trim());
  if (empty) out.push(defect('empty_field', 'A required field is empty. Fill in the question, the answer and the source quote.'));

  if (d.sourceQuote.trim() && !containsVerbatim(passage.text, d.sourceQuote)) {
    out.push(defect('quote_not_in_passage',
      `The sourceQuote is not in passage ${passage.id} word for word. Copy one or two exact sentences from that passage `
      + 'that prove the answer; do not paraphrase, shorten words or join sentences from different places.'));
  }
  const meta = /\b(as an ai|language model|the (passage|text|document) (provided|given|above|below)|according to the (provided|given) (passage|text)|i (cannot|can't))\b/i;
  if (meta.test(itemText(d))) {
    out.push(defect('meta_language', 'Remove talk about the passage being "provided" or about being an AI. Ask about the subject itself.'));
  }
  if (stem.length > 300) {
    out.push(defect('stem_too_long', `The ${d.type === 'true_false' ? 'statement' : 'question'} is ${stem.length} characters. Keep it under 300 by cutting set-up, not meaning.`));
  }
  return out;
}

export function findMcqBalanceDefect(options: readonly string[], answer: string): Defect | null {
  const opts = options.map((o) => String(o ?? '').trim()).filter(Boolean);
  if (opts.length < 3) return null;
  const ci = opts.findIndex((o) => o === answer.trim());
  if (ci < 0) return null;
  const lens = opts.map((o) => o.length);
  const others = lens.filter((_, i) => i !== ci);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  const gap = lens[ci] - Math.max(...others);
  if (!(mean > 0 && lens[ci] >= mean * MCQ_KEY_LENGTH_RATIO && gap >= MCQ_KEY_LENGTH_GAP)) return null;
  return defect('mcq_key_is_longest',
    `The correct option is ${(lens[ci] / mean).toFixed(1)}x as long as the wrong ones (${lens[ci]} characters against `
    + `${Math.round(mean)} on average), so it can be picked without reading the question. Rewrite the three wrong options `
    + 'to the same length and grammatical shape as the right one, each wrong for a real reason. Do not shorten the right one.');
}

function mcq(d: McqDraft): Defect[] {
  const out: Defect[] = [];
  const opts = d.options.map((o) => String(o ?? '').trim());
  if (opts.length !== 4) out.push(defect('mcq_option_count', `Write exactly four options; this item has ${opts.length}.`));

  const seen = new Map<string, number>();
  for (const o of opts) seen.set(loose(o), (seen.get(loose(o)) ?? 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1).map(([o]) => o);
  if (dupes.length) out.push(defect('mcq_duplicate_options', `These options repeat: "${dupes.join('", "')}". Every option must be different.`));

  const keyHits = opts.filter((o) => o === d.answer.trim()).length;
  if (keyHits !== 1) {
    out.push(defect('mcq_answer_not_an_option', `The answer "${d.answer}" must be copied exactly from one of the four options.`));
  } else {
    const balance = findMcqBalanceDefect(opts, d.answer);
    if (balance) out.push(balance);
  }
  if (opts.some((o) => /\b(all|none|both|neither) of the (above|options)\b/i.test(o))) {
    out.push(defect('mcq_all_or_none_of_the_above', 'Replace "all/none of the above" with a real, specific option.'));
  }
  if (keyHits === 1 && answerLeaks(d.question, d.answer)) {
    out.push(defect('answer_in_stem', 'The question already contains the correct option. Reword it so the answer has to come from the passage.'));
  }
  const neg = d.question.match(/\b(not|except)\b/i);
  if (neg && neg[0] !== neg[0].toUpperCase() && /^(which|what|who|where|when|why|how)\b/i.test(d.question.trim())) {
    out.push(defect('negative_stem_unmarked', `Write the negative word in capitals ("${neg[0].toUpperCase()}") or rephrase the question positively.`));
  }
  return out;
}

/** The whole answer appears in the stem as a phrase of at least two words. */
function answerLeaks(stem: string, answer: string): boolean {
  const a = loose(answer).replace(/[.!?]+$/, '');
  return wordCount(a) >= 2 && loose(stem).includes(a);
}

function trueFalse(d: TrueFalseDraft): Defect[] {
  const out: Defect[] = [];
  if (/\?\s*$/.test(d.statement.trim())) out.push(defect('tf_is_a_question', 'Write a statement that is true or false, not a question.'));
  const abs = d.statement.match(/\b(always|never)\b/i);
  if (abs) out.push(defect('tf_absolute_word', `"${abs[0]}" signals the answer to a test-wise reader. Make the statement precise without it.`));
  return out;
}

function fillBlank(d: FillBlankDraft): Defect[] {
  const out: Defect[] = [];
  const blanks = d.sentence.match(BLANK)?.length ?? 0;
  if (blanks !== 1) out.push(defect('blank_count', `Use exactly one blank written as ____; this sentence has ${blanks}.`));
  const visible = norm(d.sentence.replace(BLANK, ' '));
  const ans = norm(d.answer);
  if (ans && new RegExp(`\\b${ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(visible)) {
    out.push(defect('blank_answer_visible', `"${d.answer}" also appears elsewhere in the sentence, which gives the blank away. Reword the sentence.`));
  }
  if (wordCount(d.answer) > 4) out.push(defect('blank_answer_too_long', 'The blank should take one to four words. Blank out a shorter, key term.'));
  return out;
}

function shortAnswer(d: ShortAnswerDraft): Defect[] {
  const out: Defect[] = [];
  const points = d.rubric.map((r) => r.trim()).filter(Boolean);
  if (points.length < 2 || points.length > 4) out.push(defect('rubric_size', `Write two to four rubric points; this item has ${points.length}.`));
  if (answerLeaks(d.question, d.modelAnswer)) out.push(defect('answer_in_stem', 'The question contains its own model answer. Ask it so the answer has to come from the passage.'));
  return out;
}

/** Order-preserving list of codes, for reports. */
export const codesOf = (ds: readonly Defect[]): string[] => [...new Set(ds.map((d) => d.code))];
