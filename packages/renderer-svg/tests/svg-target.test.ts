import { describe, expect, it } from "vitest";
import { SvgTarget } from "../src/svg-target";

const make = (w = 100, h = 100) => new SvgTarget({ width: w, height: h });

describe("SvgTarget", () => {
  it("toSvg() returns a well-formed empty document", () => {
    const t = make();
    const svg = t.toSvg();
    expect(svg).toMatch(/^<svg [^>]*>.*<\/svg>$/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('viewBox="0 0 100 100"');
  });

  it("rect → fill emits a single <path> with the right d attribute", () => {
    const t = make();
    t.setFill("#abc");
    t.beginPath();
    t.rect(10, 20, 30, 40);
    t.fill();
    const svg = t.toSvg();
    // path with 4-segment rect.
    expect(svg).toContain('fill="#abc"');
    expect(svg).toMatch(/d="M10 20 L40 20 L40 60 L10 60 Z"/);
  });

  it("stroke emits a fill=none, stroke=… path", () => {
    const t = make();
    t.setStroke("#f00");
    t.setStrokeWidth(2);
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(50, 50);
    t.stroke();
    const svg = t.toSvg();
    expect(svg).toContain('stroke="#f00"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('fill="none"');
  });

  it("transform stack applies translate to subsequent path coords", () => {
    const t = make();
    t.translate(100, 50);
    t.setFill("#000");
    t.beginPath();
    t.rect(0, 0, 10, 10);
    t.fill();
    const svg = t.toSvg();
    expect(svg).toMatch(/d="M100 50 L110 50 L110 60 L100 60 Z"/);
  });

  it("save/restore roundtrips transform and style state", () => {
    const t = make();
    t.setFill("#abc");
    t.translate(10, 0);
    t.save();
    t.setFill("#def");
    t.translate(0, 20);
    t.beginPath();
    t.rect(0, 0, 5, 5);
    t.fill();
    t.restore();
    t.beginPath();
    t.rect(0, 0, 5, 5);
    t.fill();
    const svg = t.toSvg();
    // First rect is translated by (10, 20) and filled with #def.
    expect(svg).toMatch(/<path d="M10 20 L15 20 L15 25 L10 25 Z" fill="#def"\/>/);
    // Second rect is translated by (10, 0) and filled with #abc (post-restore).
    expect(svg).toMatch(/<path d="M10 0 L15 0 L15 5 L10 5 Z" fill="#abc"\/>/);
  });

  it("ellipse decomposes into 4 cubic curves and closes", () => {
    const t = make();
    t.setFill("#000");
    t.beginPath();
    t.ellipse(50, 50, 20, 10);
    t.fill();
    const svg = t.toSvg();
    // Move to the rightmost point and 4 C-segments + Z.
    expect(svg).toMatch(/d="M70 50 C/);
    expect((svg.match(/C/g) ?? []).length).toBe(4);
    expect(svg).toContain(" Z");
  });

  it("fillText emits a <text> with the right anchor and baseline", () => {
    const t = make();
    t.setFont("Inter", 12);
    t.setTextAlign("center");
    t.setTextBaseline("middle");
    t.setFill("#222");
    t.fillText("Hi", 50, 25);
    const svg = t.toSvg();
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('dominant-baseline="central"');
    expect(svg).toContain('font-family="Inter"');
    expect(svg).toContain('font-size="12"');
    expect(svg).toContain('fill="#222"');
    expect(svg).toContain(">Hi</text>");
  });

  it("fillText escapes XML-sensitive characters", () => {
    const t = make();
    t.setFont("Inter", 12);
    t.setFill("#000");
    t.fillText("a < b & c > d", 0, 0);
    const svg = t.toSvg();
    expect(svg).toContain(">a &lt; b &amp; c &gt; d</text>");
  });

  it("measureText uses the supplied measurer", () => {
    const t = new SvgTarget({
      width: 100,
      height: 100,
      measureText: () => 999,
    });
    t.setFont("X", 16);
    expect(t.measureText("anything").width).toBe(999);
  });

  it("dashArray flows into stroke-dasharray", () => {
    const t = make();
    t.setStroke("#000");
    t.setDashArray([4, 2]);
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(10, 0);
    t.stroke();
    expect(t.toSvg()).toContain('stroke-dasharray="4 2"');
  });

  it("opacity flows into fill-opacity / stroke-opacity", () => {
    const t = make();
    t.setFill("#abc");
    t.setStroke("#def");
    t.setOpacity(0.5);
    t.beginPath();
    t.rect(0, 0, 5, 5);
    t.fill();
    t.stroke();
    const svg = t.toSvg();
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('stroke-opacity="0.5"');
  });

  it("clear() with no bounds wipes accumulated elements", () => {
    const t = make();
    t.setFill("#000");
    t.beginPath();
    t.rect(0, 0, 5, 5);
    t.fill();
    expect(t.toSvg()).toContain("<path");
    t.clear();
    expect(t.toSvg()).not.toContain("<path");
  });

  it("stroke without colour or with zero width emits nothing", () => {
    const t = make();
    t.setStrokeWidth(0);
    t.beginPath();
    t.rect(0, 0, 5, 5);
    t.stroke();
    expect(t.toSvg()).not.toContain("<path");
  });

  it("drawImage emits an <image href> in the current transform", () => {
    const t = make();
    t.translate(10, 20);
    t.drawImage("data:,", 0, 0, 40, 30);
    const svg = t.toSvg();
    expect(svg).toContain('<image x="10" y="20" width="40" height="30" href="data:,"/>');
  });
});
