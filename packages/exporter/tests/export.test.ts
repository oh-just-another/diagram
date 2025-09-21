import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { exportPng, exportPdf } from "../src/index";

const sceneOf = (width: number, height: number): Scene => {
  const s = emptyScene();
  return { ...s, viewport: { ...s.viewport, size: { width, height } } };
};

const rect = (id: string, x = 0, y = 0, w = 100, h = 60, fill = "#abc"): Shape => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill },
  width: w,
  height: h,
});

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_SIG = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

const PHYS_TAG = [0x70, 0x48, 0x59, 0x73];

const findPhys = (buf: Uint8Array): number => {
  for (let i = 8; i < buf.length - 4; i++) {
    if (PHYS_TAG.every((b, k) => buf[i + k] === b)) return i;
  }
  return -1;
};

describe("exportPng", () => {
  it("produces a valid PNG with the right signature", async () => {
    let scene = sceneOf(120, 80);
    ({ scene } = addShape(scene, rect("a", 10, 10)));
    const png = await exportPng(scene);
    expect(PNG_SIG.every((b, i) => png[i] === b)).toBe(true);
  });

  it("scale option produces a larger image", async () => {
    let scene = sceneOf(120, 80);
    ({ scene } = addShape(scene, rect("a", 10, 10)));
    const a = await exportPng(scene, { scale: 1 });
    const b = await exportPng(scene, { scale: 2 });
    expect(b.length).toBeGreaterThan(a.length);
  });

  it("dpi option embeds a pHYs chunk", async () => {
    let scene = sceneOf(120, 80);
    ({ scene } = addShape(scene, rect("a", 10, 10)));
    const withDpi = await exportPng(scene, { dpi: 300 });
    const withoutDpi = await exportPng(scene);
    expect(findPhys(withDpi)).toBeGreaterThan(0);
    expect(findPhys(withoutDpi)).toBe(-1);
  });

  it("region option crops the output (smaller bytes for smaller crop)", async () => {
    let scene = sceneOf(400, 300);
    ({ scene } = addShape(scene, rect("a", 10, 10, 380, 280)));
    const full = await exportPng(scene);
    const cropped = await exportPng(scene, {
      region: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(cropped.length).toBeLessThan(full.length);
  });
});

describe("exportPdf", () => {
  it("produces a valid PDF starting with %PDF", async () => {
    let scene = sceneOf(120, 80);
    ({ scene } = addShape(scene, rect("a", 10, 10)));
    const pdf = await exportPdf(scene);
    expect(PDF_SIG.every((b, i) => pdf[i] === b)).toBe(true);
  });

  it("respects pageSize option", async () => {
    const scene = sceneOf(120, 80);
    const a4 = await exportPdf(scene, { pageSize: "A4" });
    const letter = await exportPdf(scene, { pageSize: "Letter" });
    // Different MediaBox dimensions ⇒ different byte content (header records sizes).
    expect(a4).not.toEqual(letter);
  });

  it("writes PDF metadata when provided", async () => {
    const scene = sceneOf(120, 80);
    const pdf = await exportPdf(scene, { title: "My diagram", author: "Tester" });
    const text = Buffer.from(pdf).toString("latin1");
    expect(text).toContain("My diagram");
    expect(text).toContain("Tester");
  });
});
