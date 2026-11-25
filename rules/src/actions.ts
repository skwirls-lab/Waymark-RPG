import { awardTier } from './abilities.ts';
import { applyDamage, restoreAttribute } from './combat.ts';
import { addFatigue, addItem, clone, isFull, removeItem } from './inventory.ts';
import { setDeprived } from './rest.ts';
import { RulesError, type AttributeKey, type Character, type Item } from './types.ts';

/**
 * A change the Warden makes to a character during play, as plain data. It can
 * be applied at once, or sent to the player as a request and applied when
 * they accept. Either way the same function does the arithmetic.
 */
export type WardenAction =
  | { type: 'damage'; amount: number; ignoreArmor?: boolean }
  /** Restore HP to full, attribute points, or both. */
  | { type: 'heal'; hp?: boolean; attribute?: AttributeKey; amount?: number }
  | { type: 'fatigue'; count: number; tainted?: boolean }
  | { type: 'deprived'; value: boolean }
  | { type: 'give-item'; item: Item }
  | { type: 'take-item'; itemId: string }
  | { type: 'tier' };

export type FollowUp = 'scar' | 'strength-save';

export interface ActionResult {
  character: Character;
  /** What happened, in a sentence fit for the activity feed. */
  text: string;
  /** Rolls the player now owes. */
  followUps: FollowUp[];
}

const NAMES: Record<AttributeKey, string> = { str: 'Strength', dex: 'Dexterity', wil: 'Willpower' };

/** What the action asks for, before it is applied: "Take 5 damage". */
export function describeAction(action: WardenAction): string {
  switch (action.type) {
    case 'damage':
      return `Take ${action.amount} damage${action.ignoreArmor ? ', ignoring Armor' : ''}`;
    case 'heal': {
      const parts = [
        action.hp ? 'HP back to full' : '',
        action.attribute && action.amount
          ? `${action.amount} ${NAMES[action.attribute]} restored`
          : '',
      ].filter(Boolean);
      return parts.join(' and ') || 'Heal';
    }
    case 'fatigue':
      return `Gain ${action.count} Fatigue${action.tainted ? ' (tainted)' : ''}`;
    case 'deprived':
      return action.value ? 'Become deprived' : 'No longer deprived';
    case 'give-item':
      return `Receive ${action.item.name}`;
    case 'take-item':
      return 'Hand over an item';
    default:
      return 'Rise one Tier';
  }
}

/**
 * Applies a Warden's action through the ordinary rules.
 * `dropItemIds` names what to put down if Fatigue has nowhere to go.
 */
export function applyWardenAction(
  character: Character,
  action: WardenAction,
  options: { dropItemIds?: string[] } = {},
): ActionResult {
  const name = character.name;
  switch (action.type) {
    case 'damage': {
      const r = applyDamage(character, action.amount, { ignoreArmor: action.ignoreArmor });
      const followUps: FollowUp[] = r.strengthSaveRequired
        ? ['strength-save']
        : r.scarRequired
          ? ['scar']
          : [];
      let text =
        r.taken === 0
          ? `${name}'s Armor stopped all ${action.amount} damage.`
          : `${name} took ${r.taken} damage. HP ${r.character.hp.current}.`;
      if (r.strengthLost > 0)
        text += ` Strength down ${r.strengthLost} to ${r.character.attributes.str.current}.`;
      if (r.dead) text += ` ${name} has died.`;
      return { character: r.character, text, followUps };
    }
    case 'heal': {
      let c = clone(character);
      const parts: string[] = [];
      if (action.attribute && action.amount) {
        c = restoreAttribute(c, action.attribute, action.amount);
        parts.push(`${NAMES[action.attribute]} ${c.attributes[action.attribute].current}`);
      }
      if (action.hp) {
        // A healing hand does what rest would, and no more: not while overloaded.
        if (!isFull(c)) c.hp.current = c.hp.full;
        parts.push(`HP ${c.hp.current}`);
      }
      if (parts.length === 0) throw new RulesError('bad-action', 'Say what to heal.');
      return { character: c, text: `${name} was healed: ${parts.join(', ')}.`, followUps: [] };
    }
    case 'fatigue': {
      if (!Number.isInteger(action.count) || action.count < 1 || action.count > 10) {
        throw new RulesError('bad-action', 'Fatigue is gained 1 to 10 at a time.');
      }
      let c = character;
      const drops = [...(options.dropItemIds ?? [])];
      let lostStrength = 0;
      let dropped = 0;
      for (let i = 0; i < action.count; i++) {
        const needsDrop =
          c.slotCapacity -
            c.items.reduce((s, item) => s + item.slots, 0) -
            c.fatigue -
            c.taintedFatigue <
          1;
        const r = addFatigue(c, {
          tainted: action.tainted,
          dropItemId: needsDrop ? drops.shift() : undefined,
        });
        c = r.character;
        if (r.outcome === 'strength') lostStrength += 1;
        if (r.outcome === 'dropped') dropped += 1;
      }
      let text = `${name} gained ${action.count} Fatigue.`;
      if (dropped) text += ` Dropped ${dropped} item${dropped > 1 ? 's' : ''} to make room.`;
      if (lostStrength) text += ` Every slot is Fatigue: lost ${lostStrength} Strength.`;
      if (isFull(c)) text += ' Every slot is full, so HP is 0.';
      return { character: c, text, followUps: [] };
    }
    case 'deprived':
      return {
        character: setDeprived(character, action.value),
        text: action.value ? `${name} is deprived.` : `${name} is no longer deprived.`,
        followUps: [],
      };
    case 'give-item': {
      const c = addItem(character, { ...action.item, place: 'pack' });
      return {
        character: c,
        text: `${name} received ${action.item.name}.${isFull(c) ? ' Every slot is full, so HP is 0.' : ''}`,
        followUps: [],
      };
    }
    case 'take-item': {
      const item = character.items.find((i) => i.id === action.itemId);
      return {
        character: removeItem(character, action.itemId),
        text: `${name} handed over ${item?.name}.`,
        followUps: [],
      };
    }
    default: {
      const c = awardTier(character);
      return { character: c, text: `${name} rose to Tier ${c.tier}.`, followUps: [] };
    }
  }
}
