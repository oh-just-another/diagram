/**
 * Read a length custom property (`--du-*`) as pixels from an element's
 * computed style — for JS positioning (floating-ui offsets) that must
 * follow the CSS design tokens instead of duplicating them. `0` when the
 * token is unset or not a length.
 */
export const cssPx = (el: Element, name: string): number => {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isNaN(v) ? 0 : v;
};
