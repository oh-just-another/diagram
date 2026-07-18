export { req } from "@oh-just-another/types";

/**
 * Structural equality for two read-only sets: `true` when they are the same
 * reference, or have equal size and every member of `a` is present in `b`.
 * Used by the element- and link-selection equality checks.
 */
export const setsEqual = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};
