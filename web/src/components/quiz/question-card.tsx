'use client';

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, QuoteIcon, XIcon } from '@/components/icons';
import { PassageBlock } from '@/components/passage';
import { cn } from '@/lib/cn';
import { canCheck, grade, resultOf, type Response, type Result } from '@/lib/grade';
import type { ItemState, QuizAction } from '@/lib/quiz-state';
import { TYPE_LABEL, humanize } from '@/lib/story';
import type { Item, Passage } from '@/lib/types';

const LETTERS = 'ABCDEFGH';

interface Props {
  item: Item;
  index: number;
  total: number;
  state: ItemState;
  passage: Passage | undefined;
  dispatch: (action: QuizAction) => void;
  quoteShown: boolean;
  onToggleQuote: () => void;
  onNext: () => void;
  onShowTrace: () => void;
  focusOnMount: boolean;
}

export function QuestionCard({ item, index, total, state, passage, dispatch, quoteShown, onToggleQuote, onNext, onShowTrace, focusOnMount }: Props) {
  const ids = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const c = item.content;
  const r = state.response;
  const result = resultOf(c, r, state.checked);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  const respond = (response: Response) => dispatch({ type: 'respond', index, response });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state.checked) onNext();
    else if (canCheck(r)) dispatch({ type: 'check', index });
  };
  const action = state.checked
    ? index === total - 1 ? 'See your score' : 'Next question'
    : c.type === 'short_answer' ? 'Show model answer' : 'Check answer';

  return (
    <article aria-labelledby="current-question" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="current-question" ref={headingRef} tabIndex={-1} className="rounded text-[13px] font-medium text-ink-3">
          Question {index + 1} of {total}
        </h2>
        <ul className="flex flex-wrap gap-1.5" aria-label="About this question">
          <Tag>{TYPE_LABEL[c.type]}</Tag>
          <Tag>{humanize(item.skill)}</Tag>
          <Tag>{humanize(item.difficulty)}</Tag>
        </ul>
      </div>

      <form onSubmit={submit} noValidate className="mt-3">
        <AnswerArea item={item} response={r} checked={state.checked} stemId={`${ids}-stem`} respond={respond} />
        {state.checked && (
          <Feedback
            item={item}
            response={r}
            result={result}
            passage={passage}
            quoteShown={quoteShown}
            onToggleQuote={onToggleQuote}
            onShowTrace={onShowTrace}
            onSelfMark={(correct) => dispatch({ type: 'self_mark', index, correct })}
          />
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" className="btn btn-primary" disabled={!state.checked && !canCheck(r)}>
            {action}
            {state.checked && <ArrowRightIcon />}
          </button>
          {!state.checked && c.type !== 'short_answer' && (
            <span className="text-[13px] text-ink-3">{c.type === 'fill_blank' ? 'Press Enter to check' : 'Pick one, then check'}</span>
          )}
        </div>
      </form>
      <p className="sr-only" aria-live="polite">{state.checked ? announce(item, result) : ''}</p>
    </article>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <li className="rounded-md border border-line bg-sunken px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2">{children}</li>;
}

function AnswerArea({ item, response: r, checked, stemId, respond }: {
  item: Item;
  response: Response;
  checked: boolean;
  stemId: string;
  respond: (r: Response) => void;
}) {
  const c = item.content;
  const stemClass = 'text-lg font-medium leading-snug text-balance text-ink sm:text-xl';

  if (c.type === 'mcq' && r.type === 'mcq') {
    return (
      <>
        <p id={stemId} className={stemClass}>{c.question}</p>
        <div role="radiogroup" aria-labelledby={stemId} className="mt-4 grid gap-2">
          {c.options.map((opt, i) => (
            <Choice
              key={opt}
              name={`${stemId}-choice`}
              letter={LETTERS[i]}
              label={opt}
              chosen={r.choice === i}
              isKey={opt === c.answer}
              checked={checked}
              onSelect={() => respond({ type: 'mcq', choice: i })}
            />
          ))}
        </div>
      </>
    );
  }

  if (c.type === 'true_false' && r.type === 'true_false') {
    return (
      <>
        <p id={stemId} className={stemClass}>{c.statement}</p>
        <div role="radiogroup" aria-labelledby={stemId} className="mt-4 grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <Choice
              key={String(v)}
              name={`${stemId}-choice`}
              label={v ? 'True' : 'False'}
              chosen={r.choice === v}
              isKey={c.answer === v}
              checked={checked}
              onSelect={() => respond({ type: 'true_false', choice: v })}
            />
          ))}
        </div>
      </>
    );
  }

  if (c.type === 'fill_blank' && r.type === 'fill_blank') {
    const [before = '', after = ''] = c.sentence.split(/_{3,}/);
    const ok = checked && grade(c, r);
    return (
      <>
        <p id={stemId} className="text-lg leading-[1.95] font-medium text-ink sm:text-xl">
          {before}
          <input
            aria-label="The missing word or phrase"
            value={r.text}
            onChange={(e) => respond({ type: 'fill_blank', text: e.target.value })}
            readOnly={checked}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            size={Math.max(13, r.text.length + 1)}
            className={cn(
              'mx-1 inline-block max-w-full rounded-md border-b-2 px-2 py-0.5 align-baseline font-mono text-[0.85em] outline-none transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              !checked && 'border-line-strong bg-sunken focus:border-accent',
              checked && (ok ? 'border-ok bg-ok-soft text-ok' : 'border-bad bg-bad-soft text-bad'),
            )}
          />
          {after}
        </p>
        {!checked && <p className="mt-3 text-[13px] text-ink-3">Capitals and stray punctuation do not count against you.</p>}
      </>
    );
  }

  if (c.type === 'short_answer' && r.type === 'short_answer') {
    return (
      <>
        <p id={stemId} className={stemClass}>{c.question}</p>
        <label htmlFor={`${stemId}-text`} className="mt-5 block text-sm font-medium text-ink">
          Your answer <span className="font-normal text-ink-3">(optional, never sent anywhere)</span>
        </label>
        <textarea
          id={`${stemId}-text`}
          rows={4}
          value={r.text}
          readOnly={checked}
          onChange={(e) => respond({ ...r, text: e.target.value })}
          placeholder="Two or three sentences, then compare with the model answer."
          className="mt-2 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] leading-6 text-ink placeholder:text-ink-3 focus:border-accent read-only:bg-sunken"
        />
      </>
    );
  }
  return null;
}

