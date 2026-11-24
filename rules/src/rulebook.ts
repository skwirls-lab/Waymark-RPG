import { data } from './data.ts';

/**
 * Produces the rulebook's lists from the data files, in the rulebook's own
 * Markdown. `Waymark-Rulebook.md` carries the output between
 * `<!-- data:name -->` markers; a test fails if the two ever differ.
 */

const table = (header: string[], rows: (string | number)[][]): string =>
  [header, header.map(() => '---'), ...rows]
    .map((cells, i) =>
      // An empty cell is written `| |`, not `|  |`.
      i === 1 ? `|${cells.join('|')}|` : `| ${cells.join(' | ')} |`.replace(/\| {2}(?=\|)/g, '| '),
    )
    .join('\n');

const GENRES = ['A fantasy world', 'A modern world', 'A science-fiction world'];

export const blocks: Record<string, () => string> = {
  backgrounds: () =>
    table(
      ['d20', ...GENRES],
      data.backgrounds.fantasy.map((_, i) => [
        i + 1,
        data.backgrounds.fantasy[i]!,
        data.backgrounds.modern[i]!,
        data.backgrounds.scifi[i]!,
      ]),
    ),
  names: () =>
    table(GENRES, [
      [data.names.fantasy.join(', '), data.names.modern.join(', '), data.names.scifi.join(', ')],
    ]),
  origins: () =>
    table(
      ['Origin', 'Bonus', 'Trait', 'Starting kit'],
      data.origins.map((o) => [
        `**${o.name}** (${o.examples})`,
        `+${o.bonus.amount} ${o.bonus.attribute.toUpperCase()}`,
        o.drawback ? `${o.trait} *Drawback:* ${o.drawback}` : o.trait,
        o.kitText,
      ]),
    ),
  'starting-kit': () =>
    table(
      ['d6', 'Weapon', 'Armor', 'Tools'],
      data.startingKit.map((r) => [r.roll, r.weapon, r.armor, r.tools]),
    ),
  weapons: () =>
    table(
      ['Kind of weapon', 'Damage', 'Slots', 'Cost'],
      data.weapons.map((w) => [
        `**${w.name}.**${w.description ? ` ${w.description}` : ''}`,
        `d${w.damage}`,
        w.slots === 0 ? 'none' : w.slots === 2 ? '2 (bulky)' : '1',
        w.cost ?? '—',
      ]),
    ),
  'weapon-examples': () =>
    table(
      ['Kind', 'Fantasy', 'Modern', 'Science fiction'],
      data.weapons
        .filter((w) => w.examples)
        .map((w) => [w.name, w.examples!.fantasy, w.examples!.modern, w.examples!.scifi]),
    ),
  armor: () =>
    table(
      ['Kind of armor', 'Armor', 'Slots', 'Cost', 'Examples'],
      data.armor.map((a) => [
        `**${a.name}**`,
        `${a.stacks ? '+' : ''}${a.armor}`,
        a.slotsText,
        a.cost,
        a.examples,
      ]),
    ),
  tools: () =>
    table(
      ['Item', 'Cost', 'Item', 'Cost'],
      Array.from({ length: data.tools.length / 2 }, (_, i) => {
        const [left, right] = [data.tools[i * 2]!, data.tools[i * 2 + 1]!];
        return [left.name, left.cost, right.name, right.cost];
      }),
    ),
  'affinity-summary': () =>
    table(
      ['Affinity', 'What it is about', 'A character with it might be...'],
      data.affinities.map((a) => [`**${a.name}**`, a.about, a.suits]),
    ),
  affinities: () =>
    data.affinities
      .map((a) =>
        [
          `### ${a.name}: ${a.heading}`,
          '',
          ...a.abilities.map((b) => `- **${b.name}.** ${b.text}`),
        ].join('\n'),
      )
      .join('\n\n'),
  scars: () =>
    table(
      ['d12', 'Scar', 'Effect'],
      data.scars.map((s) => [s.roll, `**${s.name}**`, s.text]),
    ),
  misfires: () =>
    table(
      ['d6', 'What goes wrong'],
      data.misfires.map((m) => [m.roll, `**${m.name}.** ${m.text}`]),
    ),
  reactions: () =>
    table(
      ['2d6', 'They are...'],
      data.reactions.map((r) => [r.rollText, `**${r.name}.** ${r.text}`]),
    ),
  tiers: () =>
    table(
      ['Tier', 'Abilities the character can know', 'What opens up'],
      data.tiers.map((t) => [t.tier, t.abilitiesText, t.opens]),
    ),
  creatures: () =>
    data.creatures
      .map((c) => {
        const stats = [
          `${c.hp} HP`,
          ...(c.armor ? [`${c.armor} Armor`] : []),
          `${c.str} STR`,
          `${c.dex} DEX`,
          `${c.wil} WIL`,
          ...(c.attack ? [c.attack] : []),
        ].join(', ');
        return [
          `> **${c.name}**${c.alsoKnownAs ? ` (${c.alsoKnownAs})` : ''}`,
          `> ${stats}`,
          ...c.notes.map((note) => `> - ${note}`),
        ].join('\n');
      })
      .join('\n\n'),
};

const MARKED = /<!-- data:([a-z-]+) -->\n\n([\s\S]*?)\n\n<!-- \/data:\1 -->/g;

/** Every marked block in the rulebook, with what it holds now and what the data says it should hold. */
export function compareRulebook(
  markdown: string,
): { name: string; current: string; expected: string }[] {
  return [...markdown.matchAll(MARKED)].map((match) => {
    const build = blocks[match[1]!];
    if (!build)
      throw new Error(`The rulebook marks a block "${match[1]}" that no generator produces.`);
    return { name: match[1]!, current: match[2]!, expected: build() };
  });
}

/** Rewrites every marked block from the data. */
export function syncRulebook(markdown: string): string {
  return markdown.replace(MARKED, (_, name: string) => {
    const build = blocks[name];
    if (!build) throw new Error(`The rulebook marks a block "${name}" that no generator produces.`);
    return `<!-- data:${name} -->\n\n${build()}\n\n<!-- /data:${name} -->`;
  });
}
