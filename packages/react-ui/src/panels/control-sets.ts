/**
 * Selection-toolbar control sets.
 *
 * Every element type declares the ordered controls it offers, once for a
 * single selection and once for a multi-selection (the "multi" set is the
 * single set minus what makes no sense for several elements — hyperlink,
 * list type, per-file image actions …). A selection of ≥2 elements shows the
 * INTERSECTION of the members' multi sets, so two shapes get the full shape
 * set, a shape + a text share the text-carrier controls, and a shape + a
 * frame share nothing but the tail. Separators are kept where the first
 * member had them and collapse when their cluster empties.
 *
 * The model is deliberately free of React: entries carry an id (the
 * intersection key) and an opaque payload the panel turns into a control.
 */

/** Cluster separator marker. */
export const SEPARATOR = "separator" as const;

export interface ControlEntry<T> {
  readonly id: string;
  readonly payload: T;
}

export type ControlSetEntry<T> = ControlEntry<T> | typeof SEPARATOR;

/** One element's contribution: always-visible row + overflow (mobile ⋮ sheet). */
export interface ControlSet<T> {
  readonly primary: readonly ControlSetEntry<T>[];
  readonly overflow: readonly ControlSetEntry<T>[];
}

export type ControlMode = "single" | "multi";

const idsOf = <T>(entries: readonly ControlSetEntry<T>[]): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const e of entries) if (e !== SEPARATOR) ids.add(e.id);
  return ids;
};

/**
 * Drop separators that would not sit between two controls: leading,
 * trailing, and runs of several in a row.
 */
export const collapseSeparators = <T>(
  entries: readonly ControlSetEntry<T>[],
): ControlSetEntry<T>[] => {
  const out: ControlSetEntry<T>[] = [];
  for (const e of entries) {
    if (e === SEPARATOR) {
      if (out.length === 0 || out[out.length - 1] === SEPARATOR) continue;
      out.push(e);
    } else {
      out.push(e);
    }
  }
  while (out.length > 0 && out[out.length - 1] === SEPARATOR) out.pop();
  return out;
};

const intersectEntries = <T>(
  first: readonly ControlSetEntry<T>[],
  others: readonly ReadonlySet<string>[],
): ControlSetEntry<T>[] =>
  collapseSeparators(first.filter((e) => e === SEPARATOR || others.every((ids) => ids.has(e.id))));

/**
 * Intersect control sets by entry id, keeping the first set's order, row
 * placement and payloads. The primary / overflow split is a layout concern
 * (what the mobile sheet hides), so an id counts as shared wherever the
 * other sets carry it. A single set is returned as is (separators
 * collapsed); an empty input yields empty rows.
 */
export const intersectControlSets = <T>(sets: readonly ControlSet<T>[]): ControlSet<T> => {
  const first = sets[0];
  if (first === undefined) return { primary: [], overflow: [] };
  const others = sets.slice(1).map((s) => idsOf([...s.primary, ...s.overflow]));
  return {
    primary: intersectEntries(first.primary, others),
    overflow: intersectEntries(first.overflow, others),
  };
};
