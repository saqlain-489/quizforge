import type { Draft, Passage } from '../src/schema.ts';

/**
 * The checker's benchmark. Each case is an item and the exact defect codes it
 * should raise: planted defects measure recall, clean and near-miss items
 * measure false positives. A new detector earns its place by adding cases
 * here first.
 */
export interface EvalCase {
  id: string;
  passage: Passage;
  item: Draft;
  expect: string[];
}

const CACHE: Passage = {
  id: 'p04', heading: 'Validation', words: 60,
  text: 'If the stored response included an ETag, an opaque identifier for one version of the resource, the cache sends it back in an If-None-Match header. '
    + 'When nothing has changed, the server replies with 304 Not Modified and no body, and the cache marks its copy fresh again. '
    + 'Only when the resource has changed does the server send a full 200 OK response with the new content.',
};

const LEAF: Passage = {
  id: 'p02', heading: 'Photosynthesis', words: 52,
  text: 'Plants make sugar from carbon dioxide and water, using the energy of sunlight. This takes place in chloroplasts, which contain the green pigment chlorophyll. '
    + 'Oxygen is released as a by-product. In most plants, carbon dioxide enters the leaf through small pores called stomata, which close in hot, dry weather to save water.',
};

const q304 = 'When nothing has changed, the server replies with 304 Not Modified and no body';
const qStomata = 'In most plants, carbon dioxide enters the leaf through small pores called stomata';

const mcq = (over: Partial<Extract<Draft, { type: 'mcq' }>> = {}): Draft => ({
  type: 'mcq',
  question: 'A cache revalidates a stale response and the resource has not changed. What does the server send back?',
  options: ['304 Not Modified with no body', '200 OK with the full content', '404 Not Found with no body', '412 Precondition Failed'],
  answer: '304 Not Modified with no body',
  explanation: 'A 304 tells the cache that its copy is still valid.',
  sourceQuote: q304,
  ...over,
});

const leafMcq = (over: Partial<Extract<Draft, { type: 'mcq' }>> = {}): Draft => ({
  type: 'mcq',
  question: 'Through which structures does carbon dioxide enter the leaf in most plants?',
  options: ['Small pores called stomata', 'Chloroplasts in the leaf cells', 'The roots and the stem', 'Openings in the leaf veins'],
  answer: 'Small pores called stomata',
  explanation: 'Stomata are the pores that let carbon dioxide in.',
  sourceQuote: qStomata,
  ...over,
});

const tf = (statement: string, sourceQuote = qStomata, answer = true): Draft => ({ type: 'true_false', statement, answer, explanation: 'See the passage.', sourceQuote });
const fb = (sentence: string, answer: string, sourceQuote = qStomata): Draft => ({ type: 'fill_blank', sentence, answer, alternatives: [], explanation: 'See the passage.', sourceQuote });
const sa = (question: string, modelAnswer: string, rubric: string[], sourceQuote = qStomata): Draft => ({ type: 'short_answer', question, modelAnswer, rubric, sourceQuote });