function Choice({ name, letter, label, chosen, isKey, checked, onSelect }: {
  name: string;
  letter?: string | undefined;
  label: string;
  chosen: boolean;
  isKey: boolean;
  checked: boolean;
  onSelect: () => void;
}) {
  const status = !checked ? (chosen ? 'chosen' : 'idle') : isKey ? 'key' : chosen ? 'miss' : 'rest';
  return (
    <label
      className={cn(
        'relative flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[15px] leading-6 transition-colors',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent',
        checked ? 'cursor-default' : 'cursor-pointer',
        status === 'idle' && 'border-line bg-surface hover:border-line-strong hover:bg-sunken',
        status === 'chosen' && 'border-accent bg-accent-soft',
        status === 'key' && 'border-ok-line bg-ok-soft',
        status === 'miss' && 'border-bad-line bg-bad-soft',
        status === 'rest' && 'border-line bg-surface text-ink-3',
        !letter && 'justify-center font-medium',
      )}
    >
      <input type="radio" name={name} checked={chosen} disabled={checked} onChange={onSelect} className="sr-only" />
      {letter && (
        <span
          aria-hidden="true"
          className={cn(
            'mt-px flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
            status === 'chosen' ? 'border-accent bg-accent text-canvas'
              : status === 'key' ? 'border-ok bg-ok text-canvas'
              : status === 'miss' ? 'border-bad bg-bad text-canvas'
              : 'border-line-strong text-ink-2',
          )}
        >
          {letter}
        </span>
      )}
      <span className={cn(letter && 'min-w-0 flex-1')}>{label}</span>
      {status === 'key' && (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ok">
          <CheckIcon size={14} />
          <span className={cn('sr-only', letter && 'sm:not-sr-only')}>{chosen ? 'Your answer' : 'Correct answer'}</span>
        </span>
      )}
      {status === 'miss' && (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-bad">
          <XIcon size={14} />
          <span className={cn('sr-only', letter && 'sm:not-sr-only')}>Your answer</span>
        </span>
      )}
    </label>
  );
}

