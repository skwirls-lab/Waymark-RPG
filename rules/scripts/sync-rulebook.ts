// Rewrites the marked lists in Waymark-Rulebook.md from the data files.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { syncRulebook } from '../src/rulebook.ts';
import { splitSections } from '../src/sections.ts';

const path = resolve(import.meta.dirname, '../../Waymark-Rulebook.md');
const before = readFileSync(path, 'utf8');
const after = syncRulebook(before);
writeFileSync(path, after);
console.log(
  before === after
    ? 'The rulebook already matches the data.'
    : 'The rulebook was updated from the data.',
);

// The rulebook's sections, for answering rules questions with a link.
const sectionsPath = resolve(import.meta.dirname, '../data/rulebook-sections.json');
writeFileSync(sectionsPath, `${JSON.stringify(splitSections(after), null, 2)}\n`);
console.log('Wrote the rulebook sections.');
