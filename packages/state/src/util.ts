/**
 * Index-access helper for provably-valid indices: throws instead of returning
 * `undefined` so callers stay non-nullable without `!`.
 */
export const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/state: index out of range");
  return v;
};
