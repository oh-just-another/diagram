import { describe, expect, it, vi } from "vitest";
import { compileShader, glReq, linkProgram } from "../src/webgl-helpers";

const COMPILE_STATUS = 0x8b81;
const LINK_STATUS = 0x8b82;

/**
 * Minimal fake WebGL2 context — only the methods/constants used by
 * webgl-helpers. `shaderOk`/`programOk` flip the compile/link result;
 * `infoLog` is returned by the *InfoLog getters.
 */
const makeGl = (opts?: {
  shaderOk?: boolean;
  programOk?: boolean;
  infoLog?: string | null;
  createShaderResult?: WebGLShader | null;
  createProgramResult?: WebGLProgram | null;
}) => {
  const shaderOk = opts?.shaderOk ?? true;
  const programOk = opts?.programOk ?? true;
  const infoLog = opts?.infoLog ?? "boom";
  const shader = { __tag: "shader" } as unknown as WebGLShader;
  const program = { __tag: "program" } as unknown as WebGLProgram;

  const gl = {
    COMPILE_STATUS,
    LINK_STATUS,
    createShader: vi.fn(() =>
      "createShaderResult" in (opts ?? {}) ? (opts?.createShaderResult ?? null) : shader,
    ),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn((_sh: WebGLShader, pname: number) =>
      pname === COMPILE_STATUS ? shaderOk : false,
    ),
    getShaderInfoLog: vi.fn(() => infoLog),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() =>
      "createProgramResult" in (opts ?? {}) ? (opts?.createProgramResult ?? null) : program,
    ),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_p: WebGLProgram, pname: number) =>
      pname === LINK_STATUS ? programOk : false,
    ),
    getProgramInfoLog: vi.fn(() => infoLog),
    deleteProgram: vi.fn(),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, raw: gl, shader, program };
};

describe("glReq", () => {
  it("returns the value when non-null", () => {
    const obj = {};
    expect(glReq(obj)).toBe(obj);
    expect(glReq(0)).toBe(0);
    expect(glReq("")).toBe("");
    expect(glReq(false)).toBe(false);
  });

  it("throws when the value is null", () => {
    expect(() => glReq<unknown>(null)).toThrow(/WebGL resource creation failed/);
  });
});

describe("compileShader", () => {
  it("compiles and returns the shader on success", () => {
    const { gl, raw, shader } = makeGl({ shaderOk: true });
    const src = "void main(){}";
    const result = compileShader(gl, 0x8b31 /* VERTEX_SHADER */, src, "myShader");

    expect(result).toBe(shader);
    expect(raw.createShader).toHaveBeenCalledWith(0x8b31);
    expect(raw.shaderSource).toHaveBeenCalledWith(shader, src);
    expect(raw.compileShader).toHaveBeenCalledWith(shader);
    expect(raw.deleteShader).not.toHaveBeenCalled();
  });

  it("throws (with label + info log) and deletes the shader on compile failure", () => {
    const { gl, raw, shader } = makeGl({ shaderOk: false, infoLog: "syntax error" });
    expect(() => compileShader(gl, 0, "src", "vertLabel")).toThrow(
      /vertLabel shader compile failed: syntax error/,
    );
    expect(raw.deleteShader).toHaveBeenCalledWith(shader);
  });

  it("throws via glReq when createShader returns null", () => {
    const { gl } = makeGl({ createShaderResult: null });
    expect(() => compileShader(gl, 0, "src", "label")).toThrow(/WebGL resource creation failed/);
  });
});

describe("linkProgram", () => {
  it("links and returns the program on success", () => {
    const { gl, raw, program } = makeGl({ programOk: true });
    const vert = {} as WebGLShader;
    const frag = {} as WebGLShader;
    const result = linkProgram(gl, vert, frag, "myProg");

    expect(result).toBe(program);
    expect(raw.attachShader).toHaveBeenCalledWith(program, vert);
    expect(raw.attachShader).toHaveBeenCalledWith(program, frag);
    expect(raw.linkProgram).toHaveBeenCalledWith(program);
    expect(raw.deleteProgram).not.toHaveBeenCalled();
  });

  it("throws (with label + info log) and deletes the program on link failure", () => {
    const { gl, raw, program } = makeGl({ programOk: false, infoLog: "link oops" });
    expect(() => linkProgram(gl, {} as WebGLShader, {} as WebGLShader, "progLabel")).toThrow(
      /progLabel program link failed: link oops/,
    );
    expect(raw.deleteProgram).toHaveBeenCalledWith(program);
  });

  it("throws via glReq when createProgram returns null", () => {
    const { gl } = makeGl({ createProgramResult: null });
    expect(() => linkProgram(gl, {} as WebGLShader, {} as WebGLShader, "label")).toThrow(
      /WebGL resource creation failed/,
    );
  });
});
