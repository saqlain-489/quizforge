import { checkItem, CHECKS } from '../src/checks/index.ts';
import { CASES } from './cases.ts';

/**
 * Scores the deterministic checker against the benchmark and exits non-zero
 * if it misses a planted defect or flags a clean item. CI runs this on every
 * change, so a detector cannot get noisier or blinder without a red build.
 */
const tally = new Map<string, { tp: number; fp: number; fn: number }>(CHECKS.map((c) => [c.code, { tp: 0, fp: 0, fn: 0 }]));
const failures: string[] = [];

for (const c of CASES) {
  const got = new Set(checkItem(c.item, c.passage).map((d) => d.code));
  const want = new Set(c.expect);
  for (const code of new Set([...got, ...want])) {
    const t = tally.get(code) ?? { tp: 0, fp: 0, fn: 0 };
    if (got.has(code) && want.has(code)) t.tp++;
    else if (got.has(code)) { t.fp++; failures.push(`${c.id}: unexpected ${code}`); }
    else { t.fn++; failures.push(`${c.id}: missed ${code}`); }
    tally.set(code, t);
  }
}

const rows = [...tally].filter(([, t]) => t.tp + t.fp + t.fn > 0);
const sum = rows.reduce((a, [, t]) => ({ tp: a.tp + t.tp, fp: a.fp + t.fp, fn: a.fn + t.fn }), { tp: 0, fp: 0, fn: 0 });
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');

console.log(`Checker benchmark: ${CASES.length} cases (${CASES.filter((c) => !c.expect.length).length} clean), ${rows.length} detectors exercised\n`);
console.log('detector'.padEnd(32), 'caught', 'missed', 'false+');
for (const [code, t] of rows) console.log(code.padEnd(32), String(t.tp).padStart(6), String(t.fn).padStart(6), String(t.fp).padStart(6));
console.log(`\nprecision ${pct(sum.tp, sum.tp + sum.fp)} · recall ${pct(sum.tp, sum.tp + sum.fn)}`);
const untested = CHECKS.filter((c) => !rows.some(([code]) => code === c.code)).map((c) => c.code);
if (untested.length) console.log(`no case exercises: ${untested.join(', ')}`);

if (failures.length || untested.length) {
  console.error(`\nGate failed:\n${[...failures, ...untested.map((u) => `${u}: no benchmark case`)].map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('Gate passed: every planted defect caught, no clean item flagged.');
