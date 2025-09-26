/**
 * Optional host-provided text measurer. The text bounder
 * (`getShapeLocalBounds` for `TextElement`) is otherwise purely
 * geometric (`chars × fontSize × factor`), which can diverge a lot
 * from the actually-rendered width — the WebGL2 MSDF path draws with a
 * WASM-baked font whose glyph advances differ from any geometric
 * estimate, so the selection box would not hug the text.
 *
 * A host (the interaction layer) injects a measurer backed by the
 * renderer's `measureText` (which itself matches the active text
 * backend). When set, the bounder uses it for accurate width; when
 * absent (headless / tests), it falls back to the geometric estimate.
 *
 * Returns the measured width in world px, or `null` to defer to the
 * geometric estimate for that call. `opts` carries weight/style so the
 * measurer matches the *rendered* width — bold/italic change glyph
 * advances, so without it the bounds lag behind a bolded text and the
 * glyphs overflow the element box.
 */
export interface TextMeasureOpts {
  readonly bold?: boolean;
  readonly italic?: boolean;
}

export type TextMeasurer = (
  text: string,
  fontFamily: string,
  fontSize: number,
  opts?: TextMeasureOpts,
) => number | null;

let activeMeasurer: TextMeasurer | null = null;

/** Install (or clear, with `null`) the active text measurer. */
export const setTextMeasurer = (measurer: TextMeasurer | null): void => {
  activeMeasurer = measurer;
};

/** The active text measurer, or `null` when none is installed. */
export const getTextMeasurer = (): TextMeasurer | null => activeMeasurer;
