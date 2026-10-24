import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Passage, SourceDoc } from './schema.ts';
import { pad2, sha, wordCount } from './text.ts';

const MAX_WORDS = 220;
const MIN_WORDS = 60;
const STRAY_WORDS = 15;

interface Block { heading: string | null; text: string }

/** A file path or an http(s) URL → a source document split into citable passages. */
export async function loadSource(input: string): Promise<SourceDoc> {
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input, { headers: { 'user-agent': 'quizforge (+https://github.com/saqlain-489/quizforge)' } });
    if (!res.ok) throw new Error(`could not fetch ${input}: HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('pdf')) return fromPdf(new Uint8Array(await res.arrayBuffer()), input);
    const body = await res.text();
    return type.includes('html') || /^\s*</.test(body) ? fromHtml(body, input) : fromText(body, input);
  }
  const ext = extname(input).toLowerCase();
  if (ext === '.pdf') return fromPdf(new Uint8Array(await readFile(input)), input);
  const body = await readFile(input, 'utf8');
  return ext === '.html' || ext === '.htm' ? fromHtml(body, input) : fromText(body, input);
}

export function fromText(markdown: string, origin: string): SourceDoc {
  const body = markdown.replace(/^﻿?---\n[\s\S]*?\n---\n/, '');
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? titleFromOrigin(origin);
  return buildDoc(title, origin, markdownBlocks(body));
}

export function fromHtml(html: string, origin: string): SourceDoc {
  const doc = fromText(htmlToMarkdown(html), origin);
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  return title ? { ...doc, title } : doc;
}

export async function fromPdf(data: Uint8Array, origin: string): Promise<SourceDoc> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(data, { mergePages: true });
  // PDF text has a newline per printed line; only blank lines are real paragraph breaks.
  const paragraphs = text.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return buildDoc(titleFromOrigin(origin), origin, paragraphs.map((p) => ({ heading: null, text: p })));
}

/* ------------------------------------------------------------------ */

function titleFromOrigin(origin: string): string {
  const name = basename(origin.split('?')[0]).replace(/\.[a-z0-9]+$/i, '');
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled';
}

/** Paragraphs with the heading they sit under. Markdown syntax that a learner would not see is removed. */
function markdownBlocks(md: string): Block[] {
  const out: Block[] = [];
  let heading: string | null = null;
  let para: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = para.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push({ heading, text });
    para = [];
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { para.push(line.trim()); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); heading = cleanInline(h[2]); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) { flush(); continue; }
    para.push(cleanInline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*>\s?/, '')));
  }
  flush();
  return out;
}

function cleanInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function htmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, t: string) => `\n\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, '').trim()}\n\n`)
      .replace(/<(p|div|section|article|li|tr|blockquote|pre)\b[^>]*>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n');
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

/** Sentences of an over-long paragraph, so no passage outgrows what one question can be about. */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+["')\]]?|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function buildDoc(title: string, origin: string, blocks: Block[]): SourceDoc {
  const passages: Passage[] = [];
  let cur: { heading: string | null; parts: string[]; words: number } | null = null;
  const close = () => {
    if (!cur || !cur.words) return;
    const text = cur.parts.join(' ').trim();
    const last = passages[passages.length - 1];
    if (cur.words < STRAY_WORDS && last && last.heading === cur.heading) {
      last.text = `${last.text} ${text}`;
      last.words = wordCount(last.text);
    } else {
      passages.push({ id: '', heading: cur.heading, text, words: cur.words });
    }
    cur = null;
  };
  for (const b of blocks) {
    const pieces = wordCount(b.text) > MAX_WORDS ? sentences(b.text) : [b.text];
    for (const piece of pieces) {
      const w = wordCount(piece);
      const newSection = cur !== null && cur.heading !== b.heading && cur.words >= MIN_WORDS;
      if (cur && (newSection || cur.words + w > MAX_WORDS)) close();
      if (!cur) cur = { heading: b.heading, parts: [], words: 0 };
      cur.parts.push(piece);
      cur.words += w;
    }
  }
  close();
  passages.forEach((p, i) => { p.id = `p${pad2(i + 1)}`; });
  const all = passages.map((p) => p.text).join('\n');
  return { title, origin, hash: sha(all), words: wordCount(all), passages };
}
