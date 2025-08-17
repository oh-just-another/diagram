/**
 * Optional host-provided text measurer. The text bounder
 * (`getShapeLocalBounds` for `TextShape`) is otherwise purely
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
 * geometric estimate for that call.
 */
export type TextMeasurer = (
  text: string,
  fontFamily: string,
  fontSize: number,
) => number | null;

let activeMeasurer: TextMeasurer | null = null;

/** Install (or clear, with `null`) the active text measurer. */
export const setTextMeasurer = (measurer: TextMeasurer | null): void => {
  activeMeasurer = measurer;
};

/** The active text measurer, or `null` when none is installed. */
export const getTextMeasurer = (): TextMeasurer | null => activeMeasurer;
