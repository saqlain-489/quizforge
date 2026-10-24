import { PassageText } from '@/components/passage';
import { sourceUrl } from '@/lib/demo';
import type { QuizRun } from '@/lib/types';

export function SourceTab({ run, onOpenQuestion }: { run: QuizRun; onOpenQuestion: (index: number) => void }) {
  const { source, quiz } = run;
  const href = sourceUrl(source.origin);
  const number = new Map(quiz.items.map((item, i) => [item.key, i]));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[13px] font-medium text-accent">Source document</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{source.title}</h2>
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          {source.words} words · {source.passages.length} passages
          {href && (
            <>
              {' · '}
              <a className="link font-mono text-[12.5px]" href={href}>{source.origin}</a>
            </>
          )}
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Ingest splits the document into numbered passages. Each question is written from one passage and must quote it word for word.
          Underlined sentences are those quotes; the number after each opens its question.
        </p>
      </header>

      <ol className="space-y-3">
        {source.passages.map((p) => {
          const cites = quiz.items.filter((item) => item.passageId === p.id);
          return (
            <li key={p.id} id={`source-${p.id}`} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{p.id}</span>
                <h3 className="text-[15px] font-semibold text-ink">{p.heading ?? 'Untitled passage'}</h3>
                <span className="ml-auto text-[12px] text-ink-3 tabular-nums">
                  {p.words} words{cites.length ? ` · cited by ${cites.length}` : ''}
                </span>
              </div>
              <p className="mt-2.5 text-[15px] leading-[1.75] text-ink-2">
                <PassageText
                  text={p.text}
                  quotes={cites.map((item) => ({ id: item.key, quote: item.content.sourceQuote }))}
                  renderEnd={(keys) =>
                    keys.map((key) => {
                      const i = number.get(key) ?? 0;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onOpenQuestion(i)}
                          aria-label={`Open question ${i + 1}, which quotes this sentence`}
                          className="relative -top-px ml-1 inline-flex h-5 items-center rounded-md border border-accent-line bg-accent-soft px-1.5 align-middle font-mono text-[11px] font-medium text-accent transition-colors hover:border-accent"
                        >
                          Q{i + 1}
                        </button>
                      );
                    })
                  }
                />
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
