import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerAnimationAdapter,
  resolveImageSource,
  unregisterAnimationAdapter,
} from "../src/animation-adapter";

describe("animation adapter registry", () => {
  afterEach(() => {
    unregisterAnimationAdapter("gif");
    unregisterAnimationAdapter("lottie");
  });

  it("resolveImageSource returns the static src when no animationKind", () => {
    const out = resolveImageSource({ src: "data:url" });
    expect(out).toBe("data:url");
  });

  it("returns the static src when the kind has no adapter registered", () => {
    const out = resolveImageSource({
      src: "fallback",
      animationKind: "unknown",
      animationData: {},
    });
    expect(out).toBe("fallback");
  });

  it("calls the adapter's getFrameAt with the timestamp", () => {
    const getFrameAt = vi.fn(() => "frame-A");
    registerAnimationAdapter({ kind: "gif", getFrameAt });
    const out = resolveImageSource(
      { src: "static", animationKind: "gif", animationData: { foo: 1 } },
      123,
    );
    expect(out).toBe("frame-A");
    expect(getFrameAt).toHaveBeenCalledWith({ foo: 1 }, 123);
  });

  it("falls back to src when the adapter throws", () => {
    registerAnimationAdapter({
      kind: "lottie",
      getFrameAt: () => {
        throw new Error("boom");
      },
    });
    const out = resolveImageSource(
      { src: "static", animationKind: "lottie", animationData: null },
      0,
    );
    expect(out).toBe("static");
  });

  it("unregisterAnimationAdapter clears the slot", () => {
    registerAnimationAdapter({ kind: "gif", getFrameAt: () => "x" });
    unregisterAnimationAdapter("gif");
    const out = resolveImageSource({
      src: "fallback",
      animationKind: "gif",
      animationData: null,
    });
    expect(out).toBe("fallback");
  });
});
