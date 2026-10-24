'use client';

import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { REPO_URL, demoRun, sourceUrl } from '@/lib/demo';
import { initQuiz, quizReducer } from '@/lib/quiz-state';
import { GitHubIcon, InfoIcon, LogoMark } from './icons';
import { PipelineTab } from './pipeline/pipeline-tab';
import { QuizTab } from './quiz/quiz-tab';
import { SourceTab } from './source-tab';

const TABS = [
  { id: 'quiz', label: 'Take the quiz' },
  { id: 'how-it-was-made', label: 'How it was made' },
  { id: 'source', label: 'Source' },
] as const;

type Tab = (typeof TABS)[number]['id'];

const demo = demoRun();

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Viewer() {
  const { run } = demo;
  const [tab, setTab] = useState<Tab>('quiz');
  const [quiz, dispatch] = useReducer(quizReducer, run.quiz.items, initQuiz);
  const anchor = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pending = useRef<{ scroll?: string; focus?: string } | null>(null);

  useEffect(() => {
    const fromHash = () => {
      const match = TABS.find((t) => `#${t.id}` === window.location.hash);
      if (match) setTab(match.id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  useEffect(() => {
    const target = pending.current;
    pending.current = null;
    if (!target) return;
    if (target.scroll) {
      document.getElementById(target.scroll)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    document.getElementById(target.focus ?? target.scroll ?? '')?.focus({ preventScroll: true });
  }, [tab]);

  const select = (next: Tab, target?: { scroll?: string; focus?: string }) => {
    setTab(next);
    history.replaceState(null, '', `#${next}`);
    pending.current = target ?? null;
    if (target?.scroll) return;
    const top = (anchor.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
    if (window.scrollY > top) window.scrollTo({ top });
  };

  const openQuestion = (index: number) => {
    dispatch({ type: 'go', index });
    select('quiz', { focus: 'current-question' });
  };

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = TABS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    const next = to === undefined ? undefined : TABS[to];
    if (to === undefined || !next) return;
    e.preventDefault();
    select(next.id);
    tabRefs.current[to]?.focus();
  };

  const href = sourceUrl(run.source.origin);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
        Skip to content
      </a>

      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <a href={REPO_URL} className="flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight">
            <LogoMark size={22} />
            quizforge
          </a>
          <span aria-hidden="true" className="hidden h-4 w-px bg-line-strong md:block" />
          <span className="hidden text-[13px] text-ink-3 md:block">Turn any document into a checked, source-cited quiz</span>
          <a
            href={REPO_URL}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section className="mx-auto max-w-7xl gap-10 px-4 pt-7 pb-6 sm:px-6 lg:flex lg:items-end lg:justify-between lg:pb-5">
          <div className="max-w-3xl">
            <h1 className="text-[27px] leading-tight font-semibold tracking-tight text-balance sm:text-[32px]">{run.quiz.title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              {run.quiz.items.length} questions written from{' '}
              {href ? <a className="link" href={href}>{run.source.title}</a> : <span className="text-ink">{run.source.title}</span>} ({run.source.words} words,{' '}
              {run.source.passages.length} passages). Every answer cites a sentence from its passage, checked word for word.
            </p>
          </div>
          <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2 shadow-card lg:mt-0 lg:max-w-[30rem] lg:shrink-0">
            <InfoIcon className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong className="font-semibold text-ink">Demo replay:</strong> the real pipeline ran on scripted model replies, so it&apos;s free and
              repeatable. <a className="link" href={`${REPO_URL}#readme`}>Run it with your own key</a> for live generation.
            </span>
          </p>
        </section>

        <div ref={anchor} />
        <div className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div role="tablist" aria-label="Views" className="mx-auto flex h-12 max-w-7xl items-stretch gap-1 overflow-x-auto px-2 sm:gap-4 sm:px-4">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-controls={`panel-${t.id}`}
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => select(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  '-mb-px shrink-0 border-b-2 px-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-2',
                  tab === t.id ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {TABS.map((t) => (
          <section
            key={t.id}
            role="tabpanel"
            id={`panel-${t.id}`}
            aria-labelledby={`tab-${t.id}`}
            hidden={tab !== t.id}
            className="mx-auto max-w-7xl px-4 pt-5 pb-10 sm:px-6 sm:pt-6"
          >
            {t.id === 'quiz' && (
              <QuizTab
                run={run}
                state={quiz}
                dispatch={dispatch}
                onShowTrace={(key) => select('how-it-was-made', { scroll: `trace-${key}` })}
                onShowPipeline={() => select('how-it-was-made')}
              />
            )}
            {t.id === 'how-it-was-made' && (
              <PipelineTab demo={demo} onOpenQuestion={openQuestion} />
            )}
            {t.id === 'source' && (
              <SourceTab run={run} onOpenQuestion={openQuestion} />
            )}
          </section>
        ))}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-[13px] text-ink-3 sm:px-6">
          <p>
            Built by Saqlain Ahmad · <a className="link" href={REPO_URL}>source on GitHub</a>
          </p>
          <p>A static page: nothing you type leaves your browser.</p>
        </div>
      </footer>
    </div>
  );
}
