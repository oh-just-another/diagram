import { describe, expect, it } from "vitest";
import { MsdfTextPipeline } from "../src/webgl2/webgl2-msdf-text";
import { LoopBlinnCurvePipeline } from "../src/webgl2/webgl2-curve";
import { EllipsePipeline } from "../src/webgl2/webgl2-ellipse";
import { WebGL2Target } from "../src/webgl2/webgl2-target";
import type { GlyphAtlas } from "@oh-just-another/glyph-atlas";

/**
 * VAO discipline for the WebGL2 pipelines (perf: no per-draw attribute
 * re-declaration). Each pipeline must:
 *   (a) record its vertex layout (`enableVertexAttribArray` +
 *       `vertexAttribPointer`) exactly once, at pipeline init — never
 *       again on subsequent draws;
 *   (b) bind its VAO for the draw and reset to the default VAO
 *       (`bindVertexArray(null)`) afterwards, so attribute state can't
 *       leak between pipelines.
 *
 * No GPU in the test env — a Proxy GL stub records `vertexAttribPointer`
 * counts and the `bindVertexArray` argument sequence.
 */

interface GlCallLog {
  vertexAttribPointer: number;
  bindVertexArray: unknown[];
}

const makeCountingGl = (log: GlCallLog): WebGL2RenderingContext => {
  let nextVao = 0;
  const base: Record<string, unknown> = {
    // Unique truthy handle per VAO so tests can tell them apart.
    createVertexArray: () => ({ vao: nextVao++ }),
    bindVertexArray: (vao: unknown) => {
      log.bindVertexArray.push(vao);
    },
    vertexAttribPointer: () => {
      log.vertexAttribPointer++;
    },
    getAttribLocation: () => 0,
    getUniformLocation: (_program: unknown, name: unknown) => name,
  };
  // Everything else → a no-op that doubles as a truthy handle / enum so
  // shader compile + link + buffer/texture plumbing all "succeed".
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  }) as unknown as WebGL2RenderingContext;
};

/** Minimal MSDF glyph atlas stand-in for `MsdfTextPipeline.drawText`. */
const makeFakeAtlas = (): GlyphAtlas =>
  ({
    atlasSize: 1024,
    tileSize: 32,
    range: 4,
    getOrRasterize: () => ({
      advance: 600,
      unitsPerEm: 1000,
      empty: false,
      bboxW: 500,
      bboxH: 700,
      bboxXMin: 50,
      bboxYMin: 0,
      atlasX: 0,
      atlasY: 0,
    }),
    uploadTo: () => ({}),
  }) as unknown as GlyphAtlas;

const SURFACE = { width: 800, height: 600 };
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Slice of `bindVertexArray` args appended after `from`. */
const bindsSince = (log: GlCallLog, from: number): unknown[] => log.bindVertexArray.slice(from);

describe("MSDF text pipeline VAO discipline", () => {
  it("declares attribute pointers only at init, binds VAO per draw and resets to null", () => {
    const log: GlCallLog = { vertexAttribPointer: 0, bindVertexArray: [] };
    const gl = makeCountingGl(log);
    const pipeline = new MsdfTextPipeline(gl);
    const atlas = makeFakeAtlas();

    const pointersAfterInit = log.vertexAttribPointer;
    expect(pointersAfterInit).toBe(2); // aPos + aUV, recorded into the VAO
    // Init records the layout inside the VAO and unbinds it.
    expect(log.bindVertexArray.at(-1)).toBeNull();
    const vao = log.bindVertexArray[0];
    expect(vao).toBeTruthy();

    const style = { opacity: 1, color: [0, 0, 0] as const, transform: IDENTITY };
    let mark = log.bindVertexArray.length;
    pipeline.drawText("AB", 0, 0, 16, atlas, style, SURFACE);
    expect(bindsSince(log, mark)).toEqual([vao, null]);

    mark = log.bindVertexArray.length;
    pipeline.drawText("CD", 10, 10, 16, atlas, style, SURFACE);
    expect(bindsSince(log, mark)).toEqual([vao, null]);

    // No attribute re-declaration on either draw.
    expect(log.vertexAttribPointer).toBe(pointersAfterInit);
  });
});

