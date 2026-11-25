import {
  addEnemies,
  applyScar,
  applyWardenAction,
  armorValue,
  checkSave,
  damageEnemy,
  data,
  enemyStrengthSave,
  moraleWillpower,
  reactionFor,
  resolveMorale,
  resolveStrengthSave,
  scarNeeds,
  startFight,
  status,
  syncParty,
  RulesError,
  type AttributeKey,
  type Character,
  type CreatureStats,
  type Fight,
  type Rng,
} from '@waymark/rules';
import { INSTRUCTIONS } from './instructions';

/**
 * The AI Warden's engine. The model tells the story and asks for things to
 * happen; everything that changes the game happens here, through the rules
 * library. This file knows nothing about the database or the network: it
 * takes a session and a turn, and returns the new session and what happened.
 * That is what makes the rule "the model cannot change state any other way"
 * something a test can prove.
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export type WardenModel = (messages: Message[]) => Promise<{ text: string; cost?: number }>;

export interface CardInfo {
  id: string;
  kind: string;
  name: string;
  text: string;
  /** What only the Warden knows. */
  notes: string;
  status: 'planned' | 'met' | 'changed' | 'gone';
}

/** A roll the game is waiting on a player for. */
export interface Pending {
  kind: 'save' | 'strength-save' | 'damage';
  characterId: string;
  sides: 20 | 4 | 6 | 8 | 10 | 12;
  /** Shown to the player before they roll: what it is for, and what is at stake. */
  label: string;
  attribute?: AttributeKey;
  enemyId?: string;
}

export interface Exchange {
  who: string;
  text: string;
}

export interface Session {
  brief: { setting: string; mission: string };
  party: Record<string, Character>;
  cards: CardInfo[];
  /** Recent story beats, oldest first. */
  beats: string[];
  scene: { summary: string; dangers: string[] };
  fight: Fight | null;
  /** Creatures the Warden may put in a fight, beyond the rulebook's own. */
  creatures: (CreatureStats & { damage: number[] })[];
  /** The last few things said, oldest first. */
  exchanges: Exchange[];
  pending: Pending | null;
}

export type Event =
  | { kind: 'narration'; text: string; suggestions: string[] }
  | { kind: 'result'; text: string }
  | { kind: 'ask-roll'; pending: Pending }
  | { kind: 'beat'; text: string; milestone: boolean }
  | { kind: 'reveal-card'; cardId: string }
  | { kind: 'propose-card'; card: { kind: string; name: string; text: string } };

export type TurnInput =
  | { type: 'say'; characterId: string | null; who: string; text: string }
  | { type: 'roll'; value: number };

export interface TurnResult {
  session: Session;
  events: Event[];
  cost: number;
  modelCalls: number;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}
interface Reply {
  narration: string;
  tools: ToolCall[];
  suggestions: string[];
}

const MAX_STEPS = 3;
const MAX_TOOLS = 6;
const KEEP_EXCHANGES = 8;
const DICE = [4, 6, 8, 10, 12];
const ATTRIBUTES: Record<string, AttributeKey> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  wil: 'wil',
  willpower: 'wil',
};
const NAMES: Record<AttributeKey, string> = { str: 'Strength', dex: 'Dexterity', wil: 'Willpower' };

const clip = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[<>]/g, '').trim().slice(0, max) : '';

/** Reads the model's reply. Anything that is not the agreed shape is refused. */
export function parseReply(text: string): Reply | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const r = raw as { narration?: unknown; tools?: unknown; suggestions?: unknown };
  if (!r || typeof r.narration !== 'string') return null;
  const tools = Array.isArray(r.tools) ? r.tools : [];
  const calls: ToolCall[] = [];
  for (const t of tools.slice(0, MAX_TOOLS)) {
    const call = t as { name?: unknown; args?: unknown };
    if (typeof call?.name !== 'string') return null;
    calls.push({
      name: call.name,
      args: (call.args && typeof call.args === 'object' ? call.args : {}) as Record<
        string,
        unknown
      >,
    });
  }
  const suggestions = Array.isArray(r.suggestions)
    ? r.suggestions
        .map((s) => clip(s, 80))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  return { narration: clip(r.narration, 1200), tools: calls, suggestions };
}

