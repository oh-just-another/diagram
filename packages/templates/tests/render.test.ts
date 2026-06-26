import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYER_ID,
  type TemplateElement as SceneTemplateElement,
} from "@oh-just-another/scene";
import { elementId } from "@oh-just-another/types";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import { defaultRichRegistry } from "../src/rich/registry";
import { defineRichTemplate } from "../src/rich/define";
import { renderTemplateElement } from "../src/rich/render";
import type { TemplateNode } from "../src/rich/node";

/**
 * A recording `RenderTarget`: every method is a `vi.fn()` so tests can assert
 * the exact draw-call sequence the painters emit. `measureText` is mocked with
 * a deterministic width (chars × 6) so truncation/centering math is stable.
 */
interface FakeTarget extends RenderTarget {
  readonly calls: { readonly method: string; readonly args: readonly unknown[] }[];
}

const CHAR_W = 6;

const makeTarget = (): FakeTarget => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const rec =
    (method: string) =>
    (...args: unknown[]): undefined => {
      calls.push({ method, args });
      return undefined;
    };
  const target = {
    calls,
    setFill: vi.fn(rec("setFill")),
    setStroke: vi.fn(rec("setStroke")),
    setStrokeWidth: vi.fn(rec("setStrokeWidth")),
    setOpacity: vi.fn(rec("setOpacity")),
    setLineCap: vi.fn(rec("setLineCap")),
    setLineJoin: vi.fn(rec("setLineJoin")),
    setDashArray: vi.fn(rec("setDashArray")),
    setFont: vi.fn(rec("setFont")),
    setTextAlign: vi.fn(rec("setTextAlign")),
    setTextBaseline: vi.fn(rec("setTextBaseline")),
    save: vi.fn(rec("save")),
    restore: vi.fn(rec("restore")),
    translate: vi.fn(rec("translate")),
    rotate: vi.fn(rec("rotate")),
    scale: vi.fn(rec("scale")),
    setTransform: vi.fn(rec("setTransform")),
    resetTransform: vi.fn(rec("resetTransform")),
    beginPath: vi.fn(rec("beginPath")),
    closePath: vi.fn(rec("closePath")),
    moveTo: vi.fn(rec("moveTo")),
    lineTo: vi.fn(rec("lineTo")),
    quadraticCurveTo: vi.fn(rec("quadraticCurveTo")),
    bezierCurveTo: vi.fn(rec("bezierCurveTo")),
    rect: vi.fn(rec("rect")),
    ellipse: vi.fn(rec("ellipse")),
    fill: vi.fn(rec("fill")),
    stroke: vi.fn(rec("stroke")),
    fillText: vi.fn(rec("fillText")),
    measureText: vi.fn((text: string) => {
      calls.push({ method: "measureText", args: [text] });
      return { width: text.length * CHAR_W };
    }),
    drawImage: vi.fn(rec("drawImage")),
    clear: vi.fn(rec("clear")),
    size: { width: 1000, height: 1000 },
  } as unknown as FakeTarget;
  return target;
};

const shapeFor = (
  templateId: string,
  width = 200,
  height = 120,
  data: Record<string, unknown> = {},
): SceneTemplateElement => ({
  id: elementId("tmpl-1"),
  layerId: DEFAULT_LAYER_ID,
  type: "template",
  templateId,
  data,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: "a0" as SceneTemplateElement["order"],
  style: {},
  width,
  height,
});

/** Register a one-off template under a unique id and return that id. */
let counter = 0;
const register = (root: TemplateNode, defaults?: Record<string, unknown>): string => {
  const id = `test-template-${String(counter++)}`;
  defaultRichRegistry.replace(
    defineRichTemplate({
      id,
      name: id,
      category: "test",
      icon: "",
      root,
      ...(defaults ? { defaults } : {}),
    }),
  );
  return id;
};

const argsOf = (t: FakeTarget, method: string): readonly (readonly unknown[])[] =>
  t.calls.filter((c) => c.method === method).map((c) => c.args);

let target: FakeTarget;
beforeEach(() => {
  target = makeTarget();
});
afterEach(() => {
  defaultRichRegistry.clear();
});

