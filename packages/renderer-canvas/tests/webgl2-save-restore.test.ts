import { describe, expect, it } from "vitest";
import { WebGL2Target } from "../src/webgl2/webgl2-target";

/**
 * WebGL2Target.save()/restore() snapshot the FULL paint state (opacity,
 * fill, stroke, …), matching Canvas2D's `ctx.save/restore` contract —
 * not just the transform. Otherwise opacity set inside a
 * save()…restore() block leaks onto everything drawn afterwards.
 *
 * The real GPU is unavailable in jsdom, so the target is driven with a
 * Proxy GL stub that lets the constructor finish (shaders "compile",
 * uniforms resolve). Sharp-rect fills are now deferred into the
 * instanced batcher, so the effective alpha is read back from the
 * per-instance buffer the pipeline uploads on flush (packed at float
 * index 9 of each 10-float instance) rather than from a `uniform1f`
 * call. `fillUnitRect` flushes after each fill so exactly one instance
 * is captured.
 */
const INSTANCE_FLOATS = 10;
const ALPHA_OFFSET = 9;

const makeStubGl = (opacityCalls: number[]) => {
  const record = (_target: unknown, data: unknown) => {
    // Only the instance uploads carry 10-float instances; the static
    // unit-quad upload (8 floats) is ignored.
    if (
      (data instanceof Float32Array || Array.isArray(data)) &&
      data.length >= INSTANCE_FLOATS &&
      data.length % INSTANCE_FLOATS === 0
    ) {
      opacityCalls.push((data as ArrayLike<number>)[ALPHA_OFFSET] as number);
    }
  };
  const base: Record<string, unknown> = {
    // Records the effective alpha packed into each drawn rect instance.
    bufferData: (target: unknown, data: unknown) => {
      record(target, data);
    },
    bufferSubData: (_target: unknown, _offset: unknown, data: unknown) => {
      record(_target, data);
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
  // Drain the batch so the single queued instance is uploaded and its
  // packed alpha recorded.
  t.flushBatch();
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
