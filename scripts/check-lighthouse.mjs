// Fails if the Lighthouse report at the given path scores below 90 for
// performance or accessibility. Used by CI after each deploy.
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const MINIMUM = 90;
let ok = true;
for (const key of ['performance', 'accessibility']) {
  const score = Math.round(report.categories[key].score * 100);
  console.log(`${key}: ${score}`);
  if (score < MINIMUM) ok = false;
}
if (!ok) {
  console.error(`A Lighthouse score is below ${MINIMUM}.`);
  process.exit(1);
}
