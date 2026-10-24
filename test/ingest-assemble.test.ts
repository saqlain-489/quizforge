import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerSlotFor, balanceAnswerPosition, rotateOptionsTo } from '../src/assemble.ts';
import { fromHtml, fromText, loadSource } from '../src/ingest.ts';
import { containsVerbatim, norm } from '../src/text.ts';

test('markdown splits into passages under their headings, with markup removed', () => {
  const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
  const md = `---\ntitle: front matter\n---\n# Guide\n\n## First\n\n${para(70)}\n\n## Second\n\nUse **bold** and \`code\` and [a link](https://x.y).\n\n${para(65)}`;
  const doc = fromText(md, 'guide.md');
  assert.equal(doc.title, 'Guide');
  assert.deepEqual(doc.passages.map((p) => [p.id, p.heading]), [['p01', 'First'], ['p02', 'Second']]);
  assert.match(doc.passages[1].text, /^Use bold and code and a link\./);
  assert.ok(!doc.passages.some((p) => /front matter/.test(p.text)));
});

test('an over-long paragraph is split at sentence ends', () => {
  const sentence = (i: number) => `Sentence ${i} has exactly eight words in it.`;
  const doc = fromText(Array.from({ length: 60 }, (_, i) => sentence(i)).join(' '), 'long.txt');
  assert.ok(doc.passages.length >= 2);
  assert.ok(doc.passages.every((p) => p.words <= 220));
});

test('html: scripts and navigation are dropped, headings and entities survive', () => {
  const body = 'Caches keep copies of responses so repeat requests are fast. '.repeat(8);
  const doc = fromHtml(`<html><title>Caching &amp; you</title><nav>Home | About</nav><script>alert(1)</script><h2>Basics</h2><p>${body}</p></html>`, 'https://example.com/a');
  assert.equal(doc.title, 'Caching & you');
  assert.equal(doc.passages[0].heading, 'Basics');
  assert.ok(!/alert|Home \| About/.test(doc.passages.map((p) => p.text).join(' ')));
});

test('the bundled example splits into its eight sections', async () => {
  const doc = await loadSource('examples/sources/http-caching.md');
  assert.equal(doc.passages.length, 8);
  assert.equal(doc.passages[3].heading, 'Validation and conditional requests');
});

test('verbatim matching ignores case, curly quotes, dashes and spacing only', () => {
  assert.ok(containsVerbatim('The cache’s copy — fresh again.', `the cache's copy - fresh   AGAIN`));
  assert.ok(!containsVerbatim('The cache marks its copy fresh again.', 'The cache marks the copy fresh again.'));
  assert.equal(norm('  A “B”  '), 'a "b"');
});

test('answer rotation is deterministic, idempotent and keeps option order', () => {
  assert.equal(answerSlotFor('What does s-maxage do?', 4), answerSlotFor('What does s-maxage do?', 4));
  assert.deepEqual(rotateOptionsTo(['a', 'b', 'c', 'd'], 0, 2), ['c', 'd', 'a', 'b']);
  const d = { question: 'What does s-maxage do?', options: ['key', 'w1', 'w2', 'w3'], answer: 'key', explanation: '', sourceQuote: '' };
  const once = balanceAnswerPosition(d);
  assert.equal(once.options.indexOf('key'), answerSlotFor(d.question, 4));
  assert.deepEqual(balanceAnswerPosition(once), once);
});
