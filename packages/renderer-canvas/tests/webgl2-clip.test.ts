/**
 * WebGL2 stencil clip: clip() rasterises the current path into the
 * stencil buffer with colour writes off, subsequent draws stencil-test
 * EQUAL the clip depth, and restore() erases the level and lifts the
 * test. Verified through the GL call protocol on a stub context.
 */
import { describe, expect, it } from "vitest";
import { WebGL2Target } from "../src/webgl2/webgl2-target";

const GL = {
  STENCIL_TEST: 0x0b90,
  EQUAL: 0x0202,
  KEEP: 0x1e00,
  INCR: 0x1e02,
  DECR: 0x1e03,
} as const;

const makeStubGl = (calls: { name: string; args: unknown[] }[]) => {
  const base: Record<string, unknown> = {
    STENCIL_TEST: GL.STENCIL_TEST,
    EQUAL: GL.EQUAL,
    KEEP: GL.KEEP,
    INCR: GL.INCR,
    DECR: GL.DECR,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => null,
    getProgramInfoLog: () => null,
    getExtension: () => null,
    canvas: { width: 100, height: 100 },
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return 1;
      };
    },
  });
};

const makeTarget = (calls: { name: string; args: unknown[] }[]): WebGL2Target => {
  const gl = makeStubGl(calls);
  const canvas = { width: 100, height: 100, getContext: () => gl } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

const callsOf = (calls: { name: string; args: unknown[] }[], name: string) =>
  calls.filter((c) => c.name === name);

describe("WebGL2Target clip", () => {
  it("writes the path into the stencil with colour masked off, then tests EQUAL 1", () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const t = makeTarget(calls);
    calls.length = 0;
    t.save();
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(50, 0);
    t.lineTo(50, 50);
    t.clip();
    // Install pass: colorMask(false×4) … colorMask(true×4).
    const masks = callsOf(calls, "colorMask");
    expect(masks.length).toBeGreaterThanOrEqual(2);
    expect(masks[0]?.args).toEqual([false, false, false, false]);
    expect(masks[masks.length - 1]?.args).toEqual([true, true, true, true]);
    // Install used INCR at depth 0; the active test is EQUAL depth 1.
    const funcs = callsOf(calls, "stencilFunc");
    expect(funcs.some((c) => c.args[0] === GL.EQUAL && c.args[1] === 0)).toBe(true);
    expect(funcs[funcs.length - 1]?.args[1]).toBe(1);
    const ops = callsOf(calls, "stencilOp");
    expect(ops.some((c) => c.args[2] === GL.INCR)).toBe(true);
  });

  it("restore() erases the level with DECR and disables the stencil test", () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const t = makeTarget(calls);
    t.save();
    t.beginPath();
    t.rect(0, 0, 50, 50);
    t.clip();
    calls.length = 0;
    t.restore();
    const ops = callsOf(calls, "stencilOp");
    expect(ops.some((c) => c.args[2] === GL.DECR)).toBe(true);
    const disables = callsOf(calls, "disable").filter((c) => c.args[0] === GL.STENCIL_TEST);
    expect(disables.length).toBe(1);
  });

  it("a clip on an empty path keeps drawing unclipped", () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const t = makeTarget(calls);
    calls.length = 0;
    t.save();
    t.beginPath();
    t.clip();
    expect(callsOf(calls, "stencilFunc").length).toBe(0);
    t.restore();
  });

  it("restore without clip touches no stencil state", () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const t = makeTarget(calls);
    t.save();
    calls.length = 0;
    t.restore();
    expect(callsOf(calls, "stencilOp").length).toBe(0);
  });
});
