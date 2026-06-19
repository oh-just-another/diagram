import { describe, expect, it } from "vitest";
import { MsdfTextPipeline } from "../src/webgl2-msdf-text";

/**
 * `getUniformLocation` returns `null` for any name that isn't an ACTIVE
 * uniform in the linked program — uniforms the shader doesn't declare AND
 * declared-but-unused ones the GLSL compiler optimises out (driver-dependent).
 * Setting such a uniform via `gl.uniform*(null, …)` is a spec no-op, so the
 * pipeline must tolerate null uniform locations and only throw for genuine
 * resource-creation failures (buffers/shaders/programs = context loss).
 *
 * Regression guard for the `uAtlasSize` / `uPxRange` glReq throws that broke
 * all WebGL2 text on stricter drivers.
 */
const SHADER_UNIFORMS = new Set(["uTransform", "uColor", "uOpacity", "uPxRange", "uAtlas"]);

function makeMockGl(declared: Set<string>): WebGL2RenderingContext {
  const handle = (): unknown => ({});
  const noop = (): undefined => undefined;
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    DYNAMIC_DRAW: 7,
    FLOAT: 8,
    createShader: handle,
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: noop,
    createProgram: handle,
    attachShader: noop,
    linkProgram: noop,
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: noop,
    useProgram: noop,
    createBuffer: handle,
    bindBuffer: noop,
    bufferData: noop,
    enableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    getAttribLocation: () => 0,
    getUniformLocation: (_program: unknown, name: string) => (declared.has(name) ? handle() : null),
  };
  return gl as unknown as WebGL2RenderingContext;
}

describe("MsdfTextPipeline", () => {
  it("constructs when every uniform is active", () => {
    const gl = makeMockGl(SHADER_UNIFORMS);
    expect(() => new MsdfTextPipeline(gl)).not.toThrow();
  });

  it("tolerates inactive / optimised-out uniforms (null location, no throw)", () => {
    // Only a couple of uniforms resolve; the rest report null as if the
    // driver optimised them out. The pipeline must NOT crash — this is the
    // exact case that used to throw on the user's GPU.
    const gl = makeMockGl(new Set(["uTransform", "uAtlas"]));
    expect(() => new MsdfTextPipeline(gl)).not.toThrow();
  });

  it("still throws when a real GL resource can't be created (context loss)", () => {
    // A null buffer means context loss, not an optimised-out uniform — that
    // must still surface as a throw.
    const gl = makeMockGl(SHADER_UNIFORMS);
    (gl as unknown as { createBuffer: () => null }).createBuffer = () => null;
    expect(() => new MsdfTextPipeline(gl)).toThrow(/WebGL resource creation failed/);
  });
});
