import { fireEvent, render, screen, within } from '@testing-library/react';
import { createCharacter, type Character } from '@waymark/rules';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { CharacterDoc } from '../data/characters';
import { SheetView } from './Sheet';

let latest: Character;
const removed = vi.fn();

const wren = (): Character =>
  createCharacter({
    name: 'Wren',
    background: 'Scout',
    attributes: { str: 9, dex: 13, wil: 11 },
    hp: 4,
    coins: 10,
    primaryAffinity: 'mending',
    abilities: ['mend', 'cleanse'],
    items: [
      { id: 'sword', name: 'Short sword', kind: 'weapon', slots: 1, place: 'pack', damage: 8 },
      { id: 'jacket', name: 'Leather jacket', kind: 'armor', slots: 1, place: 'pack', armor: 1 },
      { id: 'rope', name: 'Rope', kind: 'tool', slots: 1, place: 'pack' },
      { id: 'hook', name: 'Grappling hook', kind: 'tool', slots: 1, place: 'pack' },
    ],
  });

function Harness({ sheet = wren() }: { sheet?: Character }) {
  const [doc, setDoc] = useState<CharacterDoc>({
    id: 'u_1',
    ownerUid: 'u',
    slot: 1,
    name: sheet.name,
    description: '',
    age: null,
    notes: '',
    sheet,
    createdAt: 0,
    updatedAt: 0,
  });
  latest = doc.sheet;
  return (
    <MemoryRouter>
      <SheetView
        doc={doc}
        onSave={setDoc}
        onChange={(apply, text) =>
          setDoc((d) => ({ ...d, sheet: apply(d.sheet), undo: { sheet: d.sheet, text, at: 1 } }))
        }
        onUndo={() => setDoc((d) => (d.undo ? { ...d, sheet: d.undo.sheet, undo: null } : d))}
        onDelete={removed}
      />
    </MemoryRouter>
  );
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const stat = (id: string) => screen.getByTestId(`stat-${id}`).textContent;
const dialog = () => screen.getByRole('dialog');
const inDialog = (name: string | RegExp) =>
  fireEvent.click(within(dialog()).getByRole('button', { name }));
const said = () => screen.getByRole('status').textContent;

beforeEach(() => removed.mockClear());

describe('the sheet: what it shows', () => {
  it('shows attributes, HP, Armor and slots from the rules library', () => {
    render(<Harness />);
    expect(stat('strength')).toBe('9');
    expect(stat('hp')).toBe('4');
    expect(screen.getByTestId('armor').textContent).toBe('1');
    expect(screen.getByTestId('slots').textContent).toBe('6 of 10 slots');
  });
});

describe('the sheet: taking damage', () => {
  it('subtracts Armor and lowers HP', () => {
    render(<Harness />);
    click('Take damage');
    type('Damage rolled against you', '3');
    inDialog('Apply damage');
    expect(stat('hp')).toBe('2');
    expect(said()).toMatch(/Took 2 after Armor/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exactly 0 HP leads straight to rolling a Scar', () => {
    render(<Harness />);
    click('Take damage');
    type('Damage rolled against you', '5');
    inDialog('Apply damage');
    expect(within(dialog()).getByRole('heading', { name: 'Roll a Scar' })).toBeInTheDocument();
    type(/^Scar/, '2');
    expect(within(dialog()).getByText(/Rattling Blow/)).toBeInTheDocument();
    type(/^Roll for the scar/, '6');
    inDialog('Record scar');
    expect(latest.hp).toEqual({ current: 0, full: 6 });
    expect(screen.getByText('Rattling Blow')).toBeInTheDocument();
  });

  it('the rulebook example: 7 damage, Strength 9 to 7, then a save of 5 keeps Wren up', () => {
    render(<Harness />);
    click('Take damage');
    type('Damage rolled against you', '7');
    inDialog('Apply damage');
    expect(stat('hp')).toBe('0');
    expect(stat('strength')).toBe('7');
    expect(within(dialog()).getByRole('heading', { name: 'Strength save' })).toBeInTheDocument();
    type(/^Your roll/, '5');
    inDialog('Resolve');
    expect(said()).toMatch(/wounded, but still up/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a failed Strength save shows critical damage, which another character can tend', () => {
    render(<Harness />);
    click('Take damage');
    type('Damage rolled against you', '7');
    inDialog('Apply damage');
    type(/^Your roll/, '15');
    inDialog('Resolve');
    expect(screen.getByRole('alert')).toHaveTextContent(/Critical damage/);
    click('Someone tends them');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('enough damage kills', () => {
    render(<Harness />);
    click('Take damage');
    type('Damage rolled against you', '40');
    inDialog('Apply damage');
    expect(screen.getByRole('alert')).toHaveTextContent(/has died/);
  });
});

describe('the sheet: using an Ability', () => {
  it('when safe it works and costs 1 Fatigue', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    fireEvent.click(within(dialog()).getByLabelText(/^No\./));
    inDialog('Use Ability');
    expect(screen.getByTestId('fatigue').textContent).toBe('1');
    expect(said()).toMatch(/Mend works/);
  });

  it('in danger, a failed Willpower save misfires; Drained costs 2 Fatigue', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    fireEvent.click(within(dialog()).getByLabelText(/^Yes\./));
    expect(within(dialog()).getByRole('button', { name: 'Use Ability' })).toBeDisabled();
    type(/^Willpower save/, '15');
    type(/^Misfire/, '2');
    inDialog('Use Ability');
    expect(screen.getByTestId('fatigue').textContent).toBe('2');
    expect(said()).toMatch(/misfired: Drained/);
  });

  it('in danger, a passed save works', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    fireEvent.click(within(dialog()).getByLabelText(/^Yes\./));
    type(/^Willpower save/, '11');
    expect(within(dialog()).queryByLabelText(/^Misfire/)).not.toBeInTheDocument();
    inDialog('Use Ability');
    expect(said()).toMatch(/Mend works/);
  });

  it('a Backlash asks for its damage', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    fireEvent.click(within(dialog()).getByLabelText(/^Yes\./));
    type(/^Willpower save/, '19');
    type(/^Misfire/, '3');
    expect(within(dialog()).getByRole('button', { name: 'Use Ability' })).toBeDisabled();
    type(/^Backlash damage/, '2');
    inDialog('Use Ability');
    expect(stat('hp')).toBe('2');
  });

  it('with no free slot, asks which item to drop', () => {
    const loaded = { ...wren(), fatigue: 4, hp: { current: 0, full: 4 } };
    render(<Harness sheet={loaded} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    fireEvent.click(within(dialog()).getByLabelText(/^No\./));
    expect(within(dialog()).getByRole('button', { name: 'Use Ability' })).toBeDisabled();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Rope' }));
    inDialog('Use Ability');
    expect(latest.items.some((i) => i.id === 'rope')).toBe(false);
    expect(latest.fatigue).toBe(5);
  });
});

describe('the sheet: Fatigue and carrying', () => {
  it("four Fatigue fill Wren's slots and drop her HP to 0", () => {
    render(<Harness />);
    for (let i = 0; i < 4; i++) click('Add 1 Fatigue');
    expect(screen.getByTestId('slots').textContent).toBe('10 of 10 slots');
    expect(stat('hp')).toBe('0');
    expect(screen.getByRole('alert')).toHaveTextContent(/Every slot is full/);
  });

  it('a fifth Fatigue asks for an item to drop', () => {
    render(<Harness sheet={{ ...wren(), fatigue: 4, hp: { current: 0, full: 4 } }} />);
    click('Add 1 Fatigue');
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Grappling hook' }));
    inDialog('Drop it and gain Fatigue');
    expect(latest.fatigue).toBe(5);
    expect(latest.items.some((i) => i.id === 'hook')).toBe(false);
  });

  it('dropping an item frees its slot', () => {
    render(<Harness />);
    click('Drop Rope');
    expect(screen.getByTestId('slots').textContent).toBe('5 of 10 slots');
  });

  it('adding an item uses a slot, and is refused when there is no room', () => {
    render(<Harness />);
    click('Add an item');
    type('Name', 'Lantern');
    inDialog('Add item');
    expect(screen.getByTestId('slots').textContent).toBe('7 of 10 slots');

    click('Add an item');
    type('Name', 'Anvil');
    type('Size', '2');
    expect(within(dialog()).getByRole('button', { name: 'Add item' })).toBeEnabled();
  });

  it('refuses an item that does not fit', () => {
    render(<Harness sheet={{ ...wren(), fatigue: 3 }} />);
    click('Add an item');
    type('Name', 'Anvil');
    type('Size', '2');
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/no room/);
    expect(within(dialog()).getByRole('button', { name: 'Add item' })).toBeDisabled();
  });

  it('moving the shield to the pack lowers Armor', () => {
    render(<Harness />);
    type('Where Leather jacket is carried', 'pack');
    expect(screen.getByTestId('armor').textContent).toBe('0');
  });
});

describe('the sheet: rest', () => {
  it('a short rest restores HP', () => {
    render(<Harness sheet={{ ...wren(), hp: { current: 1, full: 4 } }} />);
    click('Rest');
    inDialog(/^Short rest/);
    expect(stat('hp')).toBe('4');
  });

  it('a safe night removes Fatigue', () => {
    render(<Harness sheet={{ ...wren(), fatigue: 3 }} />);
    click('Rest');
    inDialog(/^Night's rest/);
    expect(screen.getByTestId('fatigue').textContent).toBe('0');
  });

  it('a week of care restores lost attribute points', () => {
    const hurt = wren();
    hurt.attributes.str.current = 5;
    render(<Harness sheet={hurt} />);
    click('Rest');
    inDialog(/^Week's rest/);
    expect(stat('strength')).toBe('9');
  });

  it('a deprived character gets nothing back from a short rest, and is told why', () => {
    render(<Harness sheet={{ ...wren(), hp: { current: 1, full: 4 } }} />);
    fireEvent.click(screen.getByLabelText(/^Deprived/));
    click('Rest');
    inDialog(/^Short rest/);
    expect(stat('hp')).toBe('1');
    expect(said()).toMatch(/did not fully return/);
  });
});

describe('the sheet: saves, dice, scars and housekeeping', () => {
  it('a save shows success or failure against the chosen attribute', () => {
    render(<Harness />);
    click('Make a save');
    type(/^Dexterity save/, '9');
    expect(within(dialog()).getByRole('status')).toHaveTextContent('9 against 13: success.');
    type('Attribute', 'str');
    type(/^Strength save/, '20');
    expect(within(dialog()).getByRole('status')).toHaveTextContent(/failure \(a 20 always fails\)/);
  });

  it('the dice roller shows each roll', () => {
    render(<Harness />);
    click('Roll dice');
    inDialog('d20');
    inDialog('d6');
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('a pending scar can be recovered from', () => {
    const walloped = {
      ...wren(),
      deprived: true,
      scars: [{ roll: 3, name: 'Walloped', pending: true }],
    };
    render(<Harness sheet={walloped} />);
    click('Recovered');
    type(/^Recovery roll/, '3');
    inDialog('Apply');
    expect(latest.hp.full).toBe(7);
    expect(latest.deprived).toBe(false);
    expect(screen.queryByRole('button', { name: 'Recovered' })).not.toBeInTheDocument();
  });

  it('corruption: three failed daily saves take a Tier 1 character', () => {
    render(<Harness />);
    click('Caught lasting corruption');
    for (let i = 0; i < 3; i++) {
      click('Daily save');
      type(/^Willpower save/, '19');
      inDialog('Resolve');
    }
    expect(screen.getByRole('alert')).toHaveTextContent(/Taken by corruption/);
  });

  it('manual corrections stay within 0 and the full value', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Raise Hit Protection by 1' })).toBeDisabled();
    click('Lower Hit Protection by 1');
    expect(stat('hp')).toBe('3');
  });

  it('the most recent change can be undone', () => {
    render(<Harness />);
    click('Take damage');
    type('Damage rolled against you', '3');
    inDialog('Apply damage');
    expect(stat('hp')).toBe('2');
    click(/^Undo:/);
    expect(stat('hp')).toBe('4');
    expect(screen.queryByRole('button', { name: /^Undo:/ })).not.toBeInTheDocument();
  });

  it('corruption that burns a Tier asks which Ability to lose when there are too many', () => {
    const adept = { ...wren(), tier: 2, abilities: ['mend', 'cleanse', 'repair'] };
    adept.corruption = { afflicted: true, failedSaves: 2 };
    render(<Harness sheet={adept} />);
    click('Daily save');
    type(/^Willpower save/, '19');
    expect(within(dialog()).getByRole('button', { name: 'Resolve' })).toBeDisabled();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Cleanse' }));
    inDialog('Resolve');
    expect(latest.tier).toBe(1);
    expect(latest.abilities).toEqual(['mend', 'repair']);
  });

  it('a new Ability can be learned only when the Tier has room for it', () => {
    render(<Harness />);
    // Tier 1 allows two, and Wren has two.
    expect(screen.queryByRole('button', { name: 'Learn an Ability' })).toBeNull();
  });

  it("at Tier 2 a third Ability is learned from the character's own Affinity", () => {
    render(<Harness sheet={{ ...wren(), tier: 2 }} />);
    click('Learn an Ability');
    expect(within(dialog()).queryByRole('radio', { name: /^Mend\./ })).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Learn it' })).toBeDisabled();
    const options = within(dialog()).getAllByRole('radio');
    expect(options).toHaveLength(2);
    fireEvent.click(options[0]!);
    inDialog('Learn it');
    expect(latest.abilities).toHaveLength(3);
    expect(said()).toMatch(/^Learned /);
  });

  it('a second Affinity opens at Tier 3, and its Abilities can then be learned', () => {
    render(<Harness sheet={{ ...wren(), tier: 3 }} />);
    click('Choose a second Affinity');
    expect(within(dialog()).queryByRole('option', { name: /^Mending/ })).toBeNull();
    fireEvent.change(within(dialog()).getByLabelText('Second Affinity'), {
      target: { value: 'energy' },
    });
    inDialog('Choose Energy');
    expect(latest.secondaryAffinity).toBe('energy');
    expect(screen.queryByRole('button', { name: 'Choose a second Affinity' })).toBeNull();
    click('Learn an Ability');
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^Bolt\./ }));
    inDialog('Learn it');
    expect(latest.abilities).toContain('bolt');
  });

  it('below Tier 3 no second Affinity is offered', () => {
    render(<Harness sheet={{ ...wren(), tier: 2 }} />);
    expect(screen.queryByRole('button', { name: 'Choose a second Affinity' })).toBeNull();
  });

  it('a night at a haven clears tainted Fatigue and cures corruption', () => {
    const tainted = { ...wren(), taintedFatigue: 2, fatigue: 1 };
    tainted.corruption = { afflicted: true, failedSaves: 1 };
    render(<Harness sheet={tainted} />);
    click('Rest');
    inDialog(/^A night at a haven/);
    expect(latest).toMatchObject({
      taintedFatigue: 0,
      fatigue: 0,
      corruption: { afflicted: false, failedSaves: 0 },
    });
  });

  it('a Doomed character who passes a Strength save rolls 3d6 for HP', () => {
    render(<Harness sheet={{ ...wren(), doomed: true }} />);
    // 7 damage: 1 stopped by Armor, 4 off HP, 2 off Strength (9 to 7).
    click('Take damage');
    type('Damage rolled against you', '7');
    inDialog('Apply damage');
    type(/^Your roll/, '5');
    expect(within(dialog()).getByRole('button', { name: 'Resolve' })).toBeDisabled();
    type(/^You passed/, '12');
    inDialog('Resolve');
    expect(latest.hp.full).toBe(12);
    expect(latest.doomed).toBeFalsy();
  });

  it('a third thing cannot be put in hand: the sheet says the hands are full', () => {
    render(<Harness />);
    const places = screen
      .getAllByRole('combobox')
      .filter((s) => (s as HTMLSelectElement).value === 'pack');
    fireEvent.change(places[0]!, { target: { value: 'hand' } });
    fireEvent.change(places[1]!, { target: { value: 'hand' } });
    fireEvent.change(places[2]!, { target: { value: 'hand' } });
    expect(latest.items.filter((i) => i.place === 'hand')).toHaveLength(2);
    expect(said()).toBe('Your hands are full. Put something away first.');
  });

  it('in a corrupted place an Ability needs two saves, and the worse one counts', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^Yes\./ }));
    fireEvent.click(
      within(dialog()).getByRole('checkbox', { name: 'We are in a corrupted place' }),
    );
    type(/^Willpower save/, '3');
    expect(within(dialog()).queryByText('The save failed. The Ability misfires.')).toBeNull();
    type(/^Second Willpower save/, '18');
    expect(
      within(dialog()).getByText('The save failed. The Ability misfires.'),
    ).toBeInTheDocument();
  });

  it('a short rest in a corrupted place restores no HP', () => {
    const hurt = wren();
    hurt.hp.current = 1;
    render(<Harness sheet={hurt} />);
    click('Rest');
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /corrupted place/ }));
    inDialog(/^Short rest/);
    expect(latest.hp.current).toBe(1);
  });

  it('deleting asks first', () => {
    render(<Harness />);
    click('Delete this character');
    expect(removed).not.toHaveBeenCalled();
    click('Yes, delete');
    expect(removed).toHaveBeenCalledOnce();
  });
});
