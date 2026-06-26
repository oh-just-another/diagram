import type { FractionalIndex } from "fractional-keys";

/** Compare by fractional `order`, ascending (bottom-to-top z-order). */
export const byOrderAsc = <T extends { readonly order: FractionalIndex }>(a: T, b: T): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

/** Compare by fractional `order`, descending (top-to-bottom). */
export const byOrderDesc = <T extends { readonly order: FractionalIndex }>(a: T, b: T): number =>
  byOrderAsc(b, a);
