import { canCheck, emptyResponse, resultOf, type Response, type Result } from './grade';
import type { Item } from './types';

export interface ItemState {
  response: Response;
  checked: boolean;
}

export interface QuizState {
  /** items.length means the results screen */
  current: number;
  items: ItemState[];
}

export type QuizAction =
  | { type: 'respond'; index: number; response: Response }
  | { type: 'check'; index: number }
  | { type: 'self_mark'; index: number; correct: boolean }
  | { type: 'go'; index: number }
  | { type: 'restart'; items: readonly Item[] };

export function initQuiz(items: readonly Item[]): QuizState {
  return { current: 0, items: items.map((i) => ({ response: emptyResponse(i.content), checked: false })) };
}

function patch(state: QuizState, index: number, fn: (s: ItemState) => ItemState): QuizState {
  const target = state.items[index];
  if (!target) return state;
  const items = state.items.slice();
  items[index] = fn(target);
  return { ...state, items };
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'respond':
      return patch(state, action.index, (s) => (s.checked ? s : { ...s, response: action.response }));
    case 'check':
      return patch(state, action.index, (s) => (canCheck(s.response) ? { ...s, checked: true } : s));
    case 'self_mark':
      return patch(state, action.index, (s) =>
        s.checked && s.response.type === 'short_answer' ? { ...s, response: { ...s.response, selfMark: action.correct } } : s);
    case 'go':
      return { ...state, current: Math.max(0, Math.min(action.index, state.items.length)) };
    case 'restart':
      return initQuiz(action.items);
  }
}

export function resultsOf(items: readonly Item[], state: QuizState): Result[] {
  return items.map((item, i) => {
    const s = state.items[i];
    return s ? resultOf(item.content, s.response, s.checked) : 'unanswered';
  });
}