/** What the model is shown of the game: enough to tell the story, and nothing it could not act on. */
export function describeSession(session: Session): Record<string, unknown> {
  return {
    brief: session.brief,
    party: Object.entries(session.party).map(([id, c]) => ({
      id,
      name: c.name,
      hp: `${c.hp.current} of ${c.hp.full}`,
      strength: c.attributes.str.current,
      dexterity: c.attributes.dex.current,
      willpower: c.attributes.wil.current,
      armor: armorValue(c),
      condition: status(c) === 'ok' ? (c.deprived ? 'deprived' : 'fine') : status(c),
      abilities: c.abilities,
      carrying: c.items.map((i) => i.name),
    })),
    scene: session.scene,
    fight: session.fight
      ? {
          round: session.fight.round,
          enemies: session.fight.combatants
            .filter((c) => c.side === 'enemy')
            .map((e) => ({
              id: e.id,
              name: e.name,
              hp: e.hp,
              strength: e.str,
              armor: e.armor,
              attack: e.attack,
              down: e.down,
            })),
        }
      : null,
    creatures: [...data.creatures.map((c) => c.name), ...session.creatures.map((c) => c.name)],
    cards: session.cards.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      status: c.status,
      text: c.text,
      secret: c.notes,
    })),
    recentBeats: session.beats.slice(-15),
    conversation: session.exchanges,
  };
}

/** Numbers written as digits in the text. */
const numbersIn = (text: string): string[] => text.match(/\d+/g) ?? [];

/**
 * Narration may state a number only if the rules produced it this turn, or
 * it was already in what the model was shown. Returns the numbers that have
 * no such source.
 */
export function inventedNumbers(narration: string, sources: string[]): string[] {
  const known = new Set(sources.flatMap(numbersIn));
  return numbersIn(narration).filter((n) => !known.has(n));
}

class Refused extends Error {}

/** Runs the model's tool requests through the rules. This is the only code that changes a session. */
class Table {
  results: string[] = [];
  events: Event[] = [];
  /** Characters called on for a save this turn: a danger they were warned of. */
  private warned = new Set<string>();
  private harmed = new Set<string>();
  private dangersAtStart: number;

  constructor(
    public session: Session,
    private rng: Rng,
  ) {
    this.dangersAtStart = session.scene.dangers.length;
  }

  private say(text: string) {
    this.results.push(text);
    this.events.push({ kind: 'result', text });
  }

  private character(ref: unknown): [string, Character] {
    const key = clip(ref, 80).toLowerCase();
    const found = Object.entries(this.session.party).find(
      ([id, c]) => id.toLowerCase() === key || c.name.toLowerCase() === key,
    );
    if (!found) throw new Refused(`There is no character "${clip(ref, 40)}" in the party.`);
    return found;
  }

  private enemy(ref: unknown) {
    const key = clip(ref, 80).toLowerCase();
    const found = this.session.fight?.combatants.find(
      (c) => c.side === 'enemy' && (c.id.toLowerCase() === key || c.name.toLowerCase() === key),
    );
    if (!found) throw new Refused(`There is no enemy "${clip(ref, 40)}" in this fight.`);
    return found;
  }

  private ask(pending: Pending) {
    this.session.pending = pending;
    this.events.push({ kind: 'ask-roll', pending });
  }

  /** Damage to a character, and whatever follows from it. */
  hurt(id: string, amount: number, why: string) {
    const before = this.session.party[id]!;
    const r = applyWardenAction(before, { type: 'damage', amount });
    this.session.party[id] = r.character;
    this.say(`${why ? `${why}: ` : ''}${r.text}`);
    if (r.followUps.includes('scar')) this.scar(id);
    if (r.followUps.includes('strength-save') && !this.session.pending) {
      const c = this.session.party[id]!;
      this.ask({
        kind: 'strength-save',
        characterId: id,
        sides: 20,
        label: `${c.name} has lost Strength. Roll ${c.attributes.str.current} or less to stay up.`,
      });
    }
  }

