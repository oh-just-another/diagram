/**
 * Tunable visual sizes for the React UI panels and toolbar. Pixel values,
 * overridable via component props when a host wants a different layout —
 * these are the defaults baked into the built-in panels.
 */

/**
 * Viewport width (CSS px) at/below which the chrome switches to its mobile
 * layout (bottom-sheet property panel, etc.). Combined with `(pointer: coarse)`
 * so touch tablets also get the mobile treatment regardless of width.
 * See `useMobileLayout`.
 */
export const MOBILE_MAX_WIDTH_PX = 640;

/** Width of the left palette panel, in CSS pixels. */
export const PALETTE_WIDTH = 200;

/** Pixel side of the per-template hit area inside the palette grid. */
export const PALETTE_ITEM_SIZE = 28;

/** Width of the right property panel, in CSS pixels. */
export const PROPERTY_PANEL_WIDTH = 240;

/** Pixel side of the colour swatches inside the property panel. */
export const PROPERTY_SWATCH_SIZE = 12;

/** Width of the layer panel, in CSS pixels. */
export const LAYER_PANEL_WIDTH = 220;

/** Pixel side of the toggle icon (visibility / lock) buttons. */
export const LAYER_TOGGLE_ICON_SIZE = 20;

/** Pixel side of the per-row colour swatch in the layer panel. */
export const LAYER_SWATCH_SIZE = 22;

/** Width of the comments popover, in CSS pixels. */
export const COMMENTS_PANEL_WIDTH = 280;

/** Pixel height of the toolbar vertical separator. */
export const TOOLBAR_SEPARATOR_HEIGHT = 20;

/**
 * Default auto-dismiss time for a toast (ms). 0 / Infinity keep it
 * open until the user clicks the × — useful for sticky errors.
 */
export const TOAST_DEFAULT_DURATION_MS = 3_000;

/**
 * Maximum width of the `<HelpDialog>` modal in CSS pixels. The dialog
 * still respects the viewport via `min(this, 100vw - 64px)`.
 */
export const HELP_DIALOG_MAX_WIDTH_PX = 720;

/**
 * Delay before a `<Tooltip>` opens on first hover (ms). Short enough to
 * feel responsive on an intentional pause, long enough not to flash on a
 * pointer that's just passing through.
 */
export const TOOLTIP_OPEN_DELAY_MS = 600;

/**
 * Window after a tooltip closes during which the next hover opens the next
 * tooltip instantly — lets users scan a toolbar without waiting for each hint.
 */
export const TOOLTIP_SKIP_DELAY_MS = 600;

/**
 * Grace period before a tooltip actually hides after pointerleave.
 * Small value smooths over pointer jitter at the edge of the
 * trigger without letting stale hints linger.
 */
export const TOOLTIP_HIDE_GRACE_MS = 80;

/**
 * Distance in CSS pixels between the trigger edge and the tooltip
 * box on the side specified by the `side` prop.
 */
export const TOOLTIP_OFFSET_PX = 6;

/**
 * Floating-panel positioning defaults for the `@floating-ui/dom`-positioned
 * overlays. Each is the fallback used when the component is rendered without
 * an explicit prop, so hosts can re-tune the spacing globally here.
 *
 * - `SELECTION_PANEL_OFFSET_PX` — distance between the selection floating
 *   panel and the selected element's bbox. Range: 6–48.
 * - `SELECTION_PANEL_EDGE_INSET_*_PX` — per-side inset that shrinks the region
 *   the panel is allowed to occupy, measured from each viewport edge (fed to
 *   the `shift` middleware as a per-side `padding`). The panel starts shifting
 *   to stay inside the inset region as it approaches that edge, so it never
 *   lands over fixed chrome on that side (top toolbar, bottom zoom bar, docked
 *   side panels). Tune each side to the chrome that lives there. Range per
 *   side: 0–320.
 * - `POPOVER_OFFSET_PX` — distance between a popover and its trigger. Smaller
 *   than the selection-panel gap since a popover hangs off a control, not a
 *   shape. Range: 4–12.
 */
export const SELECTION_PANEL_OFFSET_PX = 48;
/** Inset from the TOP edge — clears the top toolbar. */
export const SELECTION_PANEL_EDGE_INSET_TOP_PX = 66;
/** Inset from the RIGHT edge. Bump it if a right-docked panel must stay clear. */
export const SELECTION_PANEL_EDGE_INSET_RIGHT_PX = 16;
/** Inset from the BOTTOM edge — clears the bottom zoom / status bar. */
export const SELECTION_PANEL_EDGE_INSET_BOTTOM_PX = 66;
/** Inset from the LEFT edge — small margin (no left-docked chrome by default). */
export const SELECTION_PANEL_EDGE_INSET_LEFT_PX = 16;
export const POPOVER_OFFSET_PX = 6;

/**
 * Text contextual-panel controls.
 *
 * - `TEXT_FONT_SIZE_PRESETS` — the S/M/L/XL quick buckets in the font
 *   size segmented control (world-unit px). The popover slider covers
 *   the full {@link TEXT_FONT_SIZE_MIN}–{@link TEXT_FONT_SIZE_MAX} range.
 * - `TEXT_FONT_SIZE_MIN` / `TEXT_FONT_SIZE_MAX` — slider clamp range.
 * - `TEXT_FONT_STACKS` — font-family choices offered in the family
 *   dropdown. `value` is written verbatim to `TextElement.fontFamily`;
 *   `label` is the human name shown in the menu.
 */
export const TEXT_FONT_SIZE_PRESETS: readonly { readonly label: string; readonly value: number }[] =
  [
    { label: "S", value: 16 },
    { label: "M", value: 24 },
    { label: "L", value: 36 },
    { label: "XL", value: 64 },
  ];
export const TEXT_FONT_SIZE_MIN = 8;
export const TEXT_FONT_SIZE_MAX = 256;
export const TEXT_FONT_STACKS: readonly { readonly label: string; readonly value: string }[] = [
  // Labels map to the three fonts embedded in the WASM MSDF shaper
  // (sans / serif / mono). Canvas2D resolves the same stacks against
  // real system fonts. Keep the family keywords ("serif", "mono") in
  // each value so the shaper's resolver picks the right embedded font.
  { label: "Sans", value: "system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
];
