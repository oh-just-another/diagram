/**
 * Editor modes. The active mode dictates how a pointer-down is interpreted —
 * `select` starts a click-or-drag-or-handle gesture; `draw-rect` / `draw-ellipse`
 * start a rubber-band shape-creation gesture.
 *
 * Pan and zoom are not separate modes here — they are gestures (middle-mouse
 * drag, wheel) available in any mode.
 */
export type Mode = "select" | "draw-rect" | "draw-ellipse";

export const DEFAULT_MODE: Mode = "select";
