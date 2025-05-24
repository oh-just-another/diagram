import { useState } from "react";
import {
  ELEMENT_PALETTE_LIGHT,
  ELEMENT_PALETTE_DARK,
  resolvePaletteTheme,
} from "./color-palette.js";

/**
 * Swatch grid + custom-colour picker. standard-style:
 * shows a row of pinned palette colours; users click a swatch to
 * pick, or click the `+` button to open a native colour picker
 * for anything outside the palette. The "transparent" swatch is
 * rendered as a checkerboard pattern and reports `null` upstream.
 *
 * Default palette is theme-aware — when `palette` prop is omitted,
 * the picker reads from the OS theme (via `prefers-color-scheme`)
 * and picks the appropriate `ELEMENT_PALETTE_LIGHT` or `_DARK`.
 * Hosts that want a fixed palette pass their own array.
 */
export interface ColorSwatchPickerProps {
  readonly value: string | null;
  readonly onChange: (color: string | null) => void;
  /** Override the bundled palette. Defaults to theme-aware element palette. */
  readonly palette?: readonly string[];
  /** Show the `+` button that opens the native colour picker. Default `true`. */
  readonly allowCustom?: boolean;
  /** Show the `×` clear button that sets value to `null`. Default `true`. */
  readonly allowClear?: boolean;
}

export const ColorSwatchPicker = ({
  value,
  onChange,
  palette,
  allowCustom = true,
  allowClear = true,
}: ColorSwatchPickerProps) => {
  const resolved = palette ?? defaultPaletteForCurrentTheme();
  const [customOpen, setCustomOpen] = useState(false);
  return (
    <div
      className="du-swatch-grid"
      role="radiogroup"
      aria-label="Colour"
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 4,
        maxWidth: 200,
      }}
    >
      {resolved.map((c) => (
        <Swatch
          key={c}
          color={c}
          selected={normalise(c) === normalise(value)}
          onClick={() => onChange(c === "transparent" ? null : c)}
        />
      ))}
      {allowCustom ? (
        <CustomSwatch
          value={value}
          onChange={onChange}
          open={customOpen}
          onOpenChange={setCustomOpen}
        />
      ) : null}
      {allowClear ? (
        <button
          type="button"
          aria-label="Clear colour"
          title="Clear colour"
          onClick={() => onChange(null)}
          style={{
            width: 18,
            height: 18,
            border: "1px solid var(--du-ui-border, #aaa)",
            borderRadius: 3,
            background: "var(--du-ui-bg-solid, #fff)",
            color: "var(--du-text-muted, #666)",
            fontSize: 11,
            lineHeight: "16px",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

const Swatch = ({
  color,
  selected,
  onClick,
}: {
  readonly color: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}) => {
  const isTransparent = color === "transparent";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={color}
      title={color}
      onClick={onClick}
      style={{
        width: 18,
        height: 18,
        borderRadius: 3,
        border: selected
          ? "2px solid var(--du-accent, #1a73e8)"
          : "1px solid var(--du-ui-border, #aaa)",
        background: isTransparent
          ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px"
          : color,
        cursor: "pointer",
        padding: 0,
      }}
    />
  );
};

/**
 * The `+` button — opens the browser's native colour picker. When
 * `value` is already a custom colour (not in palette) the trigger
 * shows that colour instead of a `+`.
 */
const CustomSwatch = ({
  value,
  onChange,
  open,
  onOpenChange,
}: {
  readonly value: string | null;
  readonly onChange: (color: string | null) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => {
  return (
    <label
      title="Pick custom colour"
      style={{
        position: "relative",
        width: 18,
        height: 18,
        borderRadius: 3,
        border: "1px solid var(--du-ui-border, #aaa)",
        background: value && value !== "transparent" ? value : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "var(--du-text-muted, #666)",
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {!value || value === "transparent" ? <span aria-hidden>+</span> : null}
      <input
        type="color"
        aria-label="Custom colour"
        value={normaliseHex(value)}
        onChange={(ev) => {
          onChange(ev.target.value);
          onOpenChange(false);
        }}
        onClick={() => onOpenChange(!open)}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: "pointer",
        }}
      />
    </label>
  );
};

const normalise = (color: string | null): string =>
  color === null ? "transparent" : color.toLowerCase();

const normaliseHex = (value: string | null): string => {
  if (!value || value === "transparent") return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const v = value.slice(1);
    return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toLowerCase();
  }
  return "#000000";
};

const defaultPaletteForCurrentTheme = (): readonly string[] => {
  if (typeof document === "undefined") return ELEMENT_PALETTE_LIGHT;
  // Respect the host's forced theme attribute when present; fall
  // back to OS preference otherwise.
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return ELEMENT_PALETTE_DARK;
  if (attr === "light") return ELEMENT_PALETTE_LIGHT;
  return resolvePaletteTheme("system") === "dark"
    ? ELEMENT_PALETTE_DARK
    : ELEMENT_PALETTE_LIGHT;
};
