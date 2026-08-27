import { TEXT_PLACEHOLDERS, type TextPlaceholder } from "../constants.js";

/** FNV-1a 32-bit hash — stable across runs, cheap, good spread for short ids. */
const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

/**
 * Pick the placeholder for an empty text element. Weighted by
 * `TextPlaceholder.weight`, and DETERMINISTIC in `seed` (the element id):
 * the same element always shows the same prompt — no reshuffling between
 * frames or re-renders — while different elements spread across the list.
 */
export const pickTextPlaceholder = (
  seed: string,
  placeholders: readonly TextPlaceholder[] = TEXT_PLACEHOLDERS,
): string => {
  const total = placeholders.reduce((sum, p) => sum + Math.max(1, p.weight), 0);
  if (total <= 0 || placeholders.length === 0) return "";
  let ticket = fnv1a(seed) % total;
  for (const p of placeholders) {
    ticket -= Math.max(1, p.weight);
    if (ticket < 0) return p.text;
  }
  return placeholders[placeholders.length - 1]?.text ?? "";
};
