/**
 * Wire-test for the typed `editor.on(event, fn)` surface. Verifies that
 * specific events fire only when their slice flips, and that the umbrella
 * `change` runs once per `notify()`.
 */
import { describe, expect, it, vi } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const noopTarget = {
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  clear: () => {},
  setFill: () => {},
  setStroke: () => {},
  setStrokeWidth: () => {},
  setOpacity: () => {},
  setLineCap: () => {},
  setLineJoin: () => {},
  setDashArray: () => {},
  setFont: () => {},
  setTextAlign: () => {},
  setTextBaseline: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  translate: () => {},
  rotate: () => {},
  scale: () => {},
  resetTransform: () => {},
  size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (): Editor =>
  new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: emptyScene(),
  });

describe("editor typed events", () => {
  it("fires `mode` only when mode actually flips", () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.on("mode", fn);
    editor.setMode("select"); // same value
    expect(fn).not.toHaveBeenCalled();
    editor.setMode("draw-rect");
    expect(fn).toHaveBeenCalledWith("draw-rect");
    editor.setMode("draw-rect"); // re-set same → no event
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire `mode` when only viewport changed", () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.on("mode", fn);
    editor.setViewportSize(200, 200);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fires `change` once per logical update", () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.on("change", fn);
    const before = fn.mock.calls.length;
    editor.setMode("draw-rect");
    expect(fn.mock.calls.length - before).toBe(1);
  });

  it("unsubscribe via returned fn", () => {
    const editor = makeEditor();
    const fn = vi.fn();
    const off = editor.on("mode", fn);
    editor.setMode("draw-rect");
    off();
    editor.setMode("draw-ellipse");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("`subscribe()` still fires in lock-step", () => {
    const editor = makeEditor();
    const legacy = vi.fn();
    const typed = vi.fn();
    editor.subscribe(legacy);
    editor.on("change", typed);
    const lBefore = legacy.mock.calls.length;
    const tBefore = typed.mock.calls.length;
    editor.setMode("draw-rect");
    expect(legacy.mock.calls.length - lBefore).toBe(1);
    expect(typed.mock.calls.length - tBefore).toBe(1);
  });

  it("fires `viewport` on size / zoom changes", () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.on("viewport", fn);
    editor.setViewportSize(200, 200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
