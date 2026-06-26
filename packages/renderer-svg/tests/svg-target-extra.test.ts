import { describe, expect, it } from "vitest";
import { matrix } from "@oh-just-another/math";
import { SvgTarget } from "../src/svg-target";

const make = (w = 100, h = 100) => new SvgTarget({ width: w, height: h });

describe("SvgTarget (extra coverage)", () => {
  it("setLineCap / setLineJoin flow into stroke attributes", () => {
    const t = make();
    t.setStroke("#000");
    t.setLineCap("round");
    t.setLineJoin("bevel");
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(10, 10);
    t.stroke();
    const svg = t.toSvg();
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="bevel"');
  });

  it("default butt cap / miter join are omitted from the output", () => {
    const t = make();
    t.setStroke("#000");
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(10, 0);
    t.stroke();
    const svg = t.toSvg();
    expect(svg).not.toContain("stroke-linecap");
    expect(svg).not.toContain("stroke-linejoin");
  });

  it("quadraticCurveTo and bezierCurveTo emit Q and C path segments", () => {
    const t = make();
    t.setStroke("#000");
    t.beginPath();
    t.moveTo(0, 0);
    t.quadraticCurveTo(5, 10, 10, 0);
    t.bezierCurveTo(12, 2, 14, -2, 16, 0);
    t.stroke();
    const svg = t.toSvg();
    expect(svg).toContain("Q5 10 10 0");
    expect(svg).toContain("C12 2 14 -2 16 0");
  });

  it("closePath appends a Z to the current subpath", () => {
    const t = make();
    t.setFill("#000");
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(10, 0);
    t.lineTo(10, 10);
    t.closePath();
    t.fill();
    expect(t.toSvg()).toMatch(/d="M0 0 L10 0 L10 10 Z"/);
  });

  it("rotate transforms subsequent coordinates", () => {
    const t = make();
    t.setFill("#000");
    t.rotate(Math.PI / 2);
    t.beginPath();
    t.moveTo(10, 0);
    t.fill();
    // (10, 0) rotated +90deg → (0, 10).
    expect(t.toSvg()).toContain("M0 10");
  });

  it("scale transforms subsequent coordinates", () => {
    const t = make();
    t.setFill("#000");
    t.scale(2, 3);
    t.beginPath();
    t.rect(1, 1, 1, 1);
    t.fill();
    expect(t.toSvg()).toMatch(/d="M2 3 L4 3 L4 6 L2 6 Z"/);
  });

  it("setTransform installs an explicit matrix; resetTransform clears it", () => {
    const t = make();
    t.setFill("#000");
    t.setTransform(matrix.translation(7, 8));
    t.beginPath();
    t.moveTo(0, 0);
    t.fill();
    expect(t.toSvg()).toContain("M7 8");

    t.resetTransform();
    t.beginPath();
    t.moveTo(3, 4);
    t.fill();
    expect(t.toSvg()).toContain("M3 4");
  });

  it("textAlign=right maps to text-anchor=end", () => {
    const t = make();
    t.setFont("Inter", 12);
    t.setTextAlign("right");
    t.setFill("#000");
    t.fillText("R", 50, 25);
    expect(t.toSvg()).toContain('text-anchor="end"');
  });

  it("textBaseline mappings: bottom→alphabetic, top→hanging", () => {
    const t = make();
    t.setFont("Inter", 12);
    t.setFill("#000");
    t.setTextBaseline("bottom");
    t.fillText("B", 0, 0);
    t.setTextBaseline("top");
    t.fillText("T", 0, 20);
    const svg = t.toSvg();
    expect(svg).toContain('dominant-baseline="alphabetic"');
    expect(svg).toContain('dominant-baseline="hanging"');
  });

  it("fillText with maxWidth emits textLength + lengthAdjust", () => {
    const t = make();
    t.setFont("Inter", 12);
    t.setFill("#000");
    t.fillText("squeeze", 0, 0, 42);
    const svg = t.toSvg();
    expect(svg).toContain('textLength="42"');
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it("fillText with empty string emits nothing", () => {
    const t = make();
    t.setFont("Inter", 12);
    t.fillText("", 0, 0);
    expect(t.toSvg()).not.toContain("<text");
  });

  it("fill with evenodd rule emits fill-rule", () => {
    const t = make();
    t.setFill("#000");
    t.beginPath();
    t.rect(0, 0, 10, 10);
    t.fill("evenodd");
    expect(t.toSvg()).toContain('fill-rule="evenodd"');
  });

  it("clear with bounds emits a white rect at the transformed bounds", () => {
    const t = make();
    t.clear({ x: 5, y: 6, width: 20, height: 10 });
    const svg = t.toSvg();
    expect(svg).toContain('<rect x="5" y="6" width="20" height="10" fill="#fff"/>');
  });

  it("clear with bounds normalises a flipped transform", () => {
    const t = make();
    t.scale(-1, 1);
    t.clear({ x: 0, y: 0, width: 10, height: 10 });
    const svg = t.toSvg();
    // x flips to negative; width stays positive via abs().
    expect(svg).toContain('width="10"');
    expect(svg).toContain('height="10"');
    expect(svg).toContain('fill="#fff"');
  });

  it("drawImage ignores non-string / empty image sources", () => {
    const t = make();
    t.drawImage(42, 0, 0, 10, 10);
    t.drawImage("", 0, 0, 10, 10);
    expect(t.toSvg()).not.toContain("<image");
  });

  it("fill / stroke on an empty path buffer emit nothing", () => {
    const t = make();
    t.setFill("#000");
    t.setStroke("#000");
    t.beginPath();
    t.fill();
    t.stroke();
    expect(t.toSvg()).not.toContain("<path");
  });

  it("restore on an empty stack is a no-op", () => {
    const t = make();
    expect(() => {
      t.restore();
    }).not.toThrow();
  });
});
