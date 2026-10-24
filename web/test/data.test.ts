import { describe, expect, it } from 'vitest';
import { runs } from '@/data/runs';
import { demoRun } from '@/lib/demo';
import { locateQuote } from '@/lib/quote';
import { badgesFor, type Badge } from '@/lib/story';

const demo = demoRun();
const { run } = demo;

describe('the bundled demo run', () => {
  it('is the replay the page promises', () => {
    expect(run.report.mode).toBe('replay');
    expect(run.quiz.items.length).toBe(run.report.delivered);
  });

  it('can highlight every source quote inside its own passage', () => {
    for (const item of run.quiz.items) {
      const passage = run.source.passages.find((p) => p.id === item.passageId);
      expect(passage, item.key).toBeDefined();
      expect(locateQuote(passage!.text, item.content.sourceQuote), item.key).not.toBeNull();
    }
  });

  it('labels each question the same way the run report counts it', () => {
    const badges = run.quiz.items.map((item) => badgesFor(item, demo.traces[item.key] ?? []));
    const count = (b: Badge) => badges.filter((list) => list.includes(b)).length;
    expect(count('first_try')).toBe(run.report.firstTry);
    expect(count('fixed')).toBe(run.report.fixedByRetry);
    expect(count('rewritten')).toBe(run.report.revisedAfterJudge);
  });

  it('has a recorded trace for every question that matches its generation record', () => {
    for (const item of run.quiz.items) {
      const events = demo.traces[item.key] ?? [];
      const writes = events.filter((e) => e.kind === 'write');
      expect(writes.length, item.key).toBe(item.generation.rounds);
      const caught = new Set(writes.flatMap((e) => (e.kind === 'write' ? e.defects.map((d) => d.code) : [])));
      for (const code of item.generation.fixed) expect(caught.has(code), `${item.key} ${code}`).toBe(true);
    }
    const escalations = Object.values(demo.traces).flat().filter((e) => e.kind === 'judge' && e.role === 'judge_full').length;
    expect(escalations).toBe(run.report.judge.escalations);
  });

  it('describes every defect code and judge dimension it shows', () => {
    const codes = Object.values(demo.traces).flat().flatMap((e) => (e.kind === 'write' ? e.defects.map((d) => d.code) : []));
    for (const code of codes) expect(demo.checks[code], code).toBeTruthy();
    const dims = run.quiz.items.flatMap((i) => Object.keys(i.judge?.dims ?? {}));
    for (const id of dims) expect(demo.dims[id]?.name, id).toBeTruthy();
  });

  it('ships no local file paths', () => {
    expect(JSON.stringify(runs)).not.toMatch(/\/(home|Users)\/|[A-Z]:\\\\/);
  });
});
