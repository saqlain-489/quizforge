import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(WEB, 'out');
const SHOTS = join(WEB, '..', 'docs', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.json': 'application/json', '.ico': 'image/x-icon' };

if (!existsSync(join(OUT, 'index.html'))) throw new Error('out/index.html is missing: run `npm run build` without PAGES_BASE_PATH first');

// PUPPETEER_FROM points at any folder whose node_modules has puppeteer, so this repo does not need to install a browser.
const puppeteer = createRequire(join(process.env.PUPPETEER_FROM ?? WEB, 'package.json'))('puppeteer');

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  let file = join(OUT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(OUT, '404.html');
  res.writeHead(file.endsWith('404.html') && !path.endsWith('404.html') ? 404 : 200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--font-render-hinting=none'] });

async function open({ width, height, dark = false, hash = '' }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.goto(`${base}${hash}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function clickText(page, selector, text) {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.includes(t) && e.getClientRects().length > 0);
    el?.click();
    return Boolean(el);
  }, selector, text);
  if (!ok) throw new Error(`nothing to click: ${selector} containing "${text}"`);
}

async function answerFirstQuestion(page) {
  await clickText(page, '[role=radiogroup] label', 'serves the same stored response');
  await clickText(page, 'button[type=submit]', 'Check answer');
  await clickText(page, 'button[aria-pressed]', 'Source quote');
  await new Promise((r) => setTimeout(r, 150));
}

async function shot(page, name, options = {}) {
  await page.screenshot({ path: join(SHOTS, name), ...options });
  console.log(`saved docs/screenshots/${name}`);
}

try {
  for (const dark of [false, true]) {
    const page = await open({ width: 1440, height: 900, dark });
    await answerFirstQuestion(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, dark ? 'quiz-dark.png' : 'quiz.png');
    await page.close();
  }

  const how = await open({ width: 1440, height: 900, hash: '#how-it-was-made' });
  await clickText(how, '[aria-label="Show questions"] button', 'Rewritten after the judge');
  await how.evaluate(() => document.querySelectorAll('#trace-q06 details').forEach((d) => d.setAttribute('open', '')));
  const clip = await how.evaluate(() => {
    const top = document.getElementById('pipeline-title')?.closest('section')?.getBoundingClientRect().top ?? 0;
    const bottom = document.getElementById('trace-q06')?.getBoundingClientRect().bottom ?? 0;
    return { x: 0, y: window.scrollY + top - 20, width: window.innerWidth, height: bottom - top + 60 };
  });
  await shot(how, 'how-it-was-made.png', { clip, captureBeyondViewport: true });
  await how.close();

  const mobile = await open({ width: 390, height: 844 });
  await clickText(mobile, 'nav[aria-label=Questions] button', '5');
  await mobile.type('input[aria-label="The missing word or phrase"]', 'if-none-match');
  await mobile.keyboard.press('Enter');
  await clickText(mobile, 'button[aria-pressed]', 'Source quote');
  const phone = await mobile.evaluate(() => {
    const top = document.querySelector('[role=tablist]')?.getBoundingClientRect().top ?? 0;
    const bottom = document.querySelector('#panel-quiz article')?.getBoundingClientRect().bottom ?? 0;
    return { x: 0, y: window.scrollY + top, width: window.innerWidth, height: bottom - top + 16 };
  });
  await shot(mobile, 'mobile.png', { clip: phone, captureBeyondViewport: true });
  await mobile.close();
} finally {
  await browser.close();
  server.close();
}
