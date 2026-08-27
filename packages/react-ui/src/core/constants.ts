/**
 * Tunable visual sizes for the React UI panels and toolbar. Pixel values,
 * overridable via component props when a host wants a different layout —
 * these are the defaults baked into the built-in panels.
 */
import { UI_ACCENT } from "@oh-just-another/tokens";

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

/**
 * Lucide icon sizing — one set for the whole chrome so a 40-px control, a
 * menu row and a chip all read at the same weight, and every glyph lands
 * on the pixel grid. Lucide draws on a 24-unit grid with a 2-unit stroke:
 * only whole multiples keep that geometry on device pixels — 24 (1:1) and
 * 12 (×½, stroke 2 → 1-px lines). Any other size (20, 16, 14 …) scales the
 * grid fractionally and every edge lands between pixels, which reads
 * blurry at 1× and 2× alike.
 * - `CONTROL_ICON` — glyph inside a 40-px control (toolbar buttons, the
 *   selection panel, panel headers, dialog buttons): 24 / 2.
 * - `ROW_ICON` — leading icon of a menu / list row (24-px gutter): 20 / 2 —
 *   a step below the controls by design; the ×⅚ scale costs a little
 *   crispness, the trade the menus make for a lighter row.
 * - `MARK_ICON` — check / chevron marks: 12 / 2.
 * - `BADGE_ICON` — tiny glyphs inside chips and badges: 12 / 2.
 */
export const CONTROL_ICON_SIZE = 24;
export const CONTROL_ICON_STROKE = 2;
export const ROW_ICON_SIZE = 20;
export const ROW_ICON_STROKE = 2;
export const MARK_ICON_SIZE = 12;
export const MARK_ICON_STROKE = 2;
export const BADGE_ICON_SIZE = 12;
export const BADGE_ICON_STROKE = 2;
/** Drop glyph in the centre of the file-drop overlay. */
export const DROP_OVERLAY_ICON_SIZE = 48;
export const ICON_STROKE = 2;
export const CONTROL_ICON = { size: CONTROL_ICON_SIZE, strokeWidth: CONTROL_ICON_STROKE } as const;
export const ROW_ICON = { size: ROW_ICON_SIZE, strokeWidth: ROW_ICON_STROKE } as const;
export const MARK_ICON = { size: MARK_ICON_SIZE, strokeWidth: MARK_ICON_STROKE } as const;
export const BADGE_ICON = { size: BADGE_ICON_SIZE, strokeWidth: BADGE_ICON_STROKE } as const;

/** Pixel side of the colour swatches inside the property panel. */
export const PROPERTY_SWATCH_SIZE = 12;

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
/** Minimum distance a popover keeps from the viewport edges (px). Range: 4–16. */
export const POPOVER_VIEWPORT_PADDING_PX = 6;
/**
 * Minimum distance the context menu (and its submenus) keeps from the
 * viewport edges — matches the side inset of the static toolbars, so a menu
 * pushed against an edge lines up with the docked chrome. The menu is
 * clamped to the WINDOW, not the canvas: it may overhang an embedded
 * canvas, and when the window is shorter than the menu it scrolls.
 * Range: 8–24.
 */
export const MENU_VIEWPORT_PADDING_PX = 16;

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

/**
 * Screen-pixel padding left around a search match when the overlay frames
 * it with `zoomToSelection`. Larger than the selection default so a small
 * matched shape isn't zoomed in uncomfortably tight. Range: 40–320.
 */
