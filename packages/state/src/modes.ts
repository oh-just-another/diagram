/**
 * Editor modes. The active mode dictates how a pointer-down is interpreted —
 *
 * - `select` — click-or-drag-or-handle gesture; default interaction
 *   model. Clicks select shapes; drag on empty starts a lasso; drag on
 *   a selected shape moves it.
 * - `hand` — dedicated pan mode (standard H tool). Pointer-down +
 *   drag pans the viewport regardless of what was hit; cursor reads
 *   as "grab" / "grabbing". Useful on touch or for users who don't
 *   like Space-modifier panning.
 * - `draw-rect` / `draw-ellipse` — rubber-band shape creation.
 * - `draw-text` — click places an empty text shape and opens its inline
 *   editor immediately (standard text tool).
 * - `draw-edge` — edge creation from press-down shape (or empty) to
 *   release-shape (or empty).
 * - `brush` — pressure-sensitive freehand stroke.
 *
 * Pan and zoom are STILL available as gestures (middle-mouse drag,
 * Space+drag, mouse wheel zoom) regardless of mode — `hand` is the
 * explicit single-button pan flow on top of that.
 */
export type Mode =
  | "select"
  | "hand"
  | "draw-rect"
  | "draw-ellipse"
  | "draw-text"
  | "draw-edge"
  | "draw-frame"
  | "brush";

export const DEFAULT_MODE: Mode = "select";