describe("renderTemplateElement — missing template", () => {
  it("paints the red dashed placeholder when the id is unknown", () => {
    renderTemplateElement(shapeFor("does-not-exist", 100, 60), target);
    expect(target.setStroke).toHaveBeenCalledWith("#c00");
    expect(target.setDashArray).toHaveBeenCalledWith([4, 4]);
    // box drawn at (0,0,width,height)
    expect(argsOf(target, "rect")).toContainEqual([0, 0, 100, 60]);
    // dash reset back to null afterwards
    expect(target.setDashArray).toHaveBeenLastCalledWith(null);
    // label centered
    expect(argsOf(target, "fillText")).toContainEqual(["missing template: does-not-exist", 50, 30]);
  });
});

describe("paintBox (via container root)", () => {
  it("styled container fills AND strokes its box", () => {
    const id = register({
      type: "container",
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2 },
      layout: { width: 200, height: 120 },
    });
    renderTemplateElement(shapeFor(id, 200, 120), target);
    expect(target.setFill).toHaveBeenCalledWith("#fff");
    expect(target.setStroke).toHaveBeenCalledWith("#000");
    expect(target.setStrokeWidth).toHaveBeenCalledWith(2);
    expect(argsOf(target, "rect")).toContainEqual([0, 0, 200, 120]);
    expect(target.fill).toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
  });

  it("applies opacity when present", () => {
    const id = register({
      type: "container",
      style: { fill: "#abc", opacity: 0.5 },
      layout: { width: 50, height: 50 },
    });
    renderTemplateElement(shapeFor(id, 50, 50), target);
    expect(target.setOpacity).toHaveBeenCalledWith(0.5);
  });

  it("unstyled container paints no box (no rect/fill/stroke for the root)", () => {
    const id = register({ type: "container", layout: { width: 80, height: 40 } });
    renderTemplateElement(shapeFor(id, 80, 40), target);
    expect(target.rect).not.toHaveBeenCalled();
    expect(target.fill).not.toHaveBeenCalled();
    expect(target.stroke).not.toHaveBeenCalled();
  });

  it("transparent fill + zero strokeWidth → no paint", () => {
    const id = register({
      type: "container",
      style: { fill: "transparent", stroke: "transparent", strokeWidth: 0 },
      layout: { width: 80, height: 40 },
    });
    renderTemplateElement(shapeFor(id, 80, 40), target);
    expect(target.rect).not.toHaveBeenCalled();
  });

  it("fill-only box fills but never strokes", () => {
    const id = register({
      type: "container",
      style: { fill: "#0f0" },
      layout: { width: 60, height: 30 },
    });
    renderTemplateElement(shapeFor(id, 60, 30), target);
    expect(target.fill).toHaveBeenCalled();
    expect(target.stroke).not.toHaveBeenCalled();
  });

  it("stroke-only box strokes but never fills", () => {
    const id = register({
      type: "container",
      style: { stroke: "#f00", strokeWidth: 3 },
      layout: { width: 60, height: 30 },
    });
    renderTemplateElement(shapeFor(id, 60, 30), target);
    expect(target.setStrokeWidth).toHaveBeenCalledWith(3);
    expect(target.stroke).toHaveBeenCalled();
    expect(target.fill).not.toHaveBeenCalled();
  });
});

