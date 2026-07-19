/**
 * WebGPU feature-detect adapter.
 *
 * This module lets hosts ask whether WebGPU is available and route
 * accordingly. "webgpu" is not yet in the `RendererBackend` union; a
 * `true` result from `isWebGPUAvailable()` still picks `webgl2` via
 * `pickAvailableBackend()` below.
 *
 * Detection is async because `navigator.gpu.requestAdapter()` returns a
 * promise — feature-flag presence alone isn't enough (the browser may
 * have WebGPU disabled or no compatible adapter).
 */

export const isWebGPUAvailable = async (): Promise<boolean> => {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
};

/**
 * Probe WebGL2 support without leaking a GL context. Browsers cap the
 * number of live WebGL contexts per page (~16 in Chrome); a probe that
 * creates a context and relies on GC eats one of those slots until the
 * next major GC, which can collide with the editor's own contexts (one
 * per layer). The probe asks for `WEBGL_lose_context` and calls
 * `loseContext()` right after.
 */
export const isWebGL2Available = (): boolean => {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    // Optional-chain both the method and the result — test stubs
    // hand back a bare object with no `getExtension`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- lib.dom types getExtension non-null, but test stubs omit it
    gl.getExtension?.("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
};

/**
 * Pick the best backend the runtime actually supports, given the
 * caller's preference list (in priority order). Returns the first
 * supported entry; falls back to `"canvas2d"` when none of the
 * preferred backends work. "webgpu" entries fall through to "webgl2".
 */
export const pickAvailableBackend = async (
  prefer: readonly ("webgpu" | "webgl2" | "canvas2d")[] = ["webgl2", "canvas2d"],
): Promise<"webgl2" | "canvas2d"> => {
  for (const choice of prefer) {
    if (choice === "canvas2d") return "canvas2d";
    if (choice === "webgl2") {
      if (isWebGL2Available()) return "webgl2";
      continue;
    }
    // "webgpu" falls back to "webgl2" as the best surrogate.
    if (await isWebGPUAvailable()) return "webgl2";
  }
  return "canvas2d";
};
