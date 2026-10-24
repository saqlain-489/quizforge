import type { ReactNode } from 'react';
import { AlertIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon, SlashIcon, XIcon } from '@/components/icons';
import { PassageText } from '@/components/passage';
import { longestQuotedPrefix } from '@/lib/quote';
import { cn } from '@/lib/cn';
import { BADGE_LABEL, ROLE_LABEL, TYPE_LABEL, badgesFor, dimTone, fmtScore, humanize, stemOf, type Badge } from '@/lib/story';
import type { DemoRun, DimInfo, DimVerdict, DiscardedComplaint, Draft, Item, JudgeEvent, Role, WriteEvent } from '@/lib/types';

const LETTERS = 'ABCDEFGH';

const WHO: Record<Role, string> = {
  planner: 'planner agent',
  writer: 'writer agent',
  writer_strong: 'strong writer, last round',
  judge_screen: 'cheap screen model',
  judge_full: 'strong model',
};

type Tone = 'ok' | 'bad' | 'warn' | 'accent' | 'muted';

const TONE: Record<Tone, string> = {
  ok: 'border-ok-line bg-ok-soft text-ok',
  bad: 'border-bad-line bg-bad-soft text-bad',
  warn: 'border-warn-line bg-warn-soft text-warn',
  accent: 'border-accent-line bg-accent-soft text-accent',
  muted: 'border-line bg-sunken text-ink-3',
};

const BADGE_TONE: Record<Badge, Tone> = {
  first_try: 'ok',
  retried: 'muted',
  fixed: 'warn',
  rewritten: 'accent',
  discarded: 'muted',
};

export function ItemTrace({ demo, item, index, onOpen }: { demo: DemoRun; item: Item; index: number; onOpen: () => void }) {
  const events = demo.traces[item.key] ?? [];
  const passage = demo.run.source.passages.find((p) => p.id === item.passageId);
  const titleId = `trace-${item.key}-title`;

  const steps: ReactNode[] = [];
  let drafts = 0;
  let lastDraft: Draft | null = null;
  for (const [k, e] of events.entries()) {
    if (e.kind === 'write') {
      drafts += 1;
      if (e.draft) lastDraft = e.draft;
      steps.push(<WriteStep key={k} event={e} n={drafts} checks={demo.checks} />);
    } else {
      steps.push(<JudgeStep key={k} event={e} draft={lastDraft} dims={demo.dims} />);
    }
  }
  if (!events.length) steps.push(...fallbackSteps(item, demo));

  return (
    <article id={`trace-${item.key}`} tabIndex={-1} aria-labelledby={titleId} className="card scroll-mt-20 overflow-clip">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="pt-0.5 font-mono text-xs text-ink-3">Q{index + 1}</span>
        <div className="min-w-0 flex-1 basis-64">
          <h3 id={titleId} className="text-[15px] leading-snug font-medium text-ink">{item.focus}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {TYPE_LABEL[item.content.type]} · {humanize(item.skill).toLowerCase()} · {item.difficulty} · from{' '}
            <span className="font-mono">{item.passageId}</span>
            {passage?.heading ? ` ${passage.heading}` : ''}
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Outcome">
          {badgesFor(item, events).map((b) => (
            <li key={b} className={cn('rounded-full border px-2 py-0.5 text-[11.5px] font-medium', TONE[BADGE_TONE[b]])}>
              {BADGE_LABEL[b]}
            </li>
          ))}
        </ul>
      </header>
      <ol className="px-4 py-4 sm:px-5">
        {steps}
        <Step tone="accent" icon={<ArrowRightIcon size={13} strokeWidth={2.6} />} title={`Shipped as question ${index + 1}`}>
          <button type="button" onClick={onOpen} className="link mt-0.5 text-[13px]">
            Open it in the quiz
          </button>
        </Step>
      </ol>
    </article>
  );
}

