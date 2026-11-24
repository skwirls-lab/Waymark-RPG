// Rewrites the marked lists in Waymark-Rulebook.md from the data files.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { syncRulebook } from '../src/rulebook.ts';

const path = resolve(import.meta.dirname, '../../Waymark-Rulebook.md');
const before = readFileSync(path, 'utf8');
const after = syncRulebook(before);
writeFileSync(path, after);
console.log(
  before === after
    ? 'The rulebook already matches the data.'
    : 'The rulebook was updated from the data.',
);
