import type { ChangeEvent } from "react";

/**
 * Native `<input type=range>` wrapped in a styled track. Drives
 * continuous numeric properties (opacity, blur, …). Optional
 * `valueLabel` shows the formatted current value alongside the track —
 * the host owns the formatter (e.g. `${Math.round(v * 100)}%`).
 *
 * `value === null` (mixed multi-selection) leaves the thumb at the
 * midpoint of the range and renders a "—" label until the user moves it.
 */
export interface SliderProps {
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
  readonly ariaLabel?: string;
  readonly valueLabel?: string;
}

export const Slider = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  valueLabel,
}: SliderProps) => {
  const handle = (ev: ChangeEvent<HTMLInputElement>): void => {
    onChange(Number(ev.target.value));
  };
  const thumbValue = value ?? (min + max) / 2;
  return (
    <div className="du-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={thumbValue}
        onChange={handle}
        aria-label={ariaLabel}
        className="du-slider-track"
      />
      <span className="du-slider-value">{value === null ? "—" : valueLabel ?? value}</span>
    </div>
  );
};