function Step({ tone, icon, title, who, children }: { tone: Tone; icon: ReactNode; title: string; who?: string; children?: ReactNode }) {
  return (
    <li className="group/step relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden="true" className="absolute top-7 bottom-1 left-[11.5px] w-px bg-line group-last/step:hidden" />
      <span aria-hidden="true" className={cn('relative flex size-6 shrink-0 items-center justify-center rounded-full border', TONE[tone])}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[14px] leading-snug font-medium text-ink">
          {title}
          {who && <span className="ml-2 text-[12px] font-normal text-ink-3">{who}</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

const okIcon = <CheckIcon size={13} strokeWidth={2.6} />;
const badIcon = <XIcon size={13} strokeWidth={2.6} />;
const warnIcon = <AlertIcon size={13} strokeWidth={2.4} />;

function WriteStep({ event, n, checks }: { event: WriteEvent; n: number; checks: Record<string, string> }) {
  const name = event.rewrite ? `Rewrite (draft ${n})` : `Draft ${n}`;
  const who = WHO[event.role];
  if (!event.draft) {
    return (
      <Step tone="warn" icon={warnIcon} title={`${name} never arrived`} who={who}>
        <p className="mt-1 text-[13.5px] text-ink-2">{event.error ?? 'The reply was empty'}, so the writer was asked again.</p>
      </Step>
    );
  }
  if (!event.defects.length) return <Step tone="ok" icon={okIcon} title={`${name} passed every check`} who={who} />;

  const codes = event.defects.map((d) => d.code);
  return (
    <Step tone="bad" icon={badIcon} title={`${name} failed ${codes.length === 1 ? 'a check' : `${codes.length} checks`}`} who={who}>
      {event.defects.map((d) => (
        <div key={d.code} className="mt-2 rounded-lg border border-line bg-sunken/70 px-3.5 py-3">
          <p className="text-[13.5px] leading-relaxed text-ink">
            {checks[d.code] ?? humanize(d.code)}{' '}
            <code className="ml-0.5 rounded border border-line bg-surface px-1 py-px font-mono text-[11px] whitespace-nowrap text-ink-3">{d.code}</code>
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink-3">Sent back to the writer: </span>“{d.message}”
          </p>
        </div>
      ))}
      <DraftDetails
        draft={event.draft}
        label="See the rejected draft"
        lengths={codes.includes('mcq_key_is_longest')}
        badQuote={codes.includes('quote_not_in_passage')}
      />
    </Step>
  );
}

function JudgeStep({ event, draft, dims }: { event: JudgeEvent; draft: Draft | null; dims: Record<string, DimInfo> }) {
  const judge = ROLE_LABEL[event.role];
  const who = WHO[event.role];
  const target = event.rewrite ? 'the rewrite' : 'it';
  if (event.error) {
    return (
      <Step tone="warn" icon={warnIcon} title={`${judge} could not grade ${target}`} who={who}>
        <p className="mt-1 text-[13.5px] text-ink-2">{event.error}</p>
      </Step>
    );
  }

  const failing = Object.entries(event.dims).filter(([, v]) => v.status === 'ok' && v.pass === false);
  const names = failing.map(([id]) => (dims[id]?.name ?? humanize(id)).toLowerCase()).join(', ');

  if (event.escalates) {
    return (
      <Step tone="warn" icon={warnIcon} title={`${judge} flagged ${names}, so it escalated`} who={who}>
        {failing.map(([id, v]) => <Finding key={id} id={id} verdict={v} info={dims[id]} withEvidence={false} />)}
      </Step>
    );
  }

  if (event.blockers.length) {
    const evidence = failing.find(([id]) => event.blockers.includes(id))?.[1].evidence ?? null;
    return (
      <Step tone="bad" icon={badIcon} title={`${judge} confirmed a blocker: ${names}`} who={who}>
        {failing.map(([id, v]) => <Finding key={id} id={id} verdict={v} info={dims[id]} withEvidence />)}
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">The issue and its quote went back to the writer as reviewer notes.</p>
        {draft && <DraftDetails draft={draft} label="See the draft it rejected" evidence={evidence} />}
      </Step>
    );
  }

  const title = event.discarded.length ? `${judge} passed ${target} and dropped an unquoted complaint` : `${judge} passed ${target}`;
  return (
    <Step tone="ok" icon={okIcon} title={title} who={who}>
      <Scores dims={event.dims} info={dims} />
      {event.discarded.map((c) => <Discarded key={c.dim} complaint={c} info={dims[c.dim]} draft={draft} />)}
    </Step>
  );
}

function Finding({ id, verdict: v, info, withEvidence }: { id: string; verdict: DimVerdict; info: DimInfo | undefined; withEvidence: boolean }) {
  return (
    <div className="mt-2 rounded-lg border border-line bg-sunken/70 px-3.5 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
        <span className="font-medium text-ink">{info?.name ?? humanize(id)}</span>
        <span className={cn('font-mono text-[12.5px]', info?.blocking ? 'text-bad' : 'text-warn')}>{fmtScore(v.score)}</span>
        <span className="text-[12px] text-ink-3">
          pass mark {fmtScore(v.threshold)}
          {info?.blocking ? ', blocking' : ''}
        </span>
      </p>
      {v.issues.map((issue) => (
        <p key={issue} className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{issue}</p>
      ))}
      {withEvidence && v.evidence && (
        <p className="mt-2 border-l-2 border-warn pl-3 text-[13.5px] leading-relaxed text-ink">
          <span className="text-ink-3">Quoted from the draft: </span>“{v.evidence}”
        </p>
      )}
    </div>
  );
}

function Discarded({ complaint, info, draft }: { complaint: DiscardedComplaint; info: DimInfo | undefined; draft: Draft | null }) {
  const stem = draft ? stemOf(draft) : null;
  const words = complaint.evidence?.trim().split(/\s+/) ?? [];
  const near = stem && complaint.evidence ? longestQuotedPrefix(stem, complaint.evidence) : null;
  return (
    <div className="mt-3 rounded-lg border border-dashed border-line-strong px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
        <SlashIcon size={14} className="text-ink-3" />
        {info?.name ?? humanize(complaint.dim)}: complaint discarded
      </p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
        The judge gave {humanize(complaint.dim).toLowerCase()} {fmtScore(complaint.score)} and said: “{complaint.issues.join(' ')}”
      </p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
        {complaint.evidence ? (
          <>
            Its quote, “
            {near ? (
              <>
                <span className="text-ink">{words.slice(0, near.words).join(' ')}</span>{' '}
                <span className="text-bad underline decoration-bad-line decoration-2 underline-offset-2">{words.slice(near.words).join(' ')}</span>
              </>
            ) : (
              <span className="text-ink">{complaint.evidence}</span>
            )}
            ”, is in neither the question nor the passage.
          </>
        ) : (
          'It gave no quote.'
        )}
        {stem && (
          <>
            {' '}The question reads: “
            {near ? (
              <>
                {stem.slice(0, near.span.start)}
                <span className="cite-mark">{stem.slice(near.span.start, near.span.end)}</span>
                {stem.slice(near.span.end)}
              </>
            ) : (
              stem
            )}
            ”
          </>
        )}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
        A complaint without a verbatim quote is dropped and the score lifted to the pass mark
        {info ? ` (${fmtScore(info.threshold)})` : ''}, so every issue the judge reports can be checked by a person.
      </p>
    </div>
  );
}

function Scores({ dims, info }: { dims: Record<string, DimVerdict>; info: Record<string, DimInfo> }) {
  return (
    <dl className="mt-2.5 grid max-w-3xl grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 xl:grid-cols-5">
      {Object.entries(dims).map(([id, v]) => {
        const meta = info[id];
        const tone = dimTone(v, meta?.blocking ?? false);
        return (
          <div key={id} title={`${meta?.name ?? humanize(id)}: pass mark ${fmtScore(v.threshold)}${meta?.blocking ? ', blocking' : ''}`}>
            <dt className="truncate text-[12px] text-ink-3">{humanize(id)}</dt>
            <dd className="mt-0.5">
              <span className={cn('font-mono text-[12.5px] tabular-nums', tone === 'fail' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>
                {v.status === 'ok' ? fmtScore(v.score) : v.status === 'na' ? 'n/a' : 'not run'}
              </span>
              <span className="sr-only">, pass mark {fmtScore(v.threshold)}</span>
              <span aria-hidden="true" className="relative mt-1 block h-1.5 rounded-full bg-sunken">
                <span
                  className={cn('absolute inset-y-0 left-0 rounded-full', tone === 'fail' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : tone === 'pass' ? 'bg-ok' : 'bg-line-strong')}
                  style={{ width: `${Math.round(v.score * 100)}%` }}
                />
                <span className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink-3" style={{ left: `calc(${Math.round(v.threshold * 100)}% - 1px)` }} />
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function DraftDetails({ draft, label, evidence, lengths = false, badQuote = false }: {
  draft: Draft;
  label: string;
  evidence?: string | null;
  lengths?: boolean;
  badQuote?: boolean;
}) {
  const quotes = evidence ? [{ id: 'evidence', quote: evidence }] : [];
  const hl = (text: string) => <PassageText text={text} quotes={quotes} active="evidence" />;
  return (
    <details className="group mt-2.5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={14} className="transition-transform group-open:rotate-90" />
        {label}
      </summary>
      <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed">
        <p className="font-medium text-ink">{hl(stemOf(draft))}</p>
        {draft.type === 'mcq' && (
          <ol className="space-y-1">
            {draft.options.map((o, i) => (
              <li key={o} className={cn('flex gap-2.5', o === draft.answer ? 'text-ink' : 'text-ink-2')}>
                <span className="font-mono text-[12px] text-ink-3">{LETTERS[i]}</span>
                <span className="min-w-0 flex-1">
                  {hl(o)}
                  {o === draft.answer && <span className="ml-2 text-[11px] font-semibold tracking-wide text-ok uppercase">key</span>}
                </span>
                {lengths && <span className="shrink-0 font-mono text-[11.5px] text-ink-3 tabular-nums">{o.length} chars</span>}
              </li>
            ))}
          </ol>
        )}
        {draft.type === 'true_false' && <p className="text-ink-2">Answer: {draft.answer ? 'true' : 'false'}</p>}
        {draft.type === 'fill_blank' && <p className="text-ink-2">Answer: {draft.answer}</p>}
        {draft.type === 'short_answer' && <p className="text-ink-2">Model answer: {draft.modelAnswer}</p>}
        <p className={cn('text-[13px]', badQuote ? 'text-bad' : 'text-ink-3')}>
          Quote: “{draft.sourceQuote}”{badQuote ? ', not found in the passage' : ''}
        </p>
      </div>
    </details>
  );
}

function fallbackSteps(item: Item, demo: DemoRun): ReactNode[] {
  const g = item.generation;
  const out: ReactNode[] = [
    <Step
      key="write"
      tone={g.fixed.length ? 'warn' : 'ok'}
      icon={g.fixed.length ? warnIcon : okIcon}
      title={g.rounds === 1 ? 'Draft 1 passed every check' : `Passed the checks on draft ${g.rounds}`}
    >
      {g.fixed.map((code) => (
        <p key={code} className="mt-1 text-[13.5px] text-ink-2">Fixed: {demo.checks[code] ?? humanize(code)}</p>
      ))}
    </Step>,
  ];
  if (item.judge?.status === 'ok') {
    out.push(
      <Step key="judge" tone="ok" icon={okIcon} title={`${item.judge.tier === 'full' ? 'Strong judge' : 'Screen judge'} passed ${g.revisedAfterJudge ? 'the rewrite' : 'it'}`}>
        <Scores dims={item.judge.dims} info={demo.dims} />
      </Step>,
    );
  }
  return out;
}

