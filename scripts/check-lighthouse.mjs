// Runs Lighthouse several times against a page and fails if the median score
// is below 90 for performance or accessibility. Used by CI after each deploy.
// A single run on a shared CI machine varies too much to be a fair gate.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const url = process.argv[2];
const RUNS = 3;
const MINIMUM = 90;
const METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'speed-index',
];

const reports = [];
for (let run = 1; run <= RUNS; run++) {
  execFileSync(
    'npx',
    [
      '--yes',
      'lighthouse@12',
      url,
      '--only-categories=performance,accessibility',
      '--form-factor=mobile',
      '--output=json',
      '--output-path=lighthouse.json',
      '--quiet',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { stdio: 'inherit' },
  );
  const report = JSON.parse(readFileSync('lighthouse.json', 'utf8'));
  reports.push(report);
  const scores = ['performance', 'accessibility'].map(
    (k) => `${k} ${Math.round(report.categories[k].score * 100)}`,
  );
  console.log(
    `run ${run}: ${scores.join(', ')} | ${METRICS.map((m) => `${m} ${report.audits[m]?.displayValue}`).join(', ')}`,
  );
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let ok = true;
for (const key of ['performance', 'accessibility']) {
  const score = median(reports.map((r) => Math.round(r.categories[key].score * 100)));
  console.log(`${key} (median of ${RUNS}): ${score}`);
  if (score < MINIMUM) ok = false;
}
if (!ok) {
  console.error(`A median Lighthouse score is below ${MINIMUM}.`);
  process.exit(1);
}
