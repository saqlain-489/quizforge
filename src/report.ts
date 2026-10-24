import type { Item, QuizRun } from './schema.ts';

const LETTERS = 'ABCDEFGH';

function questionLines(i: Item, n: number): string[] {
  const head = `**${n}.** `;
  const c = i.content;
  switch (c.type) {
    case 'mcq': return [`${head}${c.question}`, '', ...c.options.map((o, k) => `   ${LETTERS[k]}. ${o}`)];
    case 'true_false': return [`${head}True or false: ${c.statement}`];
    case 'fill_blank': return [`${head}${c.sentence}`];
    case 'short_answer': return [`${head}${c.question}`];
  }
}

function answerLine(i: Item, n: number): string {
  const c = i.content;
  const quote = `> "${c.sourceQuote}" (${i.passageId})`;
  switch (c.type) {
    case 'mcq': return `${n}. **${LETTERS[c.options.indexOf(c.answer)]}**: ${c.answer}. ${c.explanation}\n${quote}`;
    case 'true_false': return `${n}. **${c.answer ? 'True' : 'False'}**. ${c.explanation}\n${quote}`;
    case 'fill_blank': return `${n}. **${c.answer}**${c.alternatives.length ? ` (also: ${c.alternatives.join(', ')})` : ''}. ${c.explanation}\n${quote}`;
    case 'short_answer': return `${n}. ${c.modelAnswer}\n   Rubric: ${c.rubric.join('; ')}\n${quote}`;
  }
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function summaryLines(run: QuizRun): string[] {
  const r = run.report;
  const roles = Object.entries(r.byRole).map(([role, v]) => `${role} ${v.calls}`).join(', ');
  return [
    `Planned ${r.planned}, delivered ${r.delivered}${r.dropped.length ? `, dropped ${r.dropped.length}` : ''}.`,
    `${n(r.firstTry, 'item', 'items')} passed every check on the first try; ${n(r.fixedByRetry, 'was', 'were')} fixed by a retry with the checker's feedback; ${n(r.revisedAfterJudge, 'was', 'were')} rewritten after review.`,
    `Judge: ${r.judge.graded} graded, ${n(r.judge.escalations, 'escalation', 'escalations')} to the strong model, ${r.judge.notRun} not run.`,
    `Model calls: ${roles || 'none'}. ${r.mode === 'replay' ? 'Replay run: scripted model replies, no cost.' : `Cost: $${r.costUsd.toFixed(4)}.`}`,
  ];
}

export function toMarkdown(run: QuizRun): string {
  const r = run.report;
  return [
    `# ${run.quiz.title}`,
    '',
    `From "${run.source.title}" (${r.source.words} words, ${r.source.passages} passages). Generated ${r.startedAt.slice(0, 10)} by quizforge.`,
    '',
    '## Questions',
    '',
    ...run.quiz.items.flatMap((i, n) => [...questionLines(i, n + 1), '']),
    '## Answer key',
    '',
    ...run.quiz.items.map((i, n) => answerLine(i, n + 1)),
    '',
    '## Run report',
    '',
    ...summaryLines(run).map((l) => `- ${l}`),
    ...(r.dropped.length ? ['', 'Dropped:', ...r.dropped.map((d) => `- ${d.key}: ${d.reason}`)] : []),
    ...(r.warnings.length ? ['', 'Warnings:', ...r.warnings.map((w) => `- ${w}`)] : []),
    '',
  ].join('\n');
}