function Feedback({ item, response, result, passage, quoteShown, onToggleQuote, onShowTrace, onSelfMark }: {
  item: Item;
  response: Response;
  result: Result;
  passage: Passage | undefined;
  quoteShown: boolean;
  onToggleQuote: () => void;
  onShowTrace: () => void;
  onSelfMark: (correct: boolean) => void;
}) {
  const c = item.content;
  const box = result === 'correct' ? 'border-ok-line bg-ok-soft/50' : result === 'wrong' ? 'border-bad-line bg-bad-soft/50' : 'border-line bg-sunken/70';
  return (
    <section aria-label="Feedback" className={cn('mt-4 rounded-xl border p-4 sm:p-5', box)}>
      <p className={cn('flex items-center gap-2 font-semibold', result === 'correct' && 'text-ok', result === 'wrong' && 'text-bad')}>
        {result === 'correct' && <CheckIcon />}
        {result === 'wrong' && <XIcon />}
        {verdictTitle(item, result)}
      </p>

      {c.type !== 'short_answer' && (
        <>
          {(result === 'wrong' || c.type === 'fill_blank') && <p className="mt-2 text-[15px] leading-relaxed text-ink">{answerLine(item, result)}</p>}
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{c.explanation}</p>
        </>
      )}

      {c.type === 'short_answer' && response.type === 'short_answer' && (
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="text-xs font-medium tracking-wide text-ink-3 uppercase">Model answer</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">{c.modelAnswer}</p>
          </div>
          <div>
            <h3 className="text-xs font-medium tracking-wide text-ink-3 uppercase">A full answer makes these points</h3>
            <ul className="mt-1.5 space-y-1.5">
              {c.rubric.map((point) => (
                <li key={point} className="flex gap-2 text-[15px] leading-relaxed text-ink-2">
                  <CheckIcon size={16} className="mt-1 shrink-0 text-ink-3" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div role="group" aria-label="Mark your answer" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-ink-2">Did yours make every point?</span>
            <button type="button" aria-pressed={response.selfMark === true} onClick={() => onSelfMark(true)} className="btn btn-secondary btn-toggle h-9">
              <CheckIcon size={15} /> Yes, count it
            </button>
            <button type="button" aria-pressed={response.selfMark === false} onClick={() => onSelfMark(false)} className="btn btn-secondary btn-toggle h-9">
              <XIcon size={15} /> Not yet
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-pressed={quoteShown}
        onClick={onToggleQuote}
        className="mt-4 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-accent-line aria-pressed:border-accent-line"
      >
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          <QuoteIcon size={14} className="shrink-0 text-accent" />
          <span className="truncate">
            Source quote · <span className="font-mono">{item.passageId}</span>
            {passage?.heading && ` ${passage.heading}`}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 pl-2 font-medium text-accent">
            {quoteShown ? 'Highlighted' : 'Show in passage'}
            <ArrowRightIcon size={13} className="max-lg:rotate-90" />
          </span>
        </span>
        <span className="mt-1.5 block text-[15px] leading-relaxed text-ink">“{c.sourceQuote}”</span>
      </button>
      {quoteShown && passage && (
        <div className="mt-3 lg:hidden">
          <PassageBlock idPrefix="inline" passage={passage} quote={c.sourceQuote} bleed={false} />
        </div>
      )}

      <button type="button" onClick={onShowTrace} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
        How this question was made <ArrowUpRightIcon size={14} />
      </button>
    </section>
  );
}

function answerLine(item: Item, result: Result): string {
  const c = item.content;
  switch (c.type) {
    case 'mcq': {
      const letter = LETTERS[c.options.indexOf(c.answer)] ?? '';
      return result === 'correct' ? `${letter}: ${c.answer}.` : `The answer is ${letter}: ${c.answer}.`;
    }
    case 'true_false':
      return `The statement is ${c.answer ? 'true' : 'false'}.`;
    case 'fill_blank':
      return `Answer: ${c.answer}${c.alternatives.length ? ` (also accepted: ${c.alternatives.join(', ')})` : ''}.`;
    case 'short_answer':
      return c.modelAnswer;
  }
}

function verdictTitle(item: Item, result: Result): string {
  if (item.content.type === 'short_answer') {
    return result === 'self_check' ? 'Compare your answer with the model answer' : result === 'correct' ? 'Counted as correct' : 'Counted as missed';
  }
  return result === 'correct' ? 'Correct' : 'Not quite';
}

function announce(item: Item, result: Result): string {
  if (item.content.type === 'short_answer') {
    return result === 'self_check' ? 'Model answer shown. Compare it with yours, then mark it.' : `${verdictTitle(item, result)}.`;
  }
  return `${verdictTitle(item, result)}. ${answerLine(item, result)}`;
}
