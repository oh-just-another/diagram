import type { CSSProperties } from "react";

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  /** Accessible name (the visible label usually sits beside the switch). */
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Pill toggle (`role="switch"`): accent track with a sliding knob when on,
 * neutral track when off. Used for on/off settings inside menus.
 */
export const Switch = ({
  checked,
  onChange,
  ariaLabel,
  disabled,
  className,
  style,
}: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    className={`du-switch${checked ? " is-on" : ""}${className ? ` ${className}` : ""}`}
    style={style}
    onClick={(ev) => {
      ev.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
  >
    <span className="du-switch-knob" aria-hidden />
  </button>
);
