'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, CheckIcon, RotateIcon, XIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { score, type Result, type Score } from '@/lib/grade';
import { resultsOf, type QuizAction, type QuizState } from '@/lib/quiz-state';
import { stemOf } from '@/lib/story';
import type { Item, QuizRun } from '@/lib/types';
import { QuestionCard } from './question-card';
import { SourcePanel } from './source-panel';

const RESULT_LABEL: Record<Result, string> = {
  unanswered: 'not answered',
  self_check: 'waiting for your mark',
  correct: 'correct',
  wrong: 'wrong',
};

export function QuizTab({ run, state, dispatch, onShowTrace, onShowPipeline }: {
  run: QuizRun;
  state: QuizState;
  dispatch: (action: QuizAction) => void;
  onShowTrace: (key: string) => void;
  onShowPipeline: () => void;
}) {
  const items = run.quiz.items;
  const results = resultsOf(items, state);
  const sc = score(results);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const item = items[state.current];
  const highlight = item && shownKey === item.key ? { passageId: item.passageId, quote: item.content.sourceQuote } : null;

  const go = (index: number) => {
    setMoved(true);
    dispatch({ type: 'go', index });
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,29rem)]">
      <div className="min-w-0">
        <QuestionNav results={results} current={state.current} score={sc} onGo={go} />
        {item ? (
          <QuestionCard
            key={item.key}
            item={item}
            index={state.current}
            total={items.length}
            state={state.items[state.current]!}
            passage={run.source.passages.find((p) => p.id === item.passageId)}
            dispatch={dispatch}
            quoteShown={shownKey === item.key}
            onToggleQuote={() => setShownKey((k) => (k === item.key ? null : item.key))}
            onNext={() => go(state.current + 1)}
            onShowTrace={() => onShowTrace(item.key)}
            focusOnMount={moved}
          />
        ) : (
          <ResultsCard
            items={items}
            results={results}
            score={sc}
            focusOnMount={moved}
            onGo={go}
            onRestart={() => {
              setShownKey(null);
              setMoved(true);
              dispatch({ type: 'restart', items });
            }}
            onShowPipeline={onShowPipeline}
          />
        )}
      </div>
      <SourcePanel doc={run.source} highlight={highlight} className="hidden lg:flex" />
    </div>
  );
}

function QuestionNav({ results, current, score: sc, onGo }: { results: Result[]; current: number; score: Score; onGo: (i: number) => void }) {
  const answered = results.filter((r) => r !== 'unanswered').length;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <nav aria-label="Questions">
        <ol className="flex flex-wrap gap-1 sm:gap-1.5">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-label={`Question ${i + 1}, ${RESULT_LABEL[r]}`}
                aria-current={i === current ? 'step' : undefined}
                className={cn(
                  'flex size-[30px] items-center justify-center rounded-lg border text-[13px] font-medium tabular-nums transition-colors sm:size-8',
                  r === 'unanswered' && 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                  r === 'correct' && 'border-ok-line bg-ok-soft text-ok',
                  r === 'wrong' && 'border-bad-line bg-bad-soft text-bad',
                  r === 'self_check' && 'border-warn-line bg-warn-soft text-warn',
                  i === current && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas',
                )}
              >
                {i + 1}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onGo(results.length)}
              aria-current={current === results.length ? 'step' : undefined}
              className={cn(
                'flex h-[30px] items-center rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink sm:h-8 sm:px-2.5',
                current === results.length && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas',
              )}
            >
              Score
            </button>
          </li>
        </ol>
      </nav>
      <p className="text-[13px] text-ink-3">
        <span className="font-semibold text-ink tabular-nums">{sc.correct}</span> correct
        <span aria-hidden="true"> · </span>
        <span className="tabular-nums">{answered}</span> of {sc.total} answered
      </p>
    </div>
  );
}

function ResultsCard({ items, results, score: sc, focusOnMount, onGo, onRestart, onShowPipeline }: {
  items: readonly Item[];
  results: Result[];
  score: Score;
  focusOnMount: boolean;
  onGo: (i: number) => void;
  onRestart: () => void;
  onShowPipeline: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  const open = results.filter((r) => r === 'unanswered').length;
  const toMark = results.flatMap((r, i) => (r === 'self_check' ? [i + 1] : []));
  const notes = [
    open ? `${open} ${open === 1 ? 'question is' : 'questions are'} still unanswered.` : null,
    toMark.length ? `Mark question ${toMark.join(', ')} against its rubric to count it.` : null,
  ].filter(Boolean);

  return (
    <article aria-labelledby="results-title" className="card p-5 sm:p-7">
      <h2 id="results-title" ref={headingRef} tabIndex={-1} className="w-fit rounded text-[13px] font-medium text-ink-3">
        Your score
      </h2>
      <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">
        {sc.correct}
        <span className="text-ink-3">/{sc.total}</span>
      </p>
      <p className="mt-3 text-[15px] text-ink-2">
        {notes.length ? notes.join(' ') : sc.correct === sc.total ? 'Every answer right.' : `You answered ${sc.correct} of ${sc.total} correctly.`}
      </p>

      <ol className="mt-6 divide-y divide-line border-y border-line">
        {items.map((item, i) => {
          const r = results[i] ?? 'unanswered';
          return (
            <li key={item.key}>
              <button type="button" onClick={() => onGo(i)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-sunken/60">
                <ResultDot result={r} />
                <span className="w-7 shrink-0 font-mono text-xs text-ink-3">Q{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{stemOf(item.content)}</span>
                <span className="sr-only">, {RESULT_LABEL[r]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onRestart} className="btn btn-secondary">
          <RotateIcon /> Retake the quiz
        </button>
        <button type="button" onClick={onShowPipeline} className="btn btn-primary">
          See how it was made <ArrowRightIcon />
        </button>
      </div>
    </article>
  );
}

function ResultDot({ result }: { result: Result }) {
  const base = 'flex size-5 shrink-0 items-center justify-center rounded-full';
  if (result === 'correct') return <span aria-hidden="true" className={cn(base, 'bg-ok-soft text-ok')}><CheckIcon size={12} strokeWidth={3} /></span>;
  if (result === 'wrong') return <span aria-hidden="true" className={cn(base, 'bg-bad-soft text-bad')}><XIcon size={12} strokeWidth={3} /></span>;
  if (result === 'self_check') return <span aria-hidden="true" className={cn(base, 'bg-warn-soft text-warn')}>?</span>;
  return <span aria-hidden="true" className={cn(base, 'border border-dashed border-line-strong')} />;
}