  /** HP reached exactly 0: a Scar. The table and its dice are rolled here. */
  private scar(id: string) {
    const roll = this.rng(12);
    const needs = scarNeeds(roll);
    const sum = (count: number, sides: number) =>
      Array.from({ length: count }, () => this.rng(sides)).reduce((a, b) => a + b, 0);
    const c = applyScar(this.session.party[id]!, roll, {
      ...(needs.d6 ? { d6: this.rng(6) } : {}),
      ...(needs.total ? { total: sum(needs.total.count, needs.total.sides) } : {}),
      ...(needs.d20 ? { d20: this.rng(20) } : {}),
    });
    this.session.party[id] = c;
    const entry = data.scars[roll - 1]!;
    this.say(`${c.name} is at 0 HP and takes a Scar: ${entry.name}. ${entry.text}`);
  }

  run(call: ToolCall): void {
    const a = call.args;
    const s = this.session;
    switch (call.name) {
      case 'call_for_save': {
        const [id, c] = this.character(a.character);
        const attribute = ATTRIBUTES[clip(a.attribute, 12).toLowerCase()];
        const why = clip(a.why, 200);
        if (!attribute) throw new Refused('A save is against Strength, Dexterity or Willpower.');
        if (!why)
          throw new Refused('Say what the save is for and what happens on a failure, in "why".');
        if (s.pending)
          throw new Refused('One roll at a time: wait for the roll already asked for.');
        this.warned.add(id);
        this.ask({
          kind: 'save',
          characterId: id,
          attribute,
          sides: 20,
          label: `${c.name}: ${NAMES[attribute]} save. ${why} Roll ${c.attributes[attribute].current} or less.`,
        });
        this.results.push(`Waiting for ${c.name}'s ${NAMES[attribute]} save.`);
        return;
      }
      case 'deal_damage': {
        const [id, c] = this.character(a.character);
        const die = Number(a.die);
        if (!DICE.includes(die))
          throw new Refused('"die" must be 4, 6, 8, 10 or 12. The app rolls it.');
        if (this.harmed.has(id)) throw new Refused(`${c.name} has already been harmed this turn.`);
        // No harm without a warning: outside a fight, a danger must have been
        // described before this turn, or a save called for it.
        if (!s.fight && this.dangersAtStart === 0 && !this.warned.has(id)) {
          throw new Refused(
            'No harm without a warning. Describe the danger, record it with update_scene, and let the players choose. Or call for a save first.',
          );
        }
        this.harmed.add(id);
        this.hurt(id, this.rng(die), clip(a.why, 120));
        return;
      }
      case 'enemy_attack': {
        const enemy = this.enemy(a.enemy);
        const [id, c] = this.character(a.character);
        if (enemy.down) throw new Refused(`${enemy.name} is down and cannot attack.`);
        if (this.harmed.has(id)) throw new Refused(`${c.name} has already been harmed this turn.`);
        const die = Number(/d(\d+)/.exec(enemy.attack)?.[1] ?? 6);
        this.harmed.add(id);
        this.hurt(id, this.rng(DICE.includes(die) ? die : 6), `${enemy.name} attacks ${c.name}`);
        return;
      }
      case 'player_attack': {
        const [id, c] = this.character(a.character);
        const enemy = this.enemy(a.enemy);
        if (s.pending)
          throw new Refused('One roll at a time: wait for the roll already asked for.');
        const weapon = c.items
          .filter((i) => i.kind === 'weapon' && i.damage)
          .sort(
            (x, y) =>
              (x.place === 'hand' ? -1 : 0) - (y.place === 'hand' ? -1 : 0) ||
              y.damage! - x.damage!,
          )[0];
        const sides = (weapon?.damage ?? 4) as Pending['sides'];
        this.ask({
          kind: 'damage',
          characterId: id,
          enemyId: enemy.id,
          sides,
          label: `${c.name} attacks ${enemy.name} with ${weapon?.name ?? 'bare hands'}. Roll d${sides} for damage.`,
        });
        this.results.push(`Waiting for ${c.name}'s damage roll.`);
        return;
      }
      case 'restore_hp': {
        const [id] = this.character(a.character);
        const r = applyWardenAction(s.party[id]!, { type: 'heal', hp: true });
        s.party[id] = r.character;
        this.say(r.text);
        return;
      }
      case 'add_fatigue': {
        const [id] = this.character(a.character);
        const r = applyWardenAction(s.party[id]!, { type: 'fatigue', count: 1 });
        s.party[id] = r.character;
        this.say(r.text);
        return;
      }
      case 'give_item': {
        const [id] = this.character(a.character);
        const name = clip(a.name, 40);
        if (!name) throw new Refused('The item needs a name.');
        const r = applyWardenAction(s.party[id]!, {
          type: 'give-item',
          item: {
            id: `item-${this.rng(1_000_000_000)}`,
            name,
            kind: 'tool',
            slots: a.bulky === true ? 2 : 1,
            place: 'pack',
          },
        });
        s.party[id] = r.character;
        this.say(r.text);
        return;
      }
      case 'take_item': {
        const [id, c] = this.character(a.character);
        const item = c.items.find((i) => i.name.toLowerCase() === clip(a.name, 40).toLowerCase());
        if (!item) throw new Refused(`${c.name} is not carrying "${clip(a.name, 40)}".`);
        const r = applyWardenAction(c, { type: 'take-item', itemId: item.id });
        s.party[id] = r.character;
        this.say(r.text);
        return;
      }
      case 'start_fight': {
        if (s.fight) throw new Refused('A fight is already under way.');
        const wanted = Array.isArray(a.enemies) ? a.enemies.slice(0, 4) : [];
        let fight = startFight(Object.entries(s.party).map(([id, c]) => ({ id, name: c.name })));
        for (const w of wanted as { creature?: unknown; count?: unknown }[]) {
          const name = clip(w?.creature, 40).toLowerCase();
          const known =
            s.creatures.find((c) => c.name.toLowerCase() === name) ??
            data.creatures.find((c) => c.name.toLowerCase() === name);
          if (!known)
            throw new Refused(
              `There is no creature called "${clip(w?.creature, 40)}". Use one from "creatures".`,
            );
          const count = Math.max(1, Math.min(6, Math.floor(Number(w?.count) || 1)));
          fight = addEnemies(
            fight,
            { ...known, attack: known.attack ?? 'attack (d6)' },
            count,
            () => `e${this.rng(1_000_000_000)}`,
          );
        }
        if (fight.combatants.every((c) => c.side !== 'enemy'))
          throw new Refused('A fight needs at least one enemy.');
        s.fight = fight;
        this.say(
          `A fight begins: ${fight.combatants
            .filter((c) => c.side === 'enemy')
            .map((c) => c.name)
            .join(', ')}.`,
        );
        return;
      }
      case 'check_morale': {
        if (!s.fight) throw new Refused('There is no fight.');
        const r = resolveMorale(s.fight, this.rng(20));
        s.fight = r.fight;
        this.say(`Morale check for the enemies (Willpower ${moraleWillpower(r.fight)}): ${r.text}`);
        return;
      }
      case 'end_fight': {
        if (!s.fight) throw new Refused('There is no fight.');
        s.fight = null;
        this.say('The fight is over.');
        return;
      }
      case 'roll_reaction': {
        const total = this.rng(6) + this.rng(6);
        const reaction = data.reactions.find((r) => r.id === reactionFor(total))!;
        this.say(`Reaction roll: ${reaction.name}. ${reaction.text}`);
        return;
      }
      case 'add_beat': {
        const text = clip(a.text, 300);
        if (!text) throw new Refused('A beat needs text.');
        s.beats = [...s.beats, text].slice(-40);
        this.events.push({ kind: 'beat', text, milestone: a.milestone === true });
        this.results.push('Recorded on the timeline.');
        return;
      }
      case 'reveal_card': {
        const key = clip(a.card, 80).toLowerCase();
        const card = s.cards.find(
          (c) => c.id.toLowerCase() === key || c.name.toLowerCase() === key,
        );
        if (!card) throw new Refused(`There is no card "${clip(a.card, 40)}".`);
        if (card.status === 'planned') {
          card.status = 'met';
          this.events.push({ kind: 'reveal-card', cardId: card.id });
        }
        this.results.push(`${card.name} is now known to the players.`);
        return;
      }
      case 'propose_card': {
        const kind = clip(a.kind, 12);
        const name = clip(a.name, 60);
        if (!['person', 'place', 'creature', 'faction', 'item', 'thread'].includes(kind) || !name) {
          throw new Refused(
            'A card needs a kind (person, place, creature, faction, item or thread) and a name.',
          );
        }
        this.events.push({ kind: 'propose-card', card: { kind, name, text: clip(a.text, 400) } });
        this.results.push(`A card for ${name} has been proposed.`);
        return;
      }
      case 'update_scene': {
        const dangers = Array.isArray(a.dangers)
          ? a.dangers
              .map((d) => clip(d, 120))
              .filter(Boolean)
              .slice(0, 6)
          : s.scene.dangers;
        s.scene = { summary: clip(a.summary, 600) || s.scene.summary, dangers };
        this.results.push('Scene updated.');
        return;
      }
      default:
        throw new Refused(`There is no tool called "${clip(call.name, 40)}".`);
    }
  }

