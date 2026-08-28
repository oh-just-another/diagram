import { describe, expect, it } from "vitest";
import {
  SEPARATOR,
  collapseSeparators,
  intersectControlSets,
  type ControlSet,
} from "../src/panels/control-sets.js";

const e = (id: string) => ({ id, payload: id });
const set = (primary: string[], overflow: string[] = []): ControlSet<string> => ({
  primary: primary.map((id) => (id === "|" ? SEPARATOR : e(id))),
  overflow: overflow.map((id) => (id === "|" ? SEPARATOR : e(id))),
});
const ids = (entries: readonly (ReturnType<typeof e> | typeof SEPARATOR)[]) =>
  entries.map((x) => (x === SEPARATOR ? "|" : x.id));

describe("collapseSeparators", () => {
  it("drops leading, trailing and doubled separators", () => {
    expect(
      ids(collapseSeparators([SEPARATOR, e("a"), SEPARATOR, SEPARATOR, e("b"), SEPARATOR])),
    ).toEqual(["a", "|", "b"]);
    expect(collapseSeparators([SEPARATOR, SEPARATOR])).toEqual([]);
  });
});

describe("intersectControlSets", () => {
  it("returns a single set unchanged apart from separator cleanup", () => {
    const r = intersectControlSets([set(["a", "|", "b", "|"], ["|", "c"])]);
    expect(ids(r.primary)).toEqual(["a", "|", "b"]);
    expect(ids(r.overflow)).toEqual(["c"]);
  });

  it("keeps only ids present in every set, in the first set's order", () => {
    const shape = set(["convert", "|", "font", "decor", "|", "border", "fill"], ["link"]);
    const text = set(["convert", "font", "decor", "list", "|", "color"], ["link"]);
    const r = intersectControlSets([shape, text]);
    expect(ids(r.primary)).toEqual(["convert", "|", "font", "decor"]);
    expect(ids(r.overflow)).toEqual(["link"]);
  });

  it("matches ids across rows — the row split is layout, not identity", () => {
    const shape = set(["color"], []);
    const text = set([], ["color"]);
    const r = intersectControlSets([shape, text]);
    expect(ids(r.primary)).toEqual(["color"]);
    expect(r.overflow).toEqual([]);
  });

  it("yields empty rows when nothing is shared", () => {
    const r = intersectControlSets([set(["a", "|", "b"]), set(["c"])]);
    expect(r.primary).toEqual([]);
    expect(r.overflow).toEqual([]);
  });

  it("uses the first set's payload for a shared id", () => {
    const r = intersectControlSets([
      { primary: [{ id: "x", payload: "first" }], overflow: [] },
      { primary: [{ id: "x", payload: "second" }], overflow: [] },
    ]);
    expect(r.primary).toEqual([{ id: "x", payload: "first" }]);
  });

  it("handles an empty input", () => {
    expect(intersectControlSets([])).toEqual({ primary: [], overflow: [] });
  });
});
