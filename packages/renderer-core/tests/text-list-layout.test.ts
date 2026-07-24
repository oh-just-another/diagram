/**
 * List-aware text layout: indents shift lines (and shrink the wrap
 * budget), caret / click / selection geometry include the indent, and the
 * renderer draws derived markers into the indent slot.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { installBuiltinRenderers, renderScene, type RenderTarget } from "../src/index";
import { caretGeometry, layoutText, lineLeft } from "../src/text/text-editing";
import { LIST_INDENT_EM } from "../src/constants";

installBuiltinRenderers();

const measure = (s: string): number => s.length * 10;

describe("layoutText with paragraphs", () => {
  it("indents list paragraphs by (indent + 1) levels", () => {
    const layout = layoutText("a\nb", measure, {
      fontSize: 10,
      paragraphs: [{ list: "bullet" }, { list: "bullet", indent: 1 }],
    });
    const em = LIST_INDENT_EM * 10;
    expect(layout.lines[0]?.indentX).toBe(em);
    expect(layout.lines[1]?.indentX).toBe(2 * em);
    // blockWidth covers width + indent.
    expect(layout.blockWidth).toBe(10 + 2 * em);
  });

  it("keeps plain paragraphs at zero indent and marks paragraph-first lines", () => {
    const layout = layoutText("aaaa bbbb\nc", measure, {
      fontSize: 10,
      maxWidth: 60,
      paragraphs: [{ list: "numbered" }],
    });
    // Paragraph 0 wraps into two lines: only the first carries paraFirst.
    const p0 = layout.lines.filter((l) => l.para === 0);
    expect(p0.length).toBeGreaterThan(1);
    expect(p0[0]?.paraFirst).toBe(true);
    expect(p0[1]?.paraFirst).toBe(false);
    const p1 = layout.lines.find((l) => l.para === 1);
    expect(p1?.indentX).toBe(0);
    expect(p1?.paraFirst).toBe(true);
  });

  it("wrap budget shrinks by the indent", () => {
    const plain = layoutText("aaaa bbbb", measure, { fontSize: 10, maxWidth: 90 });
    const listed = layoutText("aaaa bbbb", measure, {
      fontSize: 10,
      maxWidth: 90,
      paragraphs: [{ list: "bullet" }],
    });
    // 90px fits "aaaa bbbb" plain (width 90), but not with a 14px indent.
    expect(plain.lines).toHaveLength(1);
    expect(listed.lines.length).toBeGreaterThan(1);
  });

  it("caret geometry includes the indent via lineLeft", () => {
    const layout = layoutText("ab", measure, {
      fontSize: 10,
      paragraphs: [{ list: "bullet" }],
    });
    const caret = caretGeometry(layout, 0, measure, 10, "left");
    const em = LIST_INDENT_EM * 10;
    expect(caret.x).toBe(em);
    expect(lineLeft(layout.lines[0]!, layout.blockWidth, "left")).toBe(em);
  });
});

// Recorder-based marker assertions (mirrors built-in-renderers.test.ts).
const makeRecorder = (): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText")
          return { width: typeof args[0] === "string" ? args[0].length * 10 : 0 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, calls };
};

describe("list marker rendering", () => {
  const textEl = (paragraphs: Element extends never ? never : object): Element =>
    ({
      id: elementId("t"),
      layerId: DEFAULT_LAYER_ID,
      type: "text",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      text: "one\ntwo",
      fontFamily: "Arial",
      fontSize: 10,
      ...paragraphs,
    }) as unknown as Element;

  it("draws one marker per list paragraph, before its text", () => {
    const { target, calls } = makeRecorder();
    let scene = emptyScene();
    ({ scene } = addElement(
      scene,
      textEl({ paragraphs: [{ list: "numbered" }, { list: "numbered" }] }),
    ));
    renderScene(scene, target);
    const texts = calls.filter((c) => c.method === "fillText").map((c) => c.args[0]);
    expect(texts).toContain("1.");
    expect(texts).toContain("2.");
    expect(texts).toContain("one");
    expect(texts).toContain("two");
  });

  it("draws bullets for bullet paragraphs only", () => {
    const { target, calls } = makeRecorder();
    let scene = emptyScene();
    ({ scene } = addElement(scene, textEl({ paragraphs: [{ list: "bullet" }] })));
    renderScene(scene, target);
    const texts = calls.filter((c) => c.method === "fillText").map((c) => c.args[0]);
    expect(texts.filter((t) => t === "•")).toHaveLength(1);
  });
});
