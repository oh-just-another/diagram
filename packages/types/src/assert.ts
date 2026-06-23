/**
 * Return `v` when defined, otherwise throw. For narrowing values the caller
 * knows are present (in-range array access, resolved lookups) without scattering
 * non-null assertions.
 */
export const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("required value is undefined");
  return v;
};