  /** Runs a request, turning any refusal into a result the model can read. */
  attempt(call: ToolCall): void {
    try {
      this.run(call);
    } catch (problem) {
      if (problem instanceof Refused || problem instanceof RulesError) {
        this.results.push(`REFUSED ${call.name}: ${problem.message}`);
      } else throw problem;
    }
  }

  /** A player's roll for whatever the game was waiting on. */
  resolve(value: number): void {
    const p = this.session.pending;
    if (!p) throw new Refused('No roll is being waited for.');
    if (!Number.isInteger(value) || value < 1 || value > p.sides) {
      throw new Refused(`That roll must be between 1 and ${p.sides}.`);
    }
    this.session.pending = null;
    const c = this.session.party[p.characterId];
    if (!c) throw new Refused('That character is no longer here.');
    if (p.kind === 'save') {
      const passed = checkSave(c.attributes[p.attribute!].current, value);
      this.say(
        `${c.name} rolled ${value} for a ${NAMES[p.attribute!]} save against ${c.attributes[p.attribute!].current}: ${passed ? 'passed' : 'failed'}.`,
      );
      this.warned.add(p.characterId);
    } else if (p.kind === 'strength-save') {
      const r = resolveStrengthSave(c, value);
      this.session.party[p.characterId] = r.character;
      this.say(
        `${c.name} rolled ${value} for a Strength save against ${c.attributes.str.current}: ${
          r.dead
            ? 'failed, and they were Doomed. They have died.'
            : r.success
              ? 'passed. Wounded, but still up.'
              : 'failed. Critical damage: they collapse and need help within the hour.'
        }`,
      );
    } else {
      const fight = this.session.fight;
      const enemy = fight?.combatants.find((e) => e.id === p.enemyId);
      if (!fight || !enemy) {
        this.say(`${c.name} rolled ${value}, but that enemy is gone.`);
        return;
      }
      const hit = damageEnemy(fight, enemy.id, value);
      this.session.fight = hit.fight;
      this.say(`${c.name} rolled ${value} damage. ${hit.text}`);
      const after = hit.fight.combatants.find((e) => e.id === enemy.id)!;
      if (after.saveDue) {
        // Enemies' dice are the Warden's, so the app rolls them.
        const save = enemyStrengthSave(hit.fight, enemy.id, this.rng(20));
        this.session.fight = save.fight;
        this.say(save.text);
      }
      if (this.session.fight?.morale)
        this.results.push(`Morale is due: ${this.session.fight.morale} Use check_morale.`);
    }
  }
}

