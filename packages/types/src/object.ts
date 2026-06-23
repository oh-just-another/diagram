/**
 * Return a shallow copy of `obj` with every `undefined`-valued key removed.
 *
 * Useful when feeding objects to APIs under `exactOptionalPropertyTypes`, where
 * an explicit `key: undefined` differs from an absent key — zod-parsed shapes
 * and option bags built from nullable args both produce such explicit
 * `undefined`s. Shallow only: nested objects are left untouched.
 */
export const stripUndefined = <T extends object>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
};
