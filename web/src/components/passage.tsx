import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { locateQuote, splitMarks, type Mark } from '@/lib/quote';
import type { Passage } from '@/lib/types';

export interface QuoteRef {
  id: string;
  quote: string;
}

export function PassageText({ text, quotes, active, renderEnd }: {
  text: string;
  quotes: readonly QuoteRef[];
  active?: string | null;
  renderEnd?: (ids: string[]) => ReactNode;
}) {
  const marks: Mark<string>[] = quotes.flatMap((q) => {
    const span = locateQuote(text, q.quote);
    return span ? [{ ...span, data: q.id }] : [];
  });
  return (
    <>
      {splitMarks(text, marks).map((seg) => {
        const isActive = active != null && seg.marks.includes(active);
        const ending = renderEnd ? marks.filter((m) => m.end === seg.end && seg.marks.includes(m.data)).map((m) => m.data) : [];
        return (
          <Fragment key={seg.start}>
            {seg.marks.length === 0 ? seg.text : isActive ? (
              <mark className="quote-mark text-ink" data-active="">{seg.text}</mark>
            ) : (
              <span className="cite-mark">{seg.text}</span>
            )}
            {ending.length > 0 && renderEnd?.(ending)}
          </Fragment>
        );
      })}
    </>
  );
}

export function PassageBlock({ passage, quote, idPrefix, bleed = true }: { passage: Passage; quote: string | null; idPrefix: string; bleed?: boolean }) {
  const titleId = `${idPrefix}-${passage.id}`;
  return (
    <section
      aria-labelledby={titleId}
      className={cn('rounded-lg px-3 py-2.5 transition-colors', bleed && '-mx-3', quote && 'bg-accent-soft/70 ring-1 ring-accent-line ring-inset')}
    >
      <h3 id={titleId} className="flex items-baseline gap-2 text-[13px]">
        <span className="font-mono text-[11px] text-ink-3">{passage.id}</span>
        <span className="font-medium text-ink">{passage.heading ?? 'Untitled passage'}</span>
      </h3>
      <p className={cn('mt-1 text-[14px] leading-[1.7]', quote ? 'text-ink' : 'text-ink-2')}>
        <PassageText text={passage.text} quotes={quote ? [{ id: 'quote', quote }] : []} active="quote" />
      </p>
    </section>
  );
}