export const SEARCH_ZOOM_PADDING_PX = 160;
/**
 * Minimap overview panel defaults. The `<Minimap>` renders the whole scene
 * scaled into a small canvas plus a frame for the current viewport; hosts
 * override the size via `width` / `height` props.
 *
 * - `MINIMAP_WIDTH_PX` / `MINIMAP_HEIGHT_PX` — default canvas size in CSS px.
 * - `MINIMAP_PADDING_PX` — inner margin kept clear around the fitted scene so
 *   shapes at the edge aren't clipped. Range: 0–32.
 * - `MINIMAP_IDLE_MS` — the overview repaints only once the editor has been
 *   quiet for this long: never during a drag / pan / pinch / wheel burst, so
 *   the minimap costs nothing while the user is moving things, and once
 *   right after. Range: 50–300.
 * - `MINIMAP_BACKGROUND` / `MINIMAP_ELEMENT_COLOR` / `MINIMAP_ELEMENT_OPACITY` —
 *   the overview is a schematic: white paper with every element's box in the
 *   system accent colour (no real rendering).
 * - `MINIMAP_FRAME_COLOR` / `MINIMAP_FRAME_LINE_WIDTH` — stroke of the current
 *   viewport rectangle drawn over the overview.
 * - `MINIMAP_FRAME_FILL` — translucent wash inside the viewport rectangle.
 * - `MINIMAP_WHEEL_ZOOM_SPEED` / `MINIMAP_WHEEL_ZOOM_MAX_STEP` — wheel-zoom
 *   response over the minimap, same formula as the main canvas
 *   (`factor = 1 − clamp(|deltaY|, MAX_STEP)·SPEED / 100`). MAX_STEP keeps a
 *   mouse notch a calm step while trackpad deltas stay granular.
 */
export const MINIMAP_WIDTH_PX = 200;
export const MINIMAP_HEIGHT_PX = 150;
export const MINIMAP_PADDING_PX = 8;
export const MINIMAP_IDLE_MS = 120;
export const MINIMAP_BACKGROUND = "#ffffff";
export const MINIMAP_ELEMENT_COLOR: string = UI_ACCENT.light.accent;
export const MINIMAP_ELEMENT_OPACITY = 0.55;
/** Viewport frame on the minimap — the shared chrome accent (iris9). */
export const MINIMAP_FRAME_COLOR: string = UI_ACCENT.light.accent;
export const MINIMAP_FRAME_LINE_WIDTH = 1.5;
/** Translucent accent wash inside the frame; rgb matches the accent hex. */
export const MINIMAP_FRAME_FILL = "rgba(91, 91, 214, 0.12)";
export const MINIMAP_WHEEL_ZOOM_SPEED = 1;
export const MINIMAP_WHEEL_ZOOM_MAX_STEP = 10;

export const TEXT_FONT_STACKS: readonly { readonly label: string; readonly value: string }[] = [
  // Labels map to the three fonts embedded in the WASM MSDF shaper
  // (sans / serif / mono). Canvas2D resolves the same stacks against
  // real system fonts. Keep the family keywords ("serif", "mono") in
  // each value so the shaper's resolver picks the right embedded font.
  { label: "Sans", value: "system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
];

/**
 * Drawing / eraser tool-options panel. `DRAWING_PANEL_WIDTH` is the floating
 * panel width in CSS px; `BRUSH_WIDTH_MIN` / `BRUSH_WIDTH_MAX` bound the width
 * slider (also the eraser radius). The stored brush width is a half-width in
 * world px, so the max stays modest.
 */
export const DRAWING_PANEL_WIDTH = 176;
export const BRUSH_WIDTH_MIN = 1;
export const BRUSH_WIDTH_MAX = 40;

/**
 * Quick-pick emoji shared by the emoji-element picker and the sticky
 * reaction bar. Order is display order.
 */
export const EMOJI_QUICK_PICKS: readonly string[] = [
  "😀",
  "😂",
  "😍",
  "🤔",
  "😎",
  "🙌",
  "👍",
  "👎",
  "👏",
  "🔥",
  "❤️",
  "💡",
  "⭐",
  "✅",
  "❌",
  "⚠️",
  "❓",
  "🎉",
  "🚀",
  "👀",
];

/**
 * How long the viewport must stay still before canvas-anchored DOM
 * overlays (link badges, sticky reactions) reappear after a pan/zoom.
 * Reasonable range 80–300 ms.
 */
export const VIEWPORT_QUIET_MS = 150;

/**
 * How long after an element gesture (move / resize / rotate) ends before
 * the floating selection toolbar reappears. During the gesture the
 * toolbar is hidden entirely — repositioning it (floating-ui
 * autoUpdate + React re-render) on every frame of a drag costs more
 * than the whole canvas repaint. Reasonable range 100–400 ms.
 */
export const GESTURE_QUIET_MS = 100;

/**
 * Default corner radius for a freshly applied rounded-rect image mask,
 * as a fraction of the shorter box side (0..0.5). The mask popover's
 * slider adjusts it per shape afterwards.
 */
export const IMAGE_MASK_DEFAULT_RADIUS = 0.2;
