import { describe, expect, it } from "vitest";
import { constrainDeltaToAxis } from "../src/editor/applies/move";

describe("constrainDeltaToAxis (Shift axis-lock for moves)", () => {
  it("keeps the dominant axis and zeroes the other", () => {
    expect(constrainDeltaToAxis({ x: 30, y: 10 })).toEqual({ x: 30, y: 0 });
    expect(constrainDeltaToAxis({ x: -8, y: 25 })).toEqual({ x: 0, y: 25 });
  });

  it("prefers horizontal on a tie", () => {
    expect(constrainDeltaToAxis({ x: 12, y: -12 })).toEqual({ x: 12, y: 0 });
  });

  it("passes a zero delta through", () => {
    expect(constrainDeltaToAxis({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
