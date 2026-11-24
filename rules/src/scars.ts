import { assertRoll } from './dice.ts';
import { data } from './data.ts';
import { clone } from './inventory.ts';
import { checkSave } from './saves.ts';
import { RulesError, type AttributeKey, type Character } from './types.ts';

/** Scars whose reward comes only after recovery. */
const DELAYED = new Set([3, 4, 5, 7, 11]);

const LOCATIONS: Record<number, string[]> = {
  1: ['neck', 'hands', 'eye', 'chest', 'legs', 'ear'],
  4: ['leg', 'leg', 'arm', 'arm', 'rib', 'skull'],
};
const HEAD_WOUND: AttributeKey[] = ['str', 'str', 'dex', 'dex', 'wil', 'wil'];

export interface ScarInput {
  /** The d6 for where a Lasting Scar or Broken Limb falls, or which attribute a Head Wound affects. */
  d6?: number;
  /** The dice total the scar calls for: 1d6, 2d6, 3d6, 1d4 as the table says. */
  total?: number;
  /** The d20 for the Willpower save that Deafened and Sundered call for. */
  d20?: number;
}

const need = (value: number | undefined, what: string): number => {
  if (value === undefined) throw new RulesError('missing-roll', `This scar needs ${what}.`);
  return value;
};
const between = (value: number, min: number, max: number) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RulesError('bad-roll', `${value} is not between ${min} and ${max}.`);
  }
  return value;
};

function raiseHpIfHigher(c: Character, total: number) {
  if (total > c.hp.full) c.hp.full = total;
}
function raiseAttributeIfHigher(c: Character, key: AttributeKey, total: number) {
  if (total > c.attributes[key].full) {
    c.attributes[key].current += total - c.attributes[key].full;
    c.attributes[key].full = total;
  }
}
function raiseWillpower(c: Character, by: number) {
  const full = Math.min(18, c.attributes.wil.full + by);
  c.attributes.wil.current += full - c.attributes.wil.full;
  c.attributes.wil.full = full;
}

/**
 * Applies a result from the Scars table when HP reaches exactly 0.
 * Scars 3, 4, 5, 7 and 11 are recorded as pending; call `recoverFromScar`
 * once the character has recovered.
 */
export function applyScar(character: Character, scar: number, input: ScarInput = {}): Character {
  assertRoll(scar, 12);
  const c = clone(character);
  const record: Character['scars'][number] = {
    roll: scar,
    name: data.scars[scar - 1]!.name,
    pending: DELAYED.has(scar),
  };
  switch (scar) {
    case 1:
      record.detail = LOCATIONS[1]![between(need(input.d6, 'a d6 for the location'), 1, 6) - 1];
      raiseHpIfHigher(c, between(need(input.total, '1d6'), 1, 6));
      break;
    case 2:
      raiseHpIfHigher(c, between(need(input.total, '1d6'), 1, 6));
      break;
    case 3:
      c.deprived = true;
      break;
    case 4:
      record.detail = LOCATIONS[4]![between(need(input.d6, 'a d6 for the limb'), 1, 6) - 1];
      break;
    case 5:
    case 7:
      break;
    case 6: {
      const key = HEAD_WOUND[between(need(input.d6, 'a d6 for the attribute'), 1, 6) - 1]!;
      record.detail = key;
      raiseAttributeIfHigher(c, key, between(need(input.total, '3d6'), 3, 18));
      break;
    }
    case 8:
      if (checkSave(c.attributes.wil.current, need(input.d20, 'a Willpower save'))) {
        raiseWillpower(c, between(need(input.total, '1d4'), 1, 4));
      }
      break;
    case 9:
      raiseAttributeIfHigher(c, 'wil', between(need(input.total, '3d6'), 3, 18));
      break;
    case 10:
      if (checkSave(c.attributes.wil.current, need(input.d20, 'a Willpower save'))) {
        raiseWillpower(c, between(need(input.total, '1d6'), 1, 6));
      }
      break;
    case 11:
      c.deprived = true;
      c.critical = true;
      break;
    default:
      c.doomed = true;
  }
  c.scars.push(record);
  return c;
}

/** Completes a pending scar once the character has rested, mended or been cured. */
export function recoverFromScar(character: Character, index: number, total: number): Character {
  const c = clone(character);
  const record = c.scars[index];
  if (!record?.pending)
    throw new RulesError('no-scar', 'There is no scar waiting on recovery there.');
  switch (record.roll) {
    case 3:
      c.deprived = false;
      c.hp.full += between(total, 1, 6);
      break;
    case 4:
    case 5:
      raiseHpIfHigher(c, between(total, 2, 12));
      break;
    case 7:
      raiseAttributeIfHigher(c, 'dex', between(total, 3, 18));
      break;
    default:
      c.deprived = false;
      c.critical = false;
      c.hp.full = between(total, 2, 12);
      c.hp.current = Math.min(c.hp.current, c.hp.full);
  }
  record.pending = false;
  return c;
}

/** A Doomed character who passes their next Strength save rolls 3d6 for HP. */
export function applyDoomedReward(character: Character, total: number): Character {
  const c = clone(character);
  raiseHpIfHigher(c, between(total, 3, 18));
  return c;
}

export interface DiceSpec {
  count: number;
  sides: 4 | 6;
}

/** What has to be rolled to apply each scar, so a screen can ask for exactly that. */
export function scarNeeds(scar: number): { d6?: string; total?: DiceSpec; d20?: boolean } {
  assertRoll(scar, 12);
  const d6 = (count: number): DiceSpec => ({ count, sides: 6 });
  switch (scar) {
    case 1:
      return { d6: 'Where the scar is', total: d6(1) };
    case 2:
      return { total: d6(1) };
    case 4:
      return { d6: 'Which limb' };
    case 6:
      return { d6: 'Which attribute', total: d6(3) };
    case 8:
      return { d20: true, total: { count: 1, sides: 4 } };
    case 9:
      return { total: d6(3) };
    case 10:
      return { d20: true, total: d6(1) };
    default:
      return {};
  }
}

/** The dice rolled when a pending scar is recovered from. */
export function scarRecoveryNeeds(scar: number): DiceSpec {
  if (!DELAYED.has(scar)) throw new RulesError('no-scar', 'That scar has no recovery roll.');
  return { count: scar === 3 ? 1 : scar === 7 ? 3 : 2, sides: 6 };
}
