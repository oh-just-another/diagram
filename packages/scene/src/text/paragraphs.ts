import type { TextParagraph } from "../shapes/shape.js";

/**
 * Paragraph-attribute helpers for text lists. A "paragraph" is a
 * `\n`-separated block of a text element's flat `text`; attributes
 * (`TextParagraph`) are stored in an array aligned by paragraph index.
 * These helpers keep that array consistent as the text is edited and
 * answer range queries for the toolbar.
 */

/** Number of paragraphs in `text` (always ≥ 1; empty text = one empty paragraph). */
export const paragraphCount = (text: string): number => {
  let n = 1;
  for (const ch of text) if (ch === "\n") n++;
  return n;
};

/**
 * Paragraph index range `[first, last]` (inclusive) covered by the source
 * offset range `[from, to]`. Offsets outside the text are clamped.
 */
export const paragraphRangeForOffsets = (
  text: string,
  from: number,
  to: number,
): { readonly first: number; readonly last: number } => {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(text.length, Math.max(from, to));
  // Paragraph index = newlines before the offset; `hi` may equal `text.length`
  // (caret at the very end), so the count runs over `[0, hi)` only.
  let idx = 0;
  let first = 0;
  for (let i = 0; i < hi; i++) {
    if (i === lo) first = idx;
    if (text[i] === "\n") idx++;
  }
  if (lo >= hi) first = idx;
  return { first, last: idx };
};

/** Attrs for a paragraph index (missing / short array → plain). */
export const paragraphAt = (
  paragraphs: readonly TextParagraph[] | undefined,
  index: number,
): TextParagraph => paragraphs?.[index] ?? {};

const isPlain = (p: TextParagraph): boolean => p.list === undefined && (p.indent ?? 0) === 0;

/**
 * Canonical form: trailing plain paragraphs are dropped; an all-plain
 * array collapses to `undefined` so plain text stays byte-identical on
 * the wire.
 */
export const normalizeParagraphs = (
  paragraphs: readonly TextParagraph[],
): readonly TextParagraph[] | undefined => {
  let end = paragraphs.length;
  while (end > 0 && isPlain(paragraphs[end - 1] ?? {})) end--;
  if (end === 0) return undefined;
  return paragraphs.slice(0, end);
};

/**
 * Re-align the paragraph-attribute array after a text change. Paragraphs
 * are matched by the longest common prefix and suffix of the old / new
 * paragraph lists; the edited middle keeps the first edited paragraph's
 * attrs and lets inserted paragraphs inherit them — so pressing Enter
 * inside a list item continues the list, and deleting a line drops its
 * attrs with it. Pure and heuristic by design: it has no caret input, so
 * pathological multi-paragraph pastes may inherit conservatively (plain).
 */
export const remapParagraphsForTextChange = (
  oldText: string,
  newText: string,
  paragraphs: readonly TextParagraph[] | undefined,
): readonly TextParagraph[] | undefined => {
  if (paragraphs === undefined || paragraphs.length === 0) return undefined;
  if (oldText === newText) return paragraphs;
  const oldParas = oldText.split("\n");
  const newParas = newText.split("\n");
  if (oldParas.length === newParas.length) return paragraphs; // in-line edit — indices stable

  // Longest common prefix / suffix of the paragraph LISTS (exact match).
  let prefix = 0;
  while (
    prefix < oldParas.length &&
    prefix < newParas.length &&
    oldParas[prefix] === newParas[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldParas.length - prefix &&
    suffix < newParas.length - prefix &&
    oldParas[oldParas.length - 1 - suffix] === newParas[newParas.length - 1 - suffix]
  ) {
    suffix++;
  }

  const out: TextParagraph[] = [];
  for (let i = 0; i < prefix; i++) out.push(paragraphAt(paragraphs, i));
  // The edited middle: inherit the first edited old paragraph's attrs
  // (falls back to the last prefix paragraph when the middle was empty —
  // a pure insertion continues whatever precedes it).
  const inheritFrom = Math.min(prefix, oldParas.length - 1);
  const inherited = paragraphAt(paragraphs, inheritFrom);
  const newMiddle = newParas.length - prefix - suffix;
  for (let i = 0; i < newMiddle; i++) out.push(inherited);
  for (let i = suffix; i > 0; i--) out.push(paragraphAt(paragraphs, oldParas.length - i));
  return normalizeParagraphs(out);
};

/**
 * Derived list markers, one per paragraph: `"•"` for bullets, `"N."` for
 * numbered items (consecutive numbered paragraphs at the SAME indent
 * count up; any other paragraph kind resets the counter), `null` for
 * plain paragraphs.
 */
export const listMarkers = (
  paragraphs: readonly TextParagraph[] | undefined,
  count: number,
): readonly (string | null)[] => {
  const out: (string | null)[] = [];
  const counters = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const p = paragraphAt(paragraphs, i);
    const level = p.indent ?? 0;
    if (p.list === "numbered") {
      const n = (counters.get(level) ?? 0) + 1;
      counters.set(level, n);
      // A deeper-or-equal reset boundary: nested lists restart when the
      // chain is interrupted at their own level (handled below).
      for (const key of [...counters.keys()]) if (key > level) counters.delete(key);
      out.push(`${String(n)}.`);
    } else {
      if (p.list === undefined) counters.clear();
      else for (const key of [...counters.keys()]) if (key >= level) counters.delete(key);
      out.push(p.list === "bullet" ? "•" : null);
    }
  }
  return out;
};
