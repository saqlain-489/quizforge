import { describe, expect, it } from 'vitest';
import { locateQuote, longestQuotedPrefix, splitMarks } from '@/lib/quote';

const text = 'When nothing has changed, the server replies with 304 Not Modified and no body. Only then is it “fresh” again.';
const slice = (s: string, span: { start: number; end: number } | null) => (span ? s.slice(span.start, span.end) : null);

describe('locateQuote', () => {
  it('finds an exact quote', () => {
    expect(slice(text, locateQuote(text, 'the server replies with 304 Not Modified'))).toBe('the server replies with 304 Not Modified');
  });

  it('tolerates case, spacing and a missing full stop like the pipeline check does', () => {
    expect(slice(text, locateQuote(text, 'WHEN nothing  has changed , the server'))).toBe('When nothing has changed, the server');
    expect(slice(text, locateQuote(text, '304 not modified and no body.'))).toBe('304 Not Modified and no body');
  });

  it('matches straight quotes against curly ones', () => {
    expect(slice(text, locateQuote(text, 'is it "fresh" again'))).toBe('is it “fresh” again');
  });

  it('maps spans back through characters that normalise to several', () => {
    const ligature = 'The ﬁle is cached for a year.';
    expect(slice(ligature, locateQuote(ligature, 'the file is cached'))).toBe('The ﬁle is cached');
  });

  it('returns null for a paraphrase or an empty quote', () => {
    expect(locateQuote(text, 'If nothing changed, the server answers 304')).toBeNull();
    expect(locateQuote(text, '   ')).toBeNull();
  });
});

describe('longestQuotedPrefix', () => {
  it('finds where a misquote stops matching', () => {
    const stem = 'A file named with a hash can be cached for a year, because any change produces a new URL.';
    const hit = longestQuotedPrefix(stem, 'can be cached for a year, because every change');
    expect(hit?.words).toBe(7);
    expect(slice(stem, hit?.span ?? null)).toBe('can be cached for a year, because');
  });

  it('gives up below the minimum number of words', () => {
    expect(longestQuotedPrefix('alpha beta gamma', 'alpha beta delta')).toBeNull();
  });
});

describe('splitMarks', () => {
  it('cuts text into plain and marked segments', () => {
    const segs = splitMarks('aaa bbb ccc', [{ start: 4, end: 7, data: 'q1' }]);
    expect(segs.map((s) => [s.text, s.marks])).toEqual([['aaa ', []], ['bbb', ['q1']], [' ccc', []]]);
  });

  it('lets overlapping marks share the segment they both cover', () => {
    const segs = splitMarks('0123456789', [{ start: 2, end: 6, data: 'a' }, { start: 4, end: 8, data: 'b' }]);
    expect(segs.map((s) => [s.text, s.marks])).toEqual([['01', []], ['23', ['a']], ['45', ['a', 'b']], ['67', ['b']], ['89', []]]);
  });

  it('ignores marks outside the text', () => {
    expect(splitMarks('abc', [{ start: 2, end: 9, data: 'x' }, { start: 1, end: 1, data: 'y' }])).toEqual([{ text: 'abc', start: 0, end: 3, marks: [] }]);
  });
});
