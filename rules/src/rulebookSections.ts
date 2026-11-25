import sectionsJson from '../data/rulebook-sections.json' with { type: 'json' };
import type { Section } from './sections.ts';

/** The rulebook's sections, written by `npm run rulebook:sync`. A test fails if they fall behind the rulebook. */
export const rulebookSections: readonly Section[] = sectionsJson;
