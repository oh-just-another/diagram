import { describe, expect, it, vi } from "vitest";
import { RecordingTarget, replayCommands } from "../src/recording-target";

describe("RecordingTarget", () => {
  it("captures every draw call as a structured command", () => {
    const t = new RecordingTarget(100, 50);
    t.setFill("red");
    t.beginPath();
    t.rect(10, 20, 30, 40);
    t.fill();
    const cmds = t.flush();
    expect(cmds.map((c) => c.k)).toEqual(["setFill", "beginPath", "rect", "fill"]);
  });

  it("flush empties the buffer", () => {
    const t = new RecordingTarget(10, 10);
    t.save();
    t.flush();
    const next = t.flush();
    expect(next).toEqual([]);
  });

  it("peek does NOT empty the buffer", () => {
    const t = new RecordingTarget(10, 10);
    t.save();
    t.peek();
    t.peek();
    expect(t.flush().length).toBe(1);
  });

  it("skips a non-ImageBitmap drawImage and bumps skippedImageDraws", () => {
    const t = new RecordingTarget(10, 10);
    t.drawImage({} as unknown, 0, 0, 10, 10);
    t.drawImage({} as unknown, 0, 0, 10, 10);
    expect(t.skippedImageDraws).toBe(2);
    expect(t.flush()).toEqual([]);
  });

  it("records an ImageBitmap drawImage as a structured-clone-safe command", () => {
    class FakeImageBitmap {
      readonly _brand = "bitmap";
    }
    (globalThis as { ImageBitmap?: unknown }).ImageBitmap = FakeImageBitmap;
    try {
      const t = new RecordingTarget(10, 10);
      const bmp = new FakeImageBitmap();
      t.drawImage(bmp as unknown, 1, 2, 3, 4);
      expect(t.skippedImageDraws).toBe(0);
      expect(t.flush()).toEqual([{ k: "drawImage", bitmap: bmp, dx: 1, dy: 2, dw: 3, dh: 4 }]);
    } finally {
      delete (globalThis as { ImageBitmap?: unknown }).ImageBitmap;
    }
  });

  it("resize updates size and emits a resize command", () => {
    const t = new RecordingTarget(10, 10);
    t.resize(80, 40);
    expect(t.size).toEqual({ width: 80, height: 40 });
    const cmds = t.flush();
    expect(cmds[0]).toEqual({ k: "resize", w: 80, h: 40 });
  });

  it("measureText returns a positive width without buffering anything", () => {
    const t = new RecordingTarget(10, 10);
    t.setFont("Arial", 16);
    const m = t.measureText("hello");
    expect(m.width).toBeGreaterThan(0);
    // measureText must not record a command (only `setFont` did).
    expect(t.flush()).toEqual([{ k: "setFont", family: "Arial", size: 16 }]);
  });
});

describe("replayCommands", () => {
  it("invokes every RenderTarget method in the recorded order", () => {
    const calls: string[] = [];
    const fake = {
      setFill: vi.fn(() => calls.push("setFill")),
      setStroke: vi.fn(() => calls.push("setStroke")),
      setStrokeWidth: vi.fn(),
      setOpacity: vi.fn(),
      setLineCap: vi.fn(),
      setLineJoin: vi.fn(),
      setDashArray: vi.fn(),
      setFont: vi.fn(),
      setTextAlign: vi.fn(),
      setTextBaseline: vi.fn(),
      save: vi.fn(() => calls.push("save")),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      beginPath: vi.fn(() => calls.push("beginPath")),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      rect: vi.fn(() => calls.push("rect")),
      ellipse: vi.fn(),
      fill: vi.fn(() => calls.push("fill")),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      drawImage: vi.fn(),
      clear: vi.fn(),
      size: { width: 0, height: 0 },
    };
    const rec = new RecordingTarget(10, 10);
    rec.setFill("red");
    rec.save();
    rec.beginPath();
    rec.rect(0, 0, 1, 1);
    rec.fill();
    replayCommands(fake, rec.flush());
    expect(calls).toEqual(["setFill", "save", "beginPath", "rect", "fill"]);
    expect(fake.setFill).toHaveBeenCalledWith("red");
  });

  it("passes the fill rule through when provided", () => {
    const fill = vi.fn();
    const fake = stubTarget({ fill });
    const rec = new RecordingTarget(10, 10);
    rec.fill("evenodd");
    replayCommands(fake, rec.flush());
    expect(fill).toHaveBeenCalledWith("evenodd");
  });

  it("replays a drawImage command onto the target", () => {
    const drawImage = vi.fn();
    const fake = stubTarget({ drawImage });
    const bmp = {} as unknown as ImageBitmap;
    replayCommands(fake, [{ k: "drawImage", bitmap: bmp, dx: 1, dy: 2, dw: 3, dh: 4 }]);
    expect(drawImage).toHaveBeenCalledWith(bmp, 1, 2, 3, 4);
  });

  it("ignores resize commands during replay (worker owns sizing)", () => {
    const fake = stubTarget({});
    const rec = new RecordingTarget(10, 10);
    rec.resize(100, 100);
    rec.save();
    replayCommands(fake, rec.flush());
    expect(fake.save).toHaveBeenCalledOnce();
  });
});

const stubTarget = (override: Partial<Record<string, ReturnType<typeof vi.fn>>>) => {
  const base = {
    setFill: vi.fn(),
    setStroke: vi.fn(),
    setStrokeWidth: vi.fn(),
    setOpacity: vi.fn(),
    setLineCap: vi.fn(),
    setLineJoin: vi.fn(),
    setDashArray: vi.fn(),
    setFont: vi.fn(),
    setTextAlign: vi.fn(),
    setTextBaseline: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    drawImage: vi.fn(),
    clear: vi.fn(),
    size: { width: 0, height: 0 },
  };
  return { ...base, ...override };
};
