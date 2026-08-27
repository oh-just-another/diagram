import type { CSSProperties } from "react";

export interface SwitchProps {
  readonly checked: boolean;
  /** Toggle handler; omitted when the switch is `presentational`. */
  readonly onChange?: (next: boolean) => void;
  /** Accessible name (the visible label usually sits beside the switch). */
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  /**
   * Render a decorative `<span>` instead of a `<button>`. For a switch
   * placed inside another interactive element (a `menuitemcheckbox` row)
   * that owns the click and the ARIA state — nesting buttons is invalid
   * HTML.
   */
  readonly presentational?: boolean;
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
  presentational,
  className,
  style,
}: SwitchProps) => {
  const cls = `du-switch${checked ? " is-on" : ""}${className ? ` ${className}` : ""}`;
  if (presentational) {
    return (
      <span className={cls} style={style} aria-hidden>
        <span className="du-switch-knob" />
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cls}
      style={style}
      onClick={(ev) => {
        ev.stopPropagation();
        if (!disabled) onChange?.(!checked);
      }}
    >
      <span className="du-switch-knob" aria-hidden />
    </button>
  );
};
