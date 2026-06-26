/** Assert a WebGL resource was created (non-null), or throw. */
export const glReq = <T>(v: T | null): T => {
  if (v === null) throw new Error("packages/renderer-canvas: WebGL resource creation failed");
  return v;
};

/** Compile a shader of `type` from `src`; `label` names the program in errors. */
export const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
  label: string,
): WebGLShader => {
  const sh = glReq(gl.createShader(type));
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`${label} shader compile failed: ${log}`);
  }
  return sh;
};

/** Link a program from compiled shaders; `label` names the program in errors. */
export const linkProgram = (
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
  label: string,
): WebGLProgram => {
  const program = glReq(gl.createProgram());
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`${label} program link failed: ${log}`);
  }
  return program;
};
