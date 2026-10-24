# quizforge web viewer

A static page for one quizforge run: take the quiz, then see how every question was planned, written, checked and judged. It renders `examples/out/*.quiz.json` at build time, so the page makes no network calls and needs no API key.

Next.js (App Router, static export), strict TypeScript, Tailwind CSS v4, Vitest.

## Dev

The viewer imports the pipeline's types and re-runs the bundled replay at build time, so install the repo root first. Node 22.

```sh
npm ci                  # repo root
cd web && npm ci
npm run dev             # http://localhost:3000
```

`npm run sync-data` runs before `dev`, `build` and `test`. It replays each example in `examples/replay/` through the real pipeline (with the root's `tsx`), records every agent call, checks the result still matches the saved quiz, and writes `src/data/runs.ts`. If the pipeline changes and the example goes stale, it fails and asks you to run `npm run demo` in the root.

## Test and build

```sh
npm test                # grading, quote matching, quiz state, bundled data
npm run typecheck
npm run build           # static site in out/
```

## Deploy

`.github/workflows/pages.yml` runs on every push to `main`: it installs both packages, runs the tests, builds with `PAGES_BASE_PATH=/quizforge` and publishes `out/` to GitHub Pages. Turn it on once under Settings, Pages, Source: GitHub Actions.

To check the Pages build locally: `PAGES_BASE_PATH=/quizforge npm run build`.

## Screenshots

```sh
npm run build
PUPPETEER_FROM=/any/folder/with/puppeteer npm run screenshots
```

This serves `out/` on a local port and writes `docs/screenshots/*.png`. `PUPPETEER_FROM` is any folder whose `node_modules` has `puppeteer`, so this package does not have to install a browser.