describe("paintText", () => {
  const textTemplate = (text: unknown, style: TemplateNode["style"] = {}, width = 200): string =>
    register({
      type: "container",
      layout: { width, height: 40, padding: 0 },
      children: [{ type: "text", id: "t", text: text as string, style, layout: { width } }],
    });

  it("sets font/baseline/fill and fills the text at the left edge for align=left", () => {
    const id = textTemplate("Hello", { fontSize: 14, color: "#123" });
    renderTemplateElement(shapeFor(id, 200, 40), target);
    expect(target.setTextBaseline).toHaveBeenCalledWith("top");
    expect(target.setTextAlign).toHaveBeenCalledWith("left");
    expect(target.setFill).toHaveBeenCalledWith("#123");
    const fills = argsOf(target, "fillText");
    // Left align → x = bounds.x = 0.
    expect(fills.some((a) => a[0] === "Hello" && a[1] === 0)).toBe(true);
  });

  it("center align anchors x at box center", () => {
    const id = textTemplate("Hi", { textAlign: "center" }, 100);
    renderTemplateElement(shapeFor(id, 100, 40), target);
    expect(target.setTextAlign).toHaveBeenCalledWith("center");
    const fills = argsOf(target, "fillText");
    // x = bounds.x + bounds.width/2; text bounds.width is capped at measured.
    expect(fills.some((a) => a[0] === "Hi")).toBe(true);
  });

  it("right align anchors x at box right edge", () => {
    const id = textTemplate("Hi", { textAlign: "right" }, 100);
    renderTemplateElement(shapeFor(id, 100, 40), target);
    expect(target.setTextAlign).toHaveBeenCalledWith("right");
  });

  it("falls back to default color #000 and default font when unstyled", () => {
    const id = textTemplate("X");
    renderTemplateElement(shapeFor(id, 200, 40), target);
    expect(target.setFill).toHaveBeenCalledWith("#000");
    expect(target.setFont).toHaveBeenCalledWith("system-ui, sans-serif", 14);
  });

  it("non-string text binding renders as empty string", () => {
    const id = textTemplate(123 as unknown);
    renderTemplateElement(shapeFor(id, 200, 40), target);
    const fills = argsOf(target, "fillText");
    expect(fills.some((a) => a[0] === "")).toBe(true);
  });
});

describe("paintButton", () => {
  it("draws box (fill+stroke) and centered label when label present", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 60, padding: 0 },
      children: [
        {
          type: "button",
          id: "btn",
          label: "OK",
          action: "confirm",
          style: { fill: "#eee", stroke: "#333", color: "#111", fontSize: 13 },
          layout: { width: 80, height: 30 },
        },
      ],
    });
    renderTemplateElement(shapeFor(id, 200, 60), target);
    expect(target.setFill).toHaveBeenCalledWith("#eee");
    expect(target.setStroke).toHaveBeenCalledWith("#333");
    expect(target.fill).toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
    // Label centered + middle baseline.
    expect(target.setTextAlign).toHaveBeenCalledWith("center");
    expect(target.setTextBaseline).toHaveBeenCalledWith("middle");
    expect(target.setFill).toHaveBeenCalledWith("#111");
    const fills = argsOf(target, "fillText");
    expect(fills.some((a) => a[0] === "OK")).toBe(true);
  });

  it("uses default fill/stroke/color when unstyled", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 60, padding: 0 },
      children: [
        { type: "button", id: "btn", label: "Go", action: "x", layout: { width: 80, height: 30 } },
      ],
    });
    renderTemplateElement(shapeFor(id, 200, 60), target);
    expect(target.setFill).toHaveBeenCalledWith("#f4f4f4");
    expect(target.setStroke).toHaveBeenCalledWith("#888");
    expect(target.setFill).toHaveBeenCalledWith("#222");
  });

  it("no label → box drawn but no label fillText", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 60, padding: 0 },
      children: [{ type: "button", id: "btn", action: "x", layout: { width: 80, height: 30 } }],
    });
    renderTemplateElement(shapeFor(id, 200, 60), target);
    expect(target.fill).toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
    expect(target.fillText).not.toHaveBeenCalled();
  });

  it("non-string label binding paints empty label run", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 60, padding: 0 },
      children: [
        {
          type: "button",
          id: "btn",
          label: 7 as unknown as string,
          action: "x",
          layout: { width: 80, height: 30 },
        },
      ],
    });
    renderTemplateElement(shapeFor(id, 200, 60), target);
    const fills = argsOf(target, "fillText");
    expect(fills.some((a) => a[0] === "")).toBe(true);
  });
});

