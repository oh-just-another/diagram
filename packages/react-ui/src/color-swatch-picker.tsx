import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  ELEMENT_PALETTE_LIGHT,
  ELEMENT_PALETTE_DARK,
  resolvePaletteTheme,
} from "./color-palette.js";

/**
 * Swatch grid + custom-colour picker. A row of pinned palette colours;
 * users click a swatch to pick, or click the `+` button to open a
 * native colour picker for anything outside the palette. The
 * "transparent" swatch shows a checkerboard pattern and reports `null`
 * upstream.
 *
 * Each cell is a fixed 26 × 26 box: a 24 × 24 colour fill sits
 * centred inside, with 1 px of breathing room. On hover the fill
 * grows to the full 26 × 26 (no layout shift — the cell itself
 * stays at 26). Selected cells get a 2-px tonal ring on the cell
 * border so the ring sits outside the fill, not over it.
 *
 * Default palette is theme-aware — when `palette` is omitted, the
 * picker reads from the OS theme (via `prefers-color-scheme`) and
 * picks the appropriate light / dark palette.
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
    <div className="du-swatch-grid" role="radiogroup" aria-label="Colour">
      {resolved.map((c) => (
        <Swatch
          key={c}
          color={c}
          selected={normalise(c) === normalise(value)}
          onClick={() => {
            onChange(c === "transparent" ? null : c);
          }}
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
          onClick={() => {
            onChange(null);
          }}
          className="du-swatch du-swatch-clear"
        >
          <span className="du-swatch-fill du-swatch-fill-blank">
            <X size={12} strokeWidth={2} />
          </span>
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
      className="du-swatch"
    >
      <span
        className="du-swatch-fill"
        style={{
          background: isTransparent
            ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px"
            : color,
        }}
      />
    </button>
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
  const hasColour = !!value && value !== "transparent";
  return (
    <label className="du-swatch du-swatch-custom" title="Pick custom colour">
      <span className="du-swatch-fill" style={hasColour ? { background: value } : undefined}>
        {hasColour ? null : <Plus size={12} strokeWidth={2} />}
      </span>
      <input
        type="color"
        aria-label="Custom colour"
        value={normaliseHex(value)}
        onChange={(ev) => {
          onChange(ev.target.value);
          onOpenChange(false);
        }}
        onClick={() => {
          onOpenChange(!open);
        }}
        className="du-swatch-color-input"
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
  return resolvePaletteTheme("system") === "dark" ? ELEMENT_PALETTE_DARK : ELEMENT_PALETTE_LIGHT;
};
