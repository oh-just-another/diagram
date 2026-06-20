import type { ReactNode } from "react";
import { ButtonGroup } from "./button-group.js";
import { IconButton } from "./icon-button.js";

/**
 * Radio-style row of icon-buttons. One option highlights as "active"
 * via the same tonal `is-active` treatment toolbar buttons use. A
 * `null` value renders no active state (multi-selection mixed value).
 *
 * Used wherever a property has a small enumeration (3–4 values) of
 * icon-distinguishable options: stroke width, stroke style, line join,
 * line cap, corner roundness, alignment, etc.
 */
export interface SegmentedControlOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly icon: ReactNode;
}

export interface SegmentedControlProps<T extends string | number> {
  readonly value: T | null;
  readonly options: readonly SegmentedControlOption<T>[];
  readonly onChange: (value: T) => void;
  readonly ariaLabel?: string;
}

export const SegmentedControl = <T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) => (
  <ButtonGroup {...(ariaLabel !== undefined ? { ariaLabel } : {})}>
    {options.map((opt) => (
      <IconButton
        key={String(opt.value)}
        label={opt.label}
        active={value === opt.value}
        onClick={() => {
          onChange(opt.value);
        }}
        size="sm"
      >
        {opt.icon}
      </IconButton>
    ))}
  </ButtonGroup>
);
