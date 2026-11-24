import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blocks, compareRulebook, syncRulebook } from '../src/index.ts';

const rulebook = readFileSync(resolve(import.meta.dirname, '../../Waymark-Rulebook.md'), 'utf8');

describe('the rulebook and the data are one source', () => {
  const compared = compareRulebook(rulebook);

  it('marks every list the data can produce', () => {
    expect(compared.map((b) => b.name).sort()).toEqual(Object.keys(blocks).sort());
  });

  for (const block of compared) {
    it(`the "${block.name}" list in the rulebook matches the data`, () => {
      expect(block.current).toBe(block.expected);
    });
  }

  it('syncing an up-to-date rulebook changes nothing', () => {
    expect(syncRulebook(rulebook)).toBe(rulebook);
  });

  it('syncing repairs a list that was edited by hand', () => {
    const edited = rulebook
      .replace('| **Mend.**', '| **Mend.**')
      .replace('- **Mend.** Touch', '- **Mend.** Poke');
    expect(edited).not.toBe(rulebook);
    expect(syncRulebook(edited)).toBe(rulebook);
  });

  it('refuses a marked block that nothing produces', () => {
    const broken = '<!-- data:nonsense -->\n\nx\n\n<!-- /data:nonsense -->';
    expect(() => compareRulebook(broken)).toThrow(/no generator/);
    expect(() => syncRulebook(broken)).toThrow(/no generator/);
  });
});
