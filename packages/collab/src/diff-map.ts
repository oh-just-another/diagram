import type * as Y from "yjs";

/**
 * Apply the delta between two ReadonlyMaps into a `Y.Map`. Keys gone from
 * `after` are deleted; keys whose value changed (by identity) are set.
 * Wrap the call in a `Y.Doc` transaction at the call site so peers receive
 * a single coalesced update.
 */
export const diffMapInto = <V>(
  before: ReadonlyMap<string, V>,
  after: ReadonlyMap<string, V>,
  target: Y.Map<V>,
): void => {
  for (const [id] of before) {
    if (!after.has(id)) target.delete(id);
  }
  for (const [id, value] of after) {
    if (before.get(id) !== value) target.set(id, value);
  }
};
