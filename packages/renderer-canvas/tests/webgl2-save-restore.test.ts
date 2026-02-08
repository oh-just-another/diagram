import { describe, expect, it } from "vitest";
import { WebGL2Target } from "../src/webgl2-target";

/**
 * WebGL2Target.save()/restore() snapshot the FULL paint state (opacity,
 * fill, stroke, …), matching Canvas2D's `ctx.save/restore` contract —
 * not just the transform. Otherwise opacity set inside a
 * save()…restore() block leaks onto everything drawn afterwards.
 *
 * The real GPU is unavailable in jsdom, so the target is driven with a
 * Proxy GL stub that lets the constructor finish (shaders "compile",
 * uniforms resolve) and records every `uniform1f` — the rect-fill path
 * emits the effective opacity through it, so we can read back what the
 * box was actually drawn with.
 */
const makeStubGl = (opacityCalls: number[]) => {
  const base: Record<string, unknown> = {
    // Records the effective opacity the rect-fill path uploads.
    uniform1f: (_loc: unknown, value: number) => {
      opacityCalls.push(value);
    },
  };
  // Every other GL member resolves to a no-op function that doubles as a
  // truthy enum / handle placeholder (createBuffer, getUniformLocation,
  // getShaderParameter → truthy so compile/link don't throw).
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  });
};

const makeTarget = (opacityCalls: number[]): WebGL2Target => {
  const gl = makeStubGl(opacityCalls);
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

const fillUnitRect = (t: WebGL2Target): void => {
  t.beginPath();
  t.rect(0, 0, 10, 10);
  t.fill();
};

describe("WebGL2Target save/restore snapshots full paint state", () => {
  it("restore() resets opacity set inside a save() block (no leak)", () => {
    const opacityCalls: number[] = [];
    const t = makeTarget(opacityCalls);
    t.setFill("#ffffff"); // fillAlpha = 1

    fillUnitRect(t); // baseline at opacity 1
    expect(opacityCalls.at(-1)).toBeCloseTo(1, 5);

    t.save();
    t.setOpacity(0.3);
    fillUnitRect(t); // dimmed inside the save block
    expect(opacityCalls.at(-1)).toBeCloseTo(0.3, 5);

    t.restore();
    fillUnitRect(t); // back to 1 after restore
    expect(opacityCalls.at(-1)).toBeCloseTo(1, 5);
  });

  it("restore() also resets fill color/alpha set inside a save() block", () => {
    const opacityCalls: number[] = [];
    const t = makeTarget(opacityCalls);
    t.setFill("#ffffff80"); // fillAlpha ≈ 0.5

    fillUnitRect(t);
    expect(opacityCalls.at(-1)).toBeCloseTo(128 / 255, 4);

    t.save();
    t.setFill("#000000"); // fillAlpha = 1 inside the block
    fillUnitRect(t);
    expect(opacityCalls.at(-1)).toBeCloseTo(1, 5);

    t.restore();
    fillUnitRect(t); // fillAlpha restored to ≈ 0.5
    expect(opacityCalls.at(-1)).toBeCloseTo(128 / 255, 4);
  });

  it("nested save/restore unwinds opacity one level at a time", () => {
    const opacityCalls: number[] = [];
    const t = makeTarget(opacityCalls);
    t.setFill("#ffffff");

    t.setOpacity(1);
    t.save();
    t.setOpacity(0.6);
    t.save();
    t.setOpacity(0.2);
    fillUnitRect(t);
    expect(opacityCalls.at(-1)).toBeCloseTo(0.2, 5);

    t.restore();
    fillUnitRect(t);
    expect(opacityCalls.at(-1)).toBeCloseTo(0.6, 5);

    t.restore();
    fillUnitRect(t);
    expect(opacityCalls.at(-1)).toBeCloseTo(1, 5);
  });
});
