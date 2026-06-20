import { afterEach, describe, expect, it, vi } from "vitest";
import { isWebGL2Available, isWebGPUAvailable, pickAvailableBackend } from "../src/webgpu-detect";

// vitest runs in node by default for this package — `navigator` and
// `document` are getter-only globals, so the tests stub them by
// re-defining the property on the same descriptor when needed.
const stubGlobal = (name: string, value: unknown): void => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};
const restoreGlobal = (name: string): void => {
  Object.defineProperty(globalThis, name, { value: undefined, configurable: true, writable: true });
};

describe("WebGPU / WebGL2 detection", () => {
  afterEach(() => {
    restoreGlobal("navigator");
    restoreGlobal("document");
  });

  it("isWebGPUAvailable returns false when navigator.gpu missing", async () => {
    stubGlobal("navigator", {});
    expect(await isWebGPUAvailable()).toBe(false);
  });

  it("isWebGPUAvailable returns true when requestAdapter resolves", async () => {
    stubGlobal("navigator", { gpu: { requestAdapter: () => Promise.resolve({}) } });
    expect(await isWebGPUAvailable()).toBe(true);
  });

  it("isWebGPUAvailable returns false when requestAdapter resolves null", async () => {
    stubGlobal("navigator", { gpu: { requestAdapter: () => Promise.resolve(null) } });
    expect(await isWebGPUAvailable()).toBe(false);
  });

  it("isWebGL2Available returns false in environments without document", () => {
    expect(isWebGL2Available()).toBe(false);
  });

  it("isWebGL2Available returns true when getContext('webgl2') resolves", () => {
    const fakeCanvas = { getContext: vi.fn(() => ({})) };
    stubGlobal("document", { createElement: () => fakeCanvas });
    expect(isWebGL2Available()).toBe(true);
  });

  it("pickAvailableBackend falls through to canvas2d when nothing else works", async () => {
    expect(await pickAvailableBackend(["webgl2", "canvas2d"])).toBe("canvas2d");
  });

  it("pickAvailableBackend picks webgl2 when supported", async () => {
    const fakeCanvas = { getContext: vi.fn(() => ({})) };
    stubGlobal("document", { createElement: () => fakeCanvas });
    expect(await pickAvailableBackend(["webgl2", "canvas2d"])).toBe("webgl2");
  });

  it("pickAvailableBackend maps webgpu to webgl2", async () => {
    stubGlobal("navigator", { gpu: { requestAdapter: () => Promise.resolve({}) } });
    expect(await pickAvailableBackend(["webgpu", "canvas2d"])).toBe("webgl2");
  });
});
