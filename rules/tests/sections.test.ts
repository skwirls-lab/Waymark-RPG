import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  relevantSections,
  rulebookSections,
  slugify,
  splitSections,
  titleCase,
} from '../src/index.ts';

const rulebook = readFileSync(resolve(import.meta.dirname, '../../Waymark-Rulebook.md'), 'utf8');

describe('the rulebook in sections', () => {
  it('the stored sections match the rulebook as it is now', () => {
    expect(rulebookSections).toEqual(splitSections(rulebook));
  });

  it('covers every part of the book, and leaves out the title page', () => {
    const chapters = [...new Set(rulebookSections.map((s) => s.chapter))];
    expect(chapters).toEqual([
      'Introduction',
      'How the Game Is Played',
      'Making a Character',
      'Adventure and Danger',
      'Abilities',
      'Growing and Changing',
      "The Warden's World",
      'Reference',
    ]);
    expect(rulebookSections.every((s) => s.text.length > 40)).toBe(true);
  });

  it('gives each section an id and the address of its place on the rules site', () => {
    const fighting = rulebookSections.find((s) => s.title === 'Fighting')!;
    expect(fighting.id).toBe('adventure-and-danger/fighting');
    expect(fighting.path).toBe('/rules/adventure-and-danger/#fighting');
    expect(new Set(rulebookSections.map((s) => s.id)).size).toBe(rulebookSections.length);
  });

  it('numbers a repeated heading within a chapter, as the site does', () => {
    const sections = splitSections(
      '# T\n# ONE\n## Same\na\n## Same\nb\n# PART TWO: OTHER THINGS\n## Same\nc',
    );
    expect(sections.map((s) => s.id)).toEqual(['one/same', 'one/same-2', 'other-things/same']);
  });

  it('ignores headings inside code blocks, and strips markers and rules', () => {
    const sections = splitSections(
      '# T\n# ONE\n## Real\ntext\n```\n## Not a heading\n```\n<!-- data:x -->\nmore\n\n---\n',
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.text).toBe('text\n```\n## Not a heading\n```\n\nmore');
  });

  it('writes titles and addresses the way the site does', () => {
    expect(titleCase("THE WARDEN'S WORLD")).toBe("The Warden's World");
    expect(titleCase('HOW THE GAME IS PLAYED')).toBe('How the Game Is Played');
    expect(slugify("The Warden's World")).toBe('the-wardens-world');
    expect(slugify('Step 5: <em>Affinity</em> &amp; Abilities')).toBe('step-5-affinity-abilities');
  });
});

describe('finding the sections that answer a question', () => {
  const top = (question: string) => relevantSections(question, rulebookSections).map((s) => s.id);

  it('finds fighting for a question about who goes first', () => {
    expect(top('Who goes first in a fight?')).toContain('adventure-and-danger/fighting');
  });

  it('finds the right place for a spread of questions', () => {
    expect(top('How many inventory slots do I have?')[0]).toMatch(
      /making-a-character|adventure-and-danger/,
    );
    const morale = relevantSections('When do enemies check morale?', rulebookSections);
    expect(morale.some((s) => /morale/i.test(s.text))).toBe(true);
    expect(top('How does corruption spread?').join(' ')).toMatch(/corruption/);
    expect(top('What is a Scar?')).toContain('adventure-and-danger/getting-hurt');
  });

  it('returns at most the number asked for, best first', () => {
    expect(relevantSections('save', rulebookSections, 3)).toHaveLength(3);
    expect(relevantSections('saves', rulebookSections, 1)[0]!.title).toBe('Saves');
  });

  it('returns nothing for a question with no words in it, or none the book uses', () => {
    expect(relevantSections('the of and', rulebookSections)).toEqual([]);
    expect(relevantSections('???', rulebookSections)).toEqual([]);
    expect(relevantSections('zeppelin xylophone', rulebookSections)).toEqual([]);
  });
});
