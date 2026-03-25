import type { RenderTarget } from "./render-target.js";
import type { TextShaper } from "./text-shaper.js";

export interface WrapOptions {
  /** Max width in CSS pixels. */
  readonly maxWidth: number;
  /** Font size in CSS pixels — used to derive line height. */
  readonly fontSize: number;
  /** Multiplier applied to font size to derive line height. Default: 1.2. */
  readonly lineHeightFactor?: number;
  /**
   * Optional font family name — paired with `fontSize` to call
   * `shaper.measure(text, { family, size })` when a `shaper` is
   * supplied. Defaults to `"sans-serif"`. Has no effect when no
   * shaper is in play (Canvas2D's `measureText` already knows the
   * font via the host's prior `ctx.font = …` call).
   */
  readonly fontFamily?: string;
  /**
   * Optional `TextShaper` (WASM / harfbuzz / canvaskit) that
   * replaces the default `target.measureText` path. When set,
   * the wrap algorithm queries `shaper.measure(line, font)` per
   * candidate line, so layouts stay deterministic across
   * environments (server / headless / browser).
   */
  readonly shaper?: TextShaper;
}

export interface WrappedLine {
  readonly text: string;
  readonly width: number;
}

/**
 * Greedy word-wrap by `target.measureText`. Words longer than `maxWidth` are
 * placed on their own line and overflow horizontally — they are not broken.
 * Whitespace runs are collapsed; newlines (`\n`) in the input force a break.
 *
 * The caller is responsible for having set the font on the target before this
 * call. Returns an array of lines plus the effective `lineHeight` so callers
 * can compute total layout height.
 */
export const wrapText = (
  text: string,
  target: RenderTarget,
  options: WrapOptions,
): { readonly lines: readonly WrappedLine[]; readonly lineHeight: number } => {
  const { maxWidth } = options;
  const lineHeightFactor = options.lineHeightFactor ?? 1.2;

  const out: WrappedLine[] = [];
  const fontFamily = options.fontFamily ?? "sans-serif";
  const shaper = options.shaper;
  const measure = shaper
    ? (s: string) => shaper.measure(s, { family: fontFamily, size: options.fontSize }).width
    : (s: string) => target.measureText(s).width;

  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      out.push({ text: "", width: 0 });
      continue;
    }
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push({ text: "", width: 0 });
      continue;
    }

    const firstWord = words[0];
    if (firstWord === undefined) {
      out.push({ text: "", width: 0 });
      continue;
    }
    let current = firstWord;
    let currentWidth = measure(current);

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      if (word === undefined) continue;
      const candidate = `${current} ${word}`;
      const w = measure(candidate);
      if (w <= maxWidth) {
        current = candidate;
        currentWidth = w;
      } else {
        out.push({ text: current, width: currentWidth });
        current = word;
        currentWidth = measure(word);
      }
    }
    out.push({ text: current, width: currentWidth });
  }

  const lineHeight = options.fontSize * lineHeightFactor;
  return { lines: out, lineHeight };
};
