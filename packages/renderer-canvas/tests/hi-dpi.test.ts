import { describe, expect, it, vi } from "vitest";
import { setupHiDpi } from "../src/hi-dpi";

const makeCanvasStub = () => {
  const ctx = {
    setTransform: vi.fn(),
  };
  const setWidth = vi.fn();
  const setHeight = vi.fn();
  // jsdom's HTMLCanvasElement.getContext returns null without a
  // canvas backend; stub the bits setupHiDpi touches.
  const state = { w: 0, h: 0 };
  const canvas = {
    get width() {
      return state.w;
    },
    set width(v: number) {
      state.w = v;
      setWidth(v);
    },
    get height() {
      return state.h;
    },
    set height(v: number) {
      state.h = v;
      setHeight(v);
    },
    style: { width: "", height: "" },
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx, setWidth, setHeight };
};

describe("setupHiDpi idempotency", () => {
  it("repeated calls with the same size do not reset canvas.width/height", () => {
    const { canvas, setWidth, setHeight, ctx } = makeCanvasStub();
    setupHiDpi(canvas, 800, 600, 2); // first time — applies
    setupHiDpi(canvas, 800, 600, 2); // second time — no-op
    setupHiDpi(canvas, 800, 600, 2); // third time — no-op
    // canvas.width / height assigned ONCE only; the width/height setter
    // clears canvas content.
    expect(setWidth).toHaveBeenCalledTimes(1);
    expect(setHeight).toHaveBeenCalledTimes(1);
    // setTransform also called just once (subsequent setupHiDpi
    // returns before getContext).
    expect(ctx.setTransform).toHaveBeenCalledTimes(1);
  });

  it("re-applies when size changes", () => {
    const { canvas, setWidth, setHeight, ctx } = makeCanvasStub();
    setupHiDpi(canvas, 800, 600, 2);
    setupHiDpi(canvas, 1200, 800, 2);
    expect(setWidth).toHaveBeenCalledTimes(2);
    expect(setHeight).toHaveBeenCalledTimes(2);
    expect(ctx.setTransform).toHaveBeenCalledTimes(2);
  });

  it("re-applies when DPR changes", () => {
    const { canvas, setWidth, setHeight, ctx } = makeCanvasStub();
    setupHiDpi(canvas, 800, 600, 2);
    setupHiDpi(canvas, 800, 600, 1); // monitor switch
    expect(setWidth).toHaveBeenCalledTimes(2);
    expect(setHeight).toHaveBeenCalledTimes(2);
    expect(ctx.setTransform).toHaveBeenCalledTimes(2);
  });
});
