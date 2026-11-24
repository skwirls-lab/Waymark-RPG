import { randomRng, rollSum, type Die } from '@waymark/rules';
import { useId } from 'react';

export interface RollSpec {
  count: number;
  sides: Die;
  plus?: number;
}

export const notation = (s: RollSpec) =>
  `${s.count === 1 ? '' : s.count}d${s.sides}${s.plus ? `+${s.plus}` : ''}`;
export const minOf = (s: RollSpec) => s.count + (s.plus ?? 0);
export const maxOf = (s: RollSpec) => s.count * s.sides + (s.plus ?? 0);

interface Props {
  label: string;
  spec: RollSpec;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  hint?: string;
}

/**
 * One roll, two ways: tap to have the app roll, or type in what your own
 * dice showed. Every roll in the app goes through this.
 */
export function RollInput({ label, spec, value, onChange, hint }: Props) {
  const id = useId();
  const min = minOf(spec);
  const max = maxOf(spec);
  return (
    <div className="roll">
      <label htmlFor={id} className="roll-label">
        {label} <span className="dice-tag">{notation(spec)}</span>
      </label>
      {hint && <p className="hint">{hint}</p>}
      <div className="roll-row">
        <button
          type="button"
          className="button small"
          onClick={() =>
            onChange(rollSum(spec.count, spec.sides, randomRng).total + (spec.plus ?? 0))
          }
        >
          Roll for me
        </button>
        <span className="or">or</span>
        <input
          id={id}
          className="number"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          placeholder={`${min}–${max}`}
          value={value ?? ''}
          onChange={(event) => {
            const typed = Number(event.target.value);
            onChange(
              event.target.value !== '' && Number.isInteger(typed) && typed >= min && typed <= max
                ? typed
                : undefined,
            );
          }}
          aria-describedby={`${id}-range`}
        />
        <span id={`${id}-range`} className="sr-only">
          Enter a number from {min} to {max}
        </span>
      </div>
    </div>
  );
}