const PLAIN = 'The Warden pauses to gather the threads.';

/**
 * Plays one turn: a player's words, or the roll the game was waiting for.
 * The model is asked at most three times. A turn that ends waiting for a
 * roll stops there, and the next turn carries on from the roll.
 */
export async function runTurn(
  before: Session,
  input: TurnInput,
  model: WardenModel,
  rng: Rng,
): Promise<TurnResult> {
  const session: Session = structuredClone(before);
  if (session.fight)
    session.fight = syncParty(
      session.fight,
      Object.entries(session.party).map(([id, c]) => ({ id, name: c.name })),
    );
  const table = new Table(session, rng);
  let cost = 0;
  let modelCalls = 0;

  if (input.type === 'roll') {
    table.resolve(input.value);
  } else {
    if (session.pending) throw new Refused('The game is waiting for a roll first.');
    const text = clip(input.text, 500);
    if (!text) throw new Refused('Say what your character does.');
    session.exchanges.push({ who: clip(input.who, 60) || 'A player', text });
  }

  const shown = JSON.stringify(describeSession(session));
  const messages: Message[] = [
    { role: 'system', content: INSTRUCTIONS },
    {
      role: 'user',
      content: `DATA:\n${shown}\n\n${
        input.type === 'roll'
          ? `RESULTS so far this turn:\n${table.results.join('\n')}\nNarrate the outcome and carry on.`
          : 'Answer the last thing said in "conversation".'
      }`,
    },
  ];
  let narration = '';
  let suggestions: string[] = [];

  for (let step = 1; step <= MAX_STEPS && !session.pending; step++) {
    let reply: Reply | null = null;
    for (let attempt = 1; attempt <= 2 && !reply; attempt++) {
      const answer = await model(messages);
      modelCalls++;
      cost += answer.cost ?? 0;
      reply = parseReply(answer.text);
      if (!reply)
        messages.push({
          role: 'system',
          content:
            'That reply was not the JSON object described. Reply again with exactly that object.',
        });
    }
    if (!reply) {
      narration = narration || PLAIN;
      break;
    }
    const seenBefore = table.results.length;
    for (const call of reply.tools) table.attempt(call);
    const fresh = table.results.slice(seenBefore);

    // A number in the narration must come from the rules or from what the model was shown.
    const invented = inventedNumbers(reply.narration, [shown, ...table.results]);
    const told = invented.length === 0 ? reply.narration : '';
    if (told) narration = narration ? `${narration}\n\n${told}` : told;
    suggestions = reply.suggestions;

    if (reply.tools.length === 0 && invented.length === 0) break;
    messages.push({ role: 'assistant', content: JSON.stringify(reply) });
    messages.push({
      role: 'user',
      content:
        (fresh.length ? `RESULTS:\n${fresh.join('\n')}\n` : '') +
        (invented.length
          ? `Your narration stated ${invented.join(', ')}, which the rules did not produce. Narrate again using only numbers from RESULTS or DATA, or none.`
          : session.pending
            ? ''
            : 'Narrate what the players now see, using these results. Call no tool unless something new must happen.'),
    });
  }

  // Whatever the model did, the players are told plainly what the rules decided.
  if (!narration)
    narration = table.results.filter((r) => !r.startsWith('REFUSED')).join(' ') || PLAIN;
  session.exchanges.push({ who: 'Warden', text: narration });
  session.exchanges = session.exchanges.slice(-KEEP_EXCHANGES);
  const told: Event = {
    kind: 'narration',
    text: narration,
    suggestions: session.pending ? [] : suggestions,
  };
  const happened = table.events.filter((e) => e.kind !== 'ask-roll');
  const asks = table.events.filter((e) => e.kind === 'ask-roll');
  // After a roll, the players see its result before the story moves on.
  const events: Event[] =
    input.type === 'roll' ? [...happened, told, ...asks] : [told, ...happened, ...asks];
  return { session, events, cost, modelCalls };
}

export { Refused };
/** For a creature made in the workshop, the numbers a fight needs. */
export const asFightCreature = (c: {
  name: string;
  hp: number;
  armor: number;
  str: number;
  wil: number;
  attack: string | null;
  damage: number[];
}) => ({
  name: c.name,
  hp: c.hp,
  armor: c.armor,
  str: c.str,
  wil: c.wil,
  attack: c.attack ?? 'attack (d6)',
  damage: c.damage,
});