describe("paintDropZone", () => {
  it("strokes a dashed border and resets the dash to null", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 120, padding: 0 },
      children: [
        {
          type: "drop-zone",
          id: "dz",
          style: { stroke: "#9c9", strokeWidth: 2 },
          layout: { width: 100, height: 80 },
        },
      ],
    });
    renderTemplateElement(shapeFor(id, 200, 120), target);
    expect(target.setStroke).toHaveBeenCalledWith("#9c9");
    expect(target.setStrokeWidth).toHaveBeenCalledWith(2);
    expect(target.setDashArray).toHaveBeenCalledWith([4, 4]);
    expect(target.stroke).toHaveBeenCalled();
    // Dash reset back to null after the dashed stroke.
    expect(target.setDashArray).toHaveBeenCalledWith(null);
  });

  it("draws the label centered when one is provided", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 120, padding: 0 },
      children: [
        {
          type: "drop-zone",
          id: "dz",
          label: "Drop here",
          layout: { width: 100, height: 80 },
        },
      ],
    });
    renderTemplateElement(shapeFor(id, 200, 120), target);
    expect(target.setTextAlign).toHaveBeenCalledWith("center");
    expect(target.setTextBaseline).toHaveBeenCalledWith("middle");
    const fills = argsOf(target, "fillText");
    expect(fills.some((a) => a[0] === "Drop here")).toBe(true);
  });

  it("uses default stroke #888 when unstyled", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 120, padding: 0 },
      children: [{ type: "drop-zone", id: "dz", layout: { width: 100, height: 80 } }],
    });
    renderTemplateElement(shapeFor(id, 200, 120), target);
    expect(target.setStroke).toHaveBeenCalledWith("#888");
  });

  it("non-string label falls back to 'Drop here'", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 120, padding: 0 },
      children: [
        {
          type: "drop-zone",
          id: "dz",
          label: 0 as unknown as string,
          layout: { width: 100, height: 80 },
        },
      ],
    });
    renderTemplateElement(shapeFor(id, 200, 120), target);
    const fills = argsOf(target, "fillText");
    expect(fills.some((a) => a[0] === "Drop here")).toBe(true);
  });

  it("no label → no fillText", () => {
    const id = register({
      type: "container",
      layout: { width: 200, height: 120, padding: 0 },
      children: [{ type: "drop-zone", id: "dz", layout: { width: 100, height: 80 } }],
    });
    renderTemplateElement(shapeFor(id, 200, 120), target);
    expect(target.fillText).not.toHaveBeenCalled();
  });
});

describe("paintIcon", () => {
  it("paints a real parsed SVG (translate/scale + path draw calls)", () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0 L24 24" stroke="#000"/></svg>';
    const id = register({
      type: "container",
      layout: { width: 48, height: 48, padding: 0 },
      children: [{ type: "icon", id: "ic", svg, layout: { width: 24, height: 24 } }],
    });
    renderTemplateElement(shapeFor(id, 48, 48), target);
    // paintSvgIcon pushes a save/translate/scale + path commands.
    expect(target.save).toHaveBeenCalled();
    expect(target.translate).toHaveBeenCalled();
    expect(target.scale).toHaveBeenCalled();
    expect(target.moveTo).toHaveBeenCalled();
    expect(target.lineTo).toHaveBeenCalled();
    expect(target.restore).toHaveBeenCalled();
  });

  it("empty svg string paints nothing", () => {
    const id = register({
      type: "container",
      layout: { width: 48, height: 48, padding: 0 },
      children: [{ type: "icon", id: "ic", svg: "", layout: { width: 24, height: 24 } }],
    });
    renderTemplateElement(shapeFor(id, 48, 48), target);
    // No icon paint at all (root unstyled, icon empty).
    expect(target.rect).not.toHaveBeenCalled();
    expect(target.moveTo).not.toHaveBeenCalled();
  });

  it("unparseable svg falls back to a hairline placeholder rect", () => {
    const id = register({
      type: "container",
      layout: { width: 48, height: 48, padding: 0 },
      children: [
        { type: "icon", id: "ic", svg: "not really svg", layout: { width: 24, height: 24 } },
      ],
    });
    renderTemplateElement(shapeFor(id, 48, 48), target);
    // Placeholder: stroke + a rect, but no path move/line from a real icon.
    expect(target.setStrokeWidth).toHaveBeenCalledWith(1);
    expect(target.rect).toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
    expect(target.moveTo).not.toHaveBeenCalled();
  });

  it("non-string svg binding paints nothing", () => {
    const id = register({
      type: "container",
      layout: { width: 48, height: 48, padding: 0 },
      children: [
        { type: "icon", id: "ic", svg: 42 as unknown as string, layout: { width: 24, height: 24 } },
      ],
    });
    renderTemplateElement(shapeFor(id, 48, 48), target);
    expect(target.moveTo).not.toHaveBeenCalled();
  });
});

