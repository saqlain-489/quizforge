'use client';

import { useEffect, useRef } from 'react';
import { PassageBlock } from '@/components/passage';
import { cn } from '@/lib/cn';
import type { QuizRun } from '@/lib/types';

export interface Highlight {
  passageId: string;
  quote: string;
}

export function SourcePanel({ doc, highlight, className }: { doc: QuizRun['source']; highlight: Highlight | null; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const active = highlight ? doc.passages.find((p) => p.id === highlight.passageId) : undefined;

  useEffect(() => {
    const box = scroller.current;
    const mark = box?.querySelector<HTMLElement>('mark[data-active]');
    if (!box || !mark) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const b = box.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    // Centre the mark in the part of the panel on screen; scrollIntoView would also move the page.
    const middle = (Math.max(b.top, 0) + Math.min(b.bottom, window.innerHeight)) / 2;
    box.scrollBy({ top: m.top + m.height / 2 - middle, behavior: reduce ? 'auto' : 'smooth' });
  }, [highlight]);

  return (
    <aside aria-labelledby="source-panel-title" className={cn('card flex-col overflow-hidden lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)]', className)}>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 id="source-panel-title" className="text-sm font-semibold">Source</h2>
          <p className="truncate text-xs text-ink-3">{doc.title}</p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs text-ink-3 tabular-nums">
          {doc.passages.length} passages · {doc.words} words
        </p>
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="Source passages"
        tabIndex={0}
        className="scroll-fade flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 py-4 focus-visible:-outline-offset-2"
      >
        {!highlight && (
          <p className="mb-3 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[13px] leading-5 text-ink-3">
            Check an answer, then open its quote to see the exact sentence it was written from.
          </p>
        )}
        {doc.passages.map((p) => (
          <PassageBlock key={p.id} idPrefix="panel" passage={p} quote={p.id === highlight?.passageId ? highlight.quote : null} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {active ? `Quote highlighted in passage ${active.id}${active.heading ? `, ${active.heading}` : ''}.` : ''}
      </p>
    </aside>
  );
}
