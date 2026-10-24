'use client';

import { useState, type ReactNode } from 'react';
import { CheckIcon, XIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { BADGE_LABEL, ROLE_LABEL, TYPE_LABEL, badgesFor, type Badge } from '@/lib/story';
import type { DemoRun, ItemType, Role } from '@/lib/types';
import { ItemTrace } from './item-trace';

const ROLE_ORDER: Role[] = ['planner', 'writer', 'writer_strong', 'judge_screen', 'judge_full'];
const FILTERS: Badge[] = ['first_try', 'retried', 'fixed', 'rewritten', 'discarded'];

export function PipelineTab({ demo, onOpenQuestion }: { demo: DemoRun; onOpenQuestion: (index: number) => void }) {
  const items = demo.run.quiz.items;
  const badges = items.map((item) => badgesFor(item, demo.traces[item.key] ?? []));
  const [filter, setFilter] = useState<Badge | 'all'>('all');
  const options = [
    { id: 'all' as const, label: 'All questions', n: items.length },
    ...FILTERS.map((b) => ({ id: b, label: BADGE_LABEL[b], n: badges.filter((list) => list.includes(b)).length })).filter((o) => o.n > 0),
  ];

  return (
    <div className="space-y-14">
      <section aria-labelledby="pipeline-title">
        <SectionHeading id="pipeline-title" eyebrow="The pipeline" title="Agents write, code checks, a judge reviews">
          Every stage that can reject a question says exactly why, and the question goes back with that reason instead of being retried blind.
        </SectionHeading>
        <PipelineDiagram demo={demo} />
        <RunSummary demo={demo} />
      </section>

      <section aria-labelledby="trace-title">
        <SectionHeading id="trace-title" eyebrow="Step by step" title="Every question, from first draft to the quiz">
          Drafts and verdicts below are the scripted replies this replay ran on. The checks, the escalation and the evidence rule that judged them
          are the pipeline&apos;s own code, re-run when this page was built.
        </SectionHeading>
        <div role="group" aria-label="Show questions" className="mb-4 flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={filter === o.id}
              onClick={() => setFilter(o.id)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-canvas"
            >
              {o.label}
              <span className="font-mono text-[12px] tabular-nums opacity-70">{o.n}</span>
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {filter === 'all' && demo.plan.length > 0 && <PlanCard demo={demo} />}
          {items.map((item, i) =>
            filter === 'all' || badges[i]?.includes(filter) ? (
              <ItemTrace key={item.key} demo={demo} item={item} index={i} onOpen={() => onOpenQuestion(i)} />
            ) : null,
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 max-w-3xl">
      <p className="text-[13px] font-medium text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{title}</h2>
      {children && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  );
}

function calls(demo: DemoRun, ...roles: Role[]): number {
  return roles.reduce((n, r) => n + (demo.run.report.byRole[r]?.calls ?? 0), 0);
}

function PipelineDiagram({ demo }: { demo: DemoRun }) {
  const r = demo.run.report;
  const defects = Object.values(r.defectsCaught).reduce((a, b) => a + b, 0);
  const firstPlanRejected = demo.plan.length > 1 && demo.plan[0]?.accepted === false;
  const stages = [
    {
      name: 'Plan',
      who: 'Planner agent',
      text: 'Picks what each question tests: one passage, a type, a skill and a difficulty. Code validates the blueprint and sends it back with exact fixes.',
      stat: `${calls(demo, 'planner')} calls${firstPlanRejected ? ' · 1 sent back' : ''}`,
    },
    {
      name: 'Write',
      who: 'Writer agents, in parallel',
      text: 'Draft each question from its passage and copy a sentence from it, word for word, as the evidence for the answer.',
      stat: `${calls(demo, 'writer', 'writer_strong')} calls`,
    },
    {
      name: 'Check',
      who: 'Plain code, no model',
      text: 'Is the quote really in the passage? One key among four options? Does anything give the answer away? A failure goes back with the exact fix.',
      stat: `${defects} ${defects === 1 ? 'defect' : 'defects'} caught`,
    },
    {
      name: 'Judge',
      who: 'Cheap screen, strong second look',
      text: 'A cheap model grades every question on up to five dimensions. A blocker escalates to a strong model. A complaint it cannot quote is discarded.',
      stat: `${calls(demo, 'judge_screen')} screens · ${r.judge.escalations} ${r.judge.escalations === 1 ? 'escalation' : 'escalations'}`,
    },
    {
      name: 'Rewrite',
      who: 'Only on a confirmed blocker',
      text: "The writer gets the judge's issue and quoted evidence. The rewrite is checked and judged again before it can ship.",
      stat: `${r.revisedAfterJudge} ${r.revisedAfterJudge === 1 ? 'question' : 'questions'} rewritten`,
    },
  ];

  return (
    <div>
      <ol className="grid gap-3 lg:grid-cols-5">
        {stages.map((s, i) => (
          <li
            key={s.name}
            className={cn('card relative flex flex-col p-4', i === stages.length - 1 && 'border-dashed')}
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft font-mono text-[12px] font-semibold text-accent">{i + 1}</span>
              <h3 className="text-[15px] font-semibold text-ink">{s.name}</h3>
            </div>
            <p className="mt-1 text-[12.5px] font-medium text-ink-3">{s.who}</p>
            <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-2">{s.text}</p>
            <p className="mt-3 border-t border-line pt-2.5 font-mono text-[12px] text-ink">{s.stat}</p>
            {i < stages.length - 1 && <Connector />}
          </li>
        ))}
      </ol>
      <Loops />
    </div>
  );
}

function Connector() {
  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-[15px] left-1/2 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-canvas text-ink-3 lg:top-1/2 lg:-right-[15px] lg:bottom-auto lg:left-auto lg:translate-x-0 lg:-translate-y-1/2"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 lg:rotate-0">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

function Loops() {
  const loops = [
    { label: 'retry with the fix', text: 'a failed check goes back to the writer with the exact fix', path: 'Check → Write' },
    { label: 'rewrite, then check and judge again', text: 'a confirmed blocker is rewritten, then checked and judged again', path: 'Rewrite → Check → Judge' },
  ];
  return (
    <>
      <div aria-hidden="true" className="relative mt-1 hidden h-[86px] lg:block">
        <Bracket fromCol={3} toCol={2} depth={26} label={loops[0]!.label} />
        <Bracket fromCol={5} toCol={3} depth={62} label={loops[1]!.label} />
      </div>
      <ul className="mt-6 space-y-2 lg:sr-only">
        {loops.map((l) => (
          <li key={l.label} className="flex items-start gap-2 text-[13.5px] text-ink-2">
            <span aria-hidden="true" className="mt-0.5 font-mono text-ink-3">↺</span>
            <span>
              <span className="font-medium text-ink">{l.path}:</span> {l.text}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// Columns are 1-based on a 5-column grid with a 0.75rem gap; ends sit 10px either side of a column's centre.
function Bracket({ fromCol, toCol, depth, label }: { fromCol: number; toCol: number; depth: number; label: string }) {
  const center = (col: number) => `calc((100% - 3rem) / 5 * ${col - 0.5} + 0.75rem * ${col - 1})`;
  const left = `calc(${center(toCol)} - 10px)`;
  const right = `calc(100% - ${center(fromCol)} - 10px)`;
  return (
    <div className="absolute top-0" style={{ left, right, height: depth }}>
      <div className="absolute inset-0 rounded-b-xl border-2 border-t-0 border-dashed border-line-strong" />
      <svg width="12" height="10" viewBox="0 0 12 10" className="absolute -top-[7px] -left-[5px] text-line-strong" fill="currentColor">
        <path d="M6 0 12 10H0z" />
      </svg>
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[12px] whitespace-nowrap text-ink-2">
        {label}
      </span>
    </div>
  );
}

function RunSummary({ demo }: { demo: DemoRun }) {
  const r = demo.run.report;
  const roles = ROLE_ORDER.filter((role) => (r.byRole[role]?.calls ?? 0) > 0);
  const total = roles.reduce((n, role) => n + (r.byRole[role]?.calls ?? 0), 0);
  const max = Math.max(...roles.map((role) => r.byRole[role]?.calls ?? 0), 1);
  const tiles = [
    { value: `${r.delivered}/${r.planned}`, label: 'delivered', sub: r.dropped.length ? `${r.dropped.length} dropped` : 'none dropped' },
    { value: r.firstTry, label: 'first try', sub: 'passed every check' },
    { value: r.fixedByRetry, label: 'fixed by a retry', sub: "with the checker's message" },
    { value: r.revisedAfterJudge, label: 'rewritten', sub: 'after a confirmed blocker' },
    { value: r.judge.escalations, label: r.judge.escalations === 1 ? 'escalation' : 'escalations', sub: `of ${r.judge.graded} judged` },
  ];
  const byModel = new Map<string, string[]>();
  for (const role of ROLE_ORDER) {
    const model = demo.models[role];
    if (model) byModel.set(model, [...(byModel.get(model) ?? []), ROLE_LABEL[role].toLowerCase()]);
  }

  return (
    <div className="mt-8">
      <h3 className="text-[13px] font-medium text-ink">This run</h3>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {tiles.map((t, i) => (
          <li key={t.label} className={cn('card p-4', i === 0 && 'col-span-2 sm:col-span-1')}>
            <p className="text-[28px] leading-none font-semibold tracking-tight text-ink tabular-nums">{t.value}</p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{t.label}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{t.sub}</p>
          </li>
        ))}
        <li className="card col-span-2 flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:col-span-1 xl:col-span-2">
          <div>
            <p className="text-[28px] leading-none font-semibold tracking-tight text-ink tabular-nums">{total}</p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">model calls</p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-3">all scripted</p>
          </div>
          <ul className="min-w-44 flex-1 space-y-1.5" aria-label="Calls by role">
            {roles.map((role) => {
              const n = r.byRole[role]?.calls ?? 0;
              return (
                <li key={role} className="grid grid-cols-[6rem_1fr_1.25rem] items-center gap-2 text-[12px]">
                  <span className="truncate text-ink-2">{ROLE_LABEL[role]}</span>
                  <span aria-hidden="true" className="h-1.5 rounded-full bg-sunken">
                    <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="text-right font-mono text-ink tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
      <p className="mt-3 max-w-4xl text-[12.5px] leading-relaxed text-ink-3">
        Counts come from the run report. Every call was answered by a scripted reply, so there are no tokens, costs or latencies to report.
        {byModel.size > 0 && (
          <>
            {' '}A live run uses{' '}
            {[...byModel].map(([model, names], i) => (
              <span key={model}>
                {i > 0 && (i === byModel.size - 1 ? ' and ' : ', ')}
                <span className="font-mono whitespace-nowrap text-ink-2">{model}</span> ({names.join(', ')})
              </span>
            ))}
            .
          </>
        )}
      </p>
    </div>
  );
}

function PlanCard({ demo }: { demo: DemoRun }) {
  const items = demo.run.quiz.items;
  const passages = new Set(items.map((i) => i.passageId)).size;
  const types = Object.entries(
    items.reduce<Partial<Record<ItemType, number>>>((acc, i) => ({ ...acc, [i.content.type]: (acc[i.content.type] ?? 0) + 1 }), {}),
  ).map(([t, n]) => `${n} ${TYPE_LABEL[t as ItemType].toLowerCase()}`);
  const last = demo.plan.length - 1;

  return (
    <article aria-labelledby="plan-title" className="card overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3.5">
        <span className="font-mono text-xs text-ink-3">Plan</span>
        <h3 id="plan-title" className="text-[15px] font-medium text-ink">The blueprint for the whole quiz</h3>
        <span className="text-xs text-ink-3">Planner agent · {demo.plan.length} {demo.plan.length === 1 ? 'attempt' : 'attempts'}</span>
      </header>
      <ol className="space-y-4 px-5 py-4">
        {demo.plan.map((attempt, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border',
                attempt.accepted ? 'border-ok-line bg-ok-soft text-ok' : 'border-bad-line bg-bad-soft text-bad',
              )}
            >
              {attempt.accepted ? <CheckIcon size={13} strokeWidth={2.6} /> : <XIcon size={13} strokeWidth={2.6} />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[14px] font-medium text-ink">
                {attempt.accepted
                  ? `Blueprint ${i + 1} accepted`
                  : i === last ? `Blueprint ${i + 1} repaired by code` : `Blueprint ${i + 1} sent back by code`}
              </p>
              {attempt.accepted ? (
                <p className="mt-1 text-[13.5px] text-ink-2">
                  {items.length} questions over {passages} passages: {types.join(', ')}.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {attempt.issues.map((issue) => (
                    <li key={issue} className="text-[13.5px] leading-relaxed text-ink-2">“{issue}”</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