export const CASES: EvalCase[] = [
  // Clean items and near misses: none of these may raise anything.
  { id: 'clean-mcq-cache', passage: CACHE, item: mcq(), expect: [] },
  { id: 'clean-mcq-leaf', passage: LEAF, item: leafMcq(), expect: [] },
  { id: 'clean-quote-typography', passage: CACHE, item: mcq({ sourceQuote: '“When nothing has changed,   the server replies with 304 Not Modified and no body.”' }), expect: [] },
  { id: 'clean-key-slightly-longer', passage: LEAF, item: leafMcq({ options: ['Small pores on the leaf called stomata', 'Chloroplasts inside the leaf cells', 'The roots, then up through the stem', 'Openings along the leaf veins'], answer: 'Small pores on the leaf called stomata' }), expect: [] },
  { id: 'clean-not-in-explanation', passage: LEAF, item: leafMcq({ explanation: 'Chloroplasts do not let gas in; stomata do.' }), expect: [] },
  { id: 'clean-negative-capitalised', passage: LEAF, item: leafMcq({ question: 'Which of these is NOT where carbon dioxide enters the leaf?', options: ['Chloroplasts in the leaf cells', 'Small pores called stomata', 'Pores on the leaf surface', 'Openings the plant can close'], answer: 'Chloroplasts in the leaf cells' }), expect: [] },
  { id: 'clean-tf-false', passage: LEAF, item: tf('Stomata stay open in hot, dry weather to cool the leaf.', 'In most plants, carbon dioxide enters the leaf through small pores called stomata, which close in hot, dry weather to save water.', false), expect: [] },
  { id: 'clean-fill', passage: LEAF, item: fb('In most plants, carbon dioxide enters the leaf through small pores called ____.', 'stomata'), expect: [] },
  { id: 'clean-short', passage: LEAF, item: sa('Why do stomata close in hot, dry weather?', 'They close to save water: open pores would let water escape from the leaf.', ['says they close', 'links closing to saving water']), expect: [] },

  // Grounding.
  { id: 'quote-paraphrased', passage: CACHE, item: mcq({ sourceQuote: 'If nothing changed, the server answers 304 Not Modified without a body.' }), expect: ['quote_not_in_passage'] },
  { id: 'quote-from-elsewhere', passage: LEAF, item: leafMcq({ sourceQuote: 'Leaves are usually green because of chlorophyll.' }), expect: ['quote_not_in_passage'] },
  { id: 'quote-stitched', passage: LEAF, item: leafMcq({ sourceQuote: 'Plants make sugar through small pores called stomata.' }), expect: ['quote_not_in_passage'] },
  { id: 'quote-empty', passage: LEAF, item: leafMcq({ sourceQuote: '' }), expect: ['empty_field'] },

  // Multiple choice shape.
  { id: 'key-is-longest', passage: CACHE, item: mcq({ options: ['304 Not Modified with no body, telling the cache its stored copy is still valid', '200 OK', '404', '412'], answer: '304 Not Modified with no body, telling the cache its stored copy is still valid' }), expect: ['mcq_key_is_longest'] },
  { id: 'three-options', passage: CACHE, item: mcq({ options: ['304 Not Modified with no body', '200 OK with the full content', '404 Not Found with no body'] }), expect: ['mcq_option_count'] },
  { id: 'duplicate-options', passage: CACHE, item: mcq({ options: ['304 Not Modified with no body', '200 OK with the full content', '304 not modified with no body', '412 Precondition Failed'] }), expect: ['mcq_duplicate_options'] },
  { id: 'answer-not-an-option', passage: CACHE, item: mcq({ answer: '304 Not Modified' }), expect: ['mcq_answer_not_an_option'] },
  { id: 'none-of-the-above', passage: CACHE, item: mcq({ options: ['304 Not Modified with no body', '200 OK with the full content', '404 Not Found with no body', 'None of the above'] }), expect: ['mcq_all_or_none_of_the_above'] },
  { id: 'answer-in-stem', passage: LEAF, item: leafMcq({ question: 'Carbon dioxide enters the leaf through small pores called stomata. Where does it enter?' }), expect: ['answer_in_stem'] },
  { id: 'negative-lowercase', passage: LEAF, item: leafMcq({ question: 'Which of these is not where carbon dioxide enters the leaf?', options: ['Chloroplasts in the leaf cells', 'Small pores called stomata', 'Pores on the leaf surface', 'Openings the plant can close'], answer: 'Chloroplasts in the leaf cells' }), expect: ['negative_stem_unmarked'] },

  // True/false.
  { id: 'tf-question', passage: LEAF, item: tf('Does carbon dioxide enter the leaf through stomata?'), expect: ['tf_is_a_question'] },
  { id: 'tf-absolute', passage: LEAF, item: tf('Carbon dioxide always enters the leaf through stomata.'), expect: ['tf_absolute_word'] },

  // Fill in the blank.
  { id: 'blank-twice', passage: LEAF, item: fb('Carbon dioxide enters through ____ and leaves through ____.', 'stomata'), expect: ['blank_count'] },
  { id: 'blank-none', passage: LEAF, item: fb('Carbon dioxide enters the leaf through stomata.', 'stomata'), expect: ['blank_count', 'blank_answer_visible'] },
  { id: 'blank-answer-visible', passage: LEAF, item: fb('Pores called ____ let carbon dioxide in; stomata close in dry weather.', 'stomata'), expect: ['blank_answer_visible'] },
  { id: 'blank-answer-long', passage: LEAF, item: fb('Carbon dioxide enters the leaf through ____.', 'small pores in the leaf called stomata'), expect: ['blank_answer_too_long'] },

  // Short answer.
  { id: 'rubric-one-point', passage: LEAF, item: sa('Why do stomata close in hot, dry weather?', 'To save water.', ['mentions water']), expect: ['rubric_size'] },
  { id: 'rubric-six-points', passage: LEAF, item: sa('Why do stomata close in hot, dry weather?', 'To save water.', ['a', 'b', 'c', 'd', 'e', 'f']), expect: ['rubric_size'] },

  // Anything.
  { id: 'meta-provided-passage', passage: LEAF, item: leafMcq({ question: 'According to the provided passage, where does carbon dioxide enter the leaf?' }), expect: ['meta_language'] },
  { id: 'meta-as-an-ai', passage: LEAF, item: leafMcq({ explanation: 'As an AI, I believe stomata are the answer.' }), expect: ['meta_language'] },
  { id: 'stem-too-long', passage: LEAF, item: leafMcq({ question: `${'Considering everything the section says about leaves, sunlight, sugar and the exchange of gases with the air around the plant, '.repeat(3)}where does carbon dioxide enter?` }), expect: ['stem_too_long'] },
];
