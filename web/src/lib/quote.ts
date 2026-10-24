export interface Span {
  start: number;
  end: number;
}

interface Folded {
  text: string;
  /** folded index → index in the original string */
  map: number[];
}

// Same tolerance as the pipeline's quote check: case, curly quotes, dashes and spacing.
function fold(s: string): Folded {
  let text = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    for (let c of ch.normalize('NFKC').toLowerCase()) {
      if (/['"‘-‟`´]/.test(c)) continue;
      if (/[‐-―−]/.test(c)) c = '-';
      if (/\s/.test(c)) {
        if (text.length === 0 || text.endsWith(' ')) continue;
        c = ' ';
      } else if (/[.,;:!?]/.test(c) && text.endsWith(' ')) {
        text = text.slice(0, -1);
        map.pop();
      }
      text += c;
      map.push(i);
    }
    i += ch.length;
  }
  return { text, map };
}

export function locateQuote(text: string, quote: string): Span | null {
  const q = quote.trim();
  if (!q) return null;
  const exact = text.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length };

  const hay = fold(text);
  const needle = fold(q).text.replace(/[.\s]+$/, '');
  const at = needle ? hay.text.indexOf(needle) : -1;
  if (at < 0) return null;
  const start = hay.map[at];
  const last = hay.map[at + needle.length - 1];
  if (start === undefined || last === undefined) return null;
  const end = last + (text.codePointAt(last)! > 0xffff ? 2 : 1);
  return { start, end };
}

export function longestQuotedPrefix(text: string, quote: string, minWords = 3): { span: Span; words: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  for (let n = words.length; n >= minWords; n--) {
    const span = locateQuote(text, words.slice(0, n).join(' '));
    if (span) return { span, words: n };
  }
  return null;
}

export interface Mark<T> extends Span {
  data: T;
}

export interface Segment<T> {
  text: string;
  start: number;
  end: number;
  marks: T[];
}

// Overlapping marks share the segments they both cover.
export function splitMarks<T>(text: string, marks: readonly Mark<T>[]): Segment<T>[] {
  const valid = marks.filter((m) => m.start >= 0 && m.end <= text.length && m.start < m.end);
  const cuts = [...new Set([0, text.length, ...valid.flatMap((m) => [m.start, m.end])])].sort((a, b) => a - b);
  const out: Segment<T>[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const start = cuts[k]!;
    const end = cuts[k + 1]!;
    out.push({ text: text.slice(start, end), start, end, marks: valid.filter((m) => m.start <= start && m.end >= end).map((m) => m.data) });
  }
  return out;
}
