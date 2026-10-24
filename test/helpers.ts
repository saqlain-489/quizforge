import type { BlueprintItem, Passage, SourceDoc } from '../src/schema.ts';

export const PASSAGE: Passage = {
  id: 'p01',
  heading: 'Validation',
  text: 'When nothing has changed, the server replies with 304 Not Modified and no body, and the cache marks its copy fresh again. '
    + 'Only when the resource has changed does the server send a full 200 OK response with the new content.',
  words: 37,
};

export const DOC: SourceDoc = { title: 'Caching', origin: 'test', hash: 'x', words: 37, passages: [PASSAGE] };

export const SPEC: BlueprintItem = {
  key: 'q01', type: 'mcq', passageId: 'p01', skill: 'recall', difficulty: 'easy',
  focus: 'What the server sends when the resource is unchanged',
};

export const GOOD_MCQ = {
  question: 'A cache revalidates a stale response and the resource has not changed. What does the server send back?',
  options: ['304 Not Modified with no body', '200 OK with the full content', '404 Not Found with no body', '412 Precondition Failed'],
  answer: '304 Not Modified with no body',
  explanation: 'A 304 tells the cache its copy is still valid.',
  sourceQuote: 'When nothing has changed, the server replies with 304 Not Modified and no body',
};

export const clean = (applicable = true) => ({ applicable, score: 1, issues: [], evidence: null });

export const cleanVerdict = {
  grounded: clean(), single_answer: clean(), clarity: clean(), distractors: clean(), difficulty_fit: clean(),
};
