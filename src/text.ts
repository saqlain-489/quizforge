import { createHash } from 'node:crypto';

/** Lower-cased, quote-and-dash-folded, single-spaced: the form two texts are compared in. */
export function norm(s: string): string {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** norm() plus quotes removed, for "is this quote really in the text" checks. */
export function loose(s: string): string {
  return norm(s).replace(/["']/g, '').replace(/\s*([.,;:!?])/g, '$1');
}

/** True when `needle` appears word for word in `haystack`, ignoring case, quotes, dashes and spacing. */
export function containsVerbatim(haystack: string, needle: string): boolean {
  const n = loose(needle).replace(/[.\s]+$/, '');
  return n.length > 0 && loose(haystack).includes(n);
}

export function wordCount(s: string): number {
  return String(s ?? '').split(/\s+/).filter(Boolean).length;
}

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

export const pad2 = (n: number): string => String(n).padStart(2, '0');
