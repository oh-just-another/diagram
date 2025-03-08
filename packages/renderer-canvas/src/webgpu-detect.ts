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

export const isWebGL2Available = (): boolean => {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return gl !== null;
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
    if (choice === "webgpu") {
      if (await isWebGPUAvailable()) return "webgl2"; // best surrogate today
      continue;
    }
  }
  return "canvas2d";
};
