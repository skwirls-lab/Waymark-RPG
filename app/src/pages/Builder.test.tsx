import { fireEvent, render, screen } from '@testing-library/react';
import { armorValue, slotsUsed } from '@waymark/rules';
import { useState } from 'react';
import { BuilderView } from './Builder';
import { buildCharacter, emptyDraft, type Draft } from './draft';

let latest: Draft;
const finished = vi.fn();

function Harness({ start }: { start?: Partial<Draft> }) {
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft(), ...start });
  latest = draft;
  return <BuilderView draft={draft} onChange={setDraft} onFinish={finished} onCancel={() => {}} />;
}

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const nextButton = () => screen.getByRole('button', { name: /Next|Finish character/ });

beforeEach(() => finished.mockClear());

describe('the character builder', () => {
  it('step 1: needs all three attributes before moving on, and accepts typed rolls', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Attributes' })).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    type(/^Strength/, '9');
    type(/^Dexterity/, '13');
    expect(nextButton()).toBeDisabled();
    type(/^Willpower/, '11');
    expect(nextButton()).toBeEnabled();
    expect(screen.getByText('Strength 9 · Dexterity 13 · Willpower 11')).toBeInTheDocument();
  });

  it('step 1: refuses a total three dice cannot make', () => {
    render(<Harness />);
    type(/^Strength/, '19');
    expect(latest.str).toBeUndefined();
    type(/^Strength/, '2');
    expect(latest.str).toBeUndefined();
  });

  it('step 1: "Roll for me" fills in a possible result', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Roll for me' })[0]!);
    expect(latest.str).toBeGreaterThanOrEqual(3);
    expect(latest.str).toBeLessThanOrEqual(18);
  });

  it('step 1: lets two attributes be swapped', () => {
    render(<Harness start={{ str: 9, dex: 13, wil: 16 }} />);
    fireEvent.click(screen.getByLabelText('Swap Strength and Willpower'));
    expect(screen.getByText('Strength 16 · Dexterity 13 · Willpower 9')).toBeInTheDocument();
  });

  it('step 2: Hit Protection is a d6', () => {
    render(<Harness start={{ step: 1 }} />);
    expect(nextButton()).toBeDisabled();
    type(/^Hit Protection/, '7');
    expect(latest.hp).toBeUndefined();
    type(/^Hit Protection/, '4');
    expect(nextButton()).toBeEnabled();
  });

  it('step 3: needs a name and a background', () => {
    render(<Harness start={{ step: 2 }} />);
    expect(nextButton()).toBeDisabled();
    type('Name', 'Wren');
    type(/^Background/, 'Scout');
    expect(nextButton()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pick one for me' }));
    expect(latest.background).not.toBe('');
  });

  it('step 4: offers every Origin and "No Origin"', () => {
    render(<Harness start={{ step: 3 }} />);
    expect(screen.getAllByRole('radio')).toHaveLength(8);
    expect(nextButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Climber/ }));
    expect(latest.originId).toBe('climber');
    expect(nextButton()).toBeEnabled();
  });

  it('step 5: an awake gift needs an Affinity and exactly two Abilities', () => {
    render(<Harness start={{ step: 4 }} />);
    fireEvent.click(screen.getByLabelText(/^Yes\./));
    expect(nextButton()).toBeDisabled();
    type('Affinity', 'mending');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Mend\./ }));
    expect(nextButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Cleanse\./ }));
    expect(nextButton()).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /^Repair\./ })).toBeDisabled();
    expect(latest.abilities).toEqual(['mend', 'cleanse']);
  });

  it('step 5: a latent gift needs only an Affinity, and no gift needs nothing', () => {
    render(<Harness start={{ step: 4 }} />);
    fireEvent.click(screen.getByLabelText(/^Not yet\./));
    expect(nextButton()).toBeDisabled();
    type('Affinity', 'energy');
    expect(nextButton()).toBeEnabled();
    fireEvent.click(screen.getByLabelText(/^No\./));
    expect(nextButton()).toBeEnabled();
    expect(latest.affinity).toBeNull();
  });

  it('step 6: without an Origin, the kit is rolled; the rulebook example gives Wren her gear', () => {
    render(
      <Harness
        start={{
          step: 5,
          str: 9,
          dex: 13,
          wil: 11,
          hp: 4,
          name: 'Wren',
          background: 'Scout',
          originId: null,
          gift: 'none',
        }}
      />,
    );
    expect(nextButton()).toBeDisabled();
    type(/^Coins/, '10');
    type(/^Weapon/, '3');
    type(/^Armor/, '4');
    type(/^Tools/, '1');
    expect(
      screen.getByText(
        /Standard weapon \(d8\); Light armor \(1 Armor\); Rope and a grappling hook\./,
      ),
    ).toBeInTheDocument();
    fireEvent.click(nextButton());
    expect(finished).toHaveBeenCalledOnce();

    const wren = buildCharacter(latest);
    expect(slotsUsed(wren)).toBe(6);
    expect(armorValue(wren)).toBe(1);
    expect(wren.coins).toBe(10);
    expect(wren.hp).toEqual({ current: 4, full: 4 });
  });

  it('step 6: with an Origin, the kit comes from the Origin and its bonus is applied', () => {
    render(
      <Harness
        start={{
          step: 5,
          str: 9,
          dex: 13,
          wil: 11,
          hp: 4,
          name: 'Pip',
          background: 'Hunter',
          originId: 'climber',
          gift: 'none',
        }}
      />,
    );
    expect(screen.queryByLabelText(/^Weapon/)).not.toBeInTheDocument();
    type(/^Coins/, '8');
    expect(screen.getByText(/Dexterity 14/)).toBeInTheDocument();
    const pip = buildCharacter(latest);
    expect(pip.attributes.dex.full).toBe(14);
    expect(pip.items.map((i) => i.name)).toContain('Climbing hooks');
  });

  it('moves forward and back without losing what was entered', () => {
    render(<Harness start={{ str: 9, dex: 13, wil: 11 }} />);
    next();
    expect(screen.getByRole('heading', { name: 'Hit Protection' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText(/^Strength/)).toHaveValue(9);
  });
});
