import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as rules from '../src/index.ts';

const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const sections = read('../../Waymark-Rulebook.md')
  .split('\n')
  .filter((line) => line.startsWith('## '))
  .map((line) => line.slice(3).trim());
const coverage = read('../COVERAGE.md');

describe('rules/COVERAGE.md', () => {
  it('has a row for every section of the rulebook', () => {
    const missing = sections.filter((section) => !coverage.includes(`| ${section} |`));
    expect(missing).toEqual([]);
  });

  it('names only functions and constants that exist', () => {
    const named = [...coverage.matchAll(/`([A-Za-z_]+)`(?! \(types)/g)].map((m) => m[1]!);
    const types = new Set(['AttributeKey', 'Score', 'Band', 'AbilityCost', 'Character']);
    const unknown = named.filter((name) => !types.has(name) && !(name in rules));
    expect(unknown).toEqual([]);
  });
});
