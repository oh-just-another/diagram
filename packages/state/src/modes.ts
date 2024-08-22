/**
 * Editor modes. The active mode dictates how a pointer-down is interpreted —
 * `select` starts a click-or-drag-or-handle gesture; `draw-rect` /
 * `draw-ellipse` start a rubber-band shape-creation gesture; `draw-edge`
 * starts an edge from the shape under the pointer (or from a free point on
 * empty canvas) and lands it on the shape (or free point) under the cursor
 * at release.
 *
 * Pan and zoom are not separate modes here — they are gestures (middle-mouse
 * drag, wheel) available in any mode.
 */
export type Mode = "select" | "draw-rect" | "draw-ellipse" | "draw-edge";

export const DEFAULT_MODE: Mode = "select";
