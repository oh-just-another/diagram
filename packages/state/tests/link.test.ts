import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { normalizeHref, safeHref } from "../src/editor/public/link.js";

describe("normalizeHref", () => {
  it("keeps safe http/https/mailto schemes", () => {
    expect(normalizeHref("https://x.com")).toBe("https://x.com");
    expect(normalizeHref("http://x.com")).toBe("http://x.com");
    expect(normalizeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
  it("adds https:// to a scheme-less URL and mailto: to a bare email", () => {
    expect(normalizeHref("example.com/path")).toBe("https://example.com/path");
    expect(normalizeHref("a@b.com")).toBe("mailto:a@b.com");
  });
  it("rejects unsafe schemes and empty input", () => {
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
    expect(normalizeHref("data:text/html,x")).toBeNull();
    expect(normalizeHref("vbscript:x")).toBeNull();
    expect(normalizeHref("")).toBeNull();
    expect(normalizeHref("   ")).toBeNull();
  });
});

describe("safeHref", () => {
  it("passes safe schemes, blocks the rest", () => {
    expect(safeHref("https://x")).toBe("https://x");
    expect(safeHref("mailto:a@b")).toBe("mailto:a@b");
    expect(safeHref("javascript:x")).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
});

const noop = new Proxy({} as Record<string, unknown>, {
  get: (_, k) => (k === "size" ? { width: 100, height: 100 } : k === "measureText" ? () => ({ width: 0 }) : () => {}),
}) as never;
const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;
const makeEditor = (scene: Scene) =>
  new Editor({ host, mainTarget: noop, overlayTarget: noop, initialScene: scene });

describe("editor.setLink / shapeLink", () => {
  it("sets and clears the element href as one undo step", () => {
    let s = emptyScene();
    ({ scene: s } = addElement(s, rect("r")));
    const e = makeEditor(s);
    e.setLink([elementId("r")], "example.com"); // normalised inside setLink
    expect((e.scene.elements.get(elementId("r")) as { href?: string }).href).toBe("https://example.com");
    expect(e.shapeLink(elementId("r"))).toBe("https://example.com");
    e.undo();
    expect((e.scene.elements.get(elementId("r")) as { href?: string }).href).toBeUndefined();
    e.setLink([elementId("r")], "https://y.com");
    e.setLink([elementId("r")], null);
    expect((e.scene.elements.get(elementId("r")) as { href?: string }).href).toBeUndefined();
  });

  it("shapeLink returns null for an unsafe stored href", () => {
    let s = emptyScene();
    ({ scene: s } = addElement(s, { ...rect("r"), href: "javascript:alert(1)" } as Element));
    const e = makeEditor(s);
    expect(e.shapeLink(elementId("r"))).toBeNull();
  });
});