describe("paintImagePlaceholder", () => {
  it("draws a filled+stroked grey placeholder", () => {
    const id = register({
      type: "container",
      layout: { width: 48, height: 48, padding: 0 },
      children: [{ type: "image", id: "img", src: "x.png", layout: { width: 24, height: 24 } }],
    });
    renderTemplateElement(shapeFor(id, 48, 48), target);
    expect(target.setFill).toHaveBeenCalledWith("#eee");
    expect(target.setStroke).toHaveBeenCalledWith("#888");
    expect(target.fill).toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
  });
});

describe("renderTemplateElement — bindings + nested tree", () => {
  it("resolves {bind:...} text from shape.data and walks the whole tree", () => {
    const id = register(
      {
        type: "container",
        style: { fill: "#fff", stroke: "#000" },
        layout: { flexDirection: "column", width: 240, height: 160, padding: 4 },
        children: [
          { type: "text", id: "title", text: { bind: "title" }, layout: { width: 200 } },
          {
            type: "button",
            id: "btn",
            label: "Run",
            action: "run",
            layout: { width: 60, height: 24 },
          },
          { type: "drop-zone", id: "dz", label: "Body", layout: { width: 200, height: 60 } },
          { type: "icon", id: "ic", svg: "", layout: { width: 16, height: 16 } },
        ],
      },
      { title: "Default Title" },
    );
    renderTemplateElement(shapeFor(id, 240, 160, { title: "Bound Title" }), target);
    const fills = argsOf(target, "fillText").map((a) => a[0]);
    // data overrides defaults
    expect(fills).toContain("Bound Title");
    expect(fills).toContain("Run");
    expect(fills).toContain("Body");
    // root box painted
    expect(argsOf(target, "rect")).toContainEqual([0, 0, 240, 160]);
  });

  it("uses template defaults when shape.data omits the key", () => {
    const id = register(
      {
        type: "container",
        layout: { width: 200, height: 40, padding: 0 },
        children: [{ type: "text", id: "t", text: { bind: "label" }, layout: { width: 200 } }],
      },
      { label: "From Defaults" },
    );
    renderTemplateElement(shapeFor(id, 200, 40, {}), target);
    const fills = argsOf(target, "fillText").map((a) => a[0]);
    expect(fills).toContain("From Defaults");
  });

  it("port child paints nothing of its own", () => {
    const id = register({
      type: "container",
      layout: { width: 100, height: 100, padding: 0 },
      children: [{ type: "port", id: "p1", layout: { position: "spot", anchor: "right" } }],
    });
    renderTemplateElement(shapeFor(id, 100, 100), target);
    // Root unstyled + port dimensionless → nothing drawn.
    expect(target.rect).not.toHaveBeenCalled();
    expect(target.fillText).not.toHaveBeenCalled();
  });
});

describe("text truncation (truncateToWidth via paintText)", () => {
  it("appends an ellipsis when the run is wider than its box", () => {
    // measureText = chars × 6. Box width 30 → fits 5 chars; "ABCDEFGHIJ" (10) overflows.
    const id = register({
      type: "container",
      layout: { width: 30, height: 40, padding: 0 },
      children: [
        {
          type: "text",
          id: "t",
          text: "ABCDEFGHIJ",
          layout: { width: 30 },
          style: { fontSize: 14 },
        },
      ],
    });
    renderTemplateElement(shapeFor(id, 30, 40), target);
    const painted = argsOf(target, "fillText").map((a) => a[0] as string);
    const run = painted.find((s) => s.includes("…"));
    expect(run).toBeDefined();
    // The painted run (incl. ellipsis) must fit within the 30px box.
    expect((run ?? "").length * CHAR_W).toBeLessThanOrEqual(30);
  });
});
