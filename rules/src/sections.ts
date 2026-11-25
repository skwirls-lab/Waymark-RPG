/**
 * The rulebook cut into its sections, so that an answer to a rules question
 * can quote the right part and link to it on the rules site. The site builds
 * its page addresses the same way; its build fails if they ever differ.
 */

export interface Section {
  /** Chapter and section, for example `adventure-and-danger/fighting`. */
  id: string;
  chapter: string;
  title: string;
  /** The page on the rules site, and the place on it. */
  path: string;
  text: string;
}

const SMALL = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'or']);

export const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Splits the rulebook at its `#` chapters and `##` sections. The title page is left out. */
export function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let chapter: { title: string; slug: string } | null = null;
  let current: Section | null = null;
  let chapters = 0;
  let inFence = false;
  const used = new Set<string>();
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const h1 = !inFence && /^# (.+)$/.exec(line);
    const h2 = !inFence && /^## (.+)$/.exec(line);
    if (h1) {
      chapters += 1;
      const title = titleCase(h1[1]!.trim().replace(/^PART \w+:\s*/, ''));
      chapter = chapters === 1 ? null : { title, slug: slugify(title) };
      current = null;
      used.clear();
    } else if (h2 && chapter) {
      const title = h2[1]!.trim().replace(/[*_`]/g, '');
      let anchor = slugify(title);
      while (used.has(anchor)) anchor += '-2';
      used.add(anchor);
      current = {
        id: `${chapter.slug}/${anchor}`,
        chapter: chapter.title,
        title,
        path: `/rules/${chapter.slug}/#${anchor}`,
        text: '',
      };
      sections.push(current);
    } else if (current) {
      current.text += `${line}\n`;
    }
  }
  return sections.map((s) => ({
    ...s,
    text: s.text
      .replace(/<!--.*?-->/g, '')
      .replace(/\n---\s*$/, '')
      .trim(),
  }));
}

const STOP = new Set(
  'a an and are as at be but by can do does for from how i if in is it my of on or so that the then there this to was what when which who will with you your'.split(
    ' ',
  ),
);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    // "saves" and "save", "fighting" and "fight" should meet.
    .map((w) => w.replace(/(ing|ed|es|s)$/, ''));

/**
 * The sections most likely to answer a question: those that share the most
 * of its words, counting a word in the title for more.
 */
export function relevantSections(
  question: string,
  sections: readonly Section[],
  count = 5,
): Section[] {
  const asked = new Set(words(question));
  if (asked.size === 0) return [];
  return sections
    .map((section, index) => {
      const title = new Set(words(section.title));
      const body = words(section.text);
      let score = 0;
      for (const word of asked) {
        if (title.has(word)) score += 5;
        const hits = body.filter((w) => w === word).length;
        // Many mentions count for more, but with less and less each time.
        if (hits > 0) score += 1 + Math.log2(hits);
      }
      return { section, index, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((s) => s.section);
}
