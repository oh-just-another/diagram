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
 * - `erase` — press-and-drag to sweep shapes under the cursor into a
 *   pending set (previewed dimmed); release deletes them all in one
 *   undo step. Never draws anything.
 * - `laser` — ephemeral presentation pointer. Press-and-drag paints a
 *   red trail that fades over a couple of seconds; nothing is written
 *   to the scene or history — it lives purely on the overlay.
 * - `eyedropper` — sample a colour. A click reads the fill (or stroke)
 *   of the shape under the cursor and applies it to the current
 *   selection, then reverts to `select` (unless the tool is locked).
 *   Never mutates geometry.
 * - `crop` — image-crop mode, entered by double-clicking an image.
 *   The overlay shows a draggable crop frame over the target image;
 *   Enter commits the crop, Escape cancels. Owned end-to-end by the
 *   editor's crop session, not the interaction machine.
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
  | "brush"
  | "erase"
  | "laser"
  | "eyedropper"
  | "crop";

export const DEFAULT_MODE: Mode = "select";