describe("stroke path VAO discipline (via WebGL2Target)", () => {
  it("declares attribute pointers only in the constructor, binds the dynamic VAO per stroke", () => {
    const log: GlCallLog = { vertexAttribPointer: 0, bindVertexArray: [] };
    const gl = makeCountingGl(log);
    const canvas = {
      width: 800,
      height: 600,
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;
    const target = new WebGL2Target(canvas, 800, 600);

    // Constructor: default-VAO layout (static quad) + dynamic VAO layout +
    // every eagerly-compiled pipeline's own VAO layout (rect / curve /
    // ellipse / MSDF / image quad). The exact count doesn't matter — what
    // the discipline guarantees is that NO pointer is declared after
    // construction (asserted below per stroke).
    const pointersAfterInit = log.vertexAttribPointer;
    expect(pointersAfterInit).toBeGreaterThanOrEqual(2);
    expect(log.bindVertexArray.at(-1)).toBeNull();
    const dynamicVao = log.bindVertexArray[0];
    expect(dynamicVao).toBeTruthy();

    const strokeOnce = (): void => {
      target.beginPath();
      target.moveTo(0, 0);
      target.lineTo(50, 20);
      target.lineTo(90, 80);
      target.stroke();
    };

    let mark = log.bindVertexArray.length;
    strokeOnce();
    expect(bindsSince(log, mark)).toEqual([dynamicVao, null]);

    mark = log.bindVertexArray.length;
    strokeOnce();
    expect(bindsSince(log, mark)).toEqual([dynamicVao, null]);

    // Strokes never re-declare the attribute layout.
    expect(log.vertexAttribPointer).toBe(pointersAfterInit);
  });
});

describe("Loop-Blinn curve pipeline VAO discipline", () => {
  it("declares attribute pointers only at init, binds VAO per draw and resets to null", () => {
    const log: GlCallLog = { vertexAttribPointer: 0, bindVertexArray: [] };
    const gl = makeCountingGl(log);
    const pipeline = new LoopBlinnCurvePipeline(gl);

    const pointersAfterInit = log.vertexAttribPointer;
    expect(pointersAfterInit).toBe(2); // aPos + aUVW
    const vao = log.bindVertexArray[0];

    const curves = [
      {
        kind: "q" as const,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 10 },
          { x: 10, y: 0 },
        ],
      },
    ];
    let mark = log.bindVertexArray.length;
    pipeline.draw(curves, [0, 0, 0], 1, IDENTITY, SURFACE);
    expect(bindsSince(log, mark)).toEqual([vao, null]);

    mark = log.bindVertexArray.length;
    pipeline.draw(curves, [0, 0, 0], 1, IDENTITY, SURFACE);
    expect(bindsSince(log, mark)).toEqual([vao, null]);

    expect(log.vertexAttribPointer).toBe(pointersAfterInit);
  });
});

describe("ellipse pipeline VAO discipline", () => {
  it("declares attribute pointers only at init, binds VAO per draw and resets to null", () => {
    const log: GlCallLog = { vertexAttribPointer: 0, bindVertexArray: [] };
    const gl = makeCountingGl(log);
    const pipeline = new EllipsePipeline(gl);

    const pointersAfterInit = log.vertexAttribPointer;
    expect(pointersAfterInit).toBe(2); // aPos + aLocal
    const vao = log.bindVertexArray[0];

    let mark = log.bindVertexArray.length;
    pipeline.draw(50, 50, 20, 10, [0, 0, 0], 1, IDENTITY, SURFACE);
    expect(bindsSince(log, mark)).toEqual([vao, null]);

    mark = log.bindVertexArray.length;
    pipeline.draw(60, 60, 20, 10, [0, 0, 0], 1, IDENTITY, SURFACE);
    expect(bindsSince(log, mark)).toEqual([vao, null]);

    expect(log.vertexAttribPointer).toBe(pointersAfterInit);
  });
});
