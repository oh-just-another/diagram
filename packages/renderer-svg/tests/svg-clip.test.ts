/**
 * SvgTarget.clip(): the current path becomes a `<clipPath>` and every
 * element emitted until the matching restore() lands inside a
 * `<g clip-path>` wrapper. restore() closes the group; unbalanced
 * clips are closed at serialisation time.
 */
import { describe, expect, it } from "vitest";
import { SvgTarget } from "../src/svg-target.js";

const target = () => new SvgTarget({ width: 100, height: 100 });

describe("SvgTarget clip", () => {
  it("wraps subsequent draws in a clip-path group and closes it on restore", () => {
    const t = target();
    t.save();
    t.beginPath();
    t.ellipse(50, 50, 40, 30);
    t.clip();
    t.setFill("#f00");
    t.beginPath();
    t.rect(0, 0, 100, 100);
    t.fill();
    t.restore();
    // Outside the clip scope.
    t.setFill("#0f0");
    t.beginPath();
    t.rect(0, 0, 10, 10);
    t.fill();
    const svg = t.toSvg();
    const m =
      /<clipPath id="([^"]+)"><path d="[^"]+"\/><\/clipPath><g clip-path="url\(#\1\)">/.exec(svg);
    expect(m).not.toBeNull();
    // The red rect is inside the group, the green one after </g>.
    const groupEnd = svg.indexOf("</g>");
    expect(groupEnd).toBeGreaterThan(svg.indexOf('fill="#f00"'));
    expect(svg.indexOf('fill="#0f0"')).toBeGreaterThan(groupEnd);
  });

  it("evenodd rule lands on the clip path", () => {
    const t = target();
    t.save();
    t.beginPath();
    t.rect(0, 0, 50, 50);
    t.clip("evenodd");
    t.restore();
    expect(t.toSvg()).toContain('clip-rule="evenodd"');
  });

  it("balances unclosed clip groups at serialisation", () => {
    const t = target();
    t.save();
    t.beginPath();
    t.rect(0, 0, 50, 50);
    t.clip();
    // No restore() — toSvg must still emit balanced markup.
    const svg = t.toSvg();
    const opens = svg.split("<g ").length - 1;
    const closes = svg.split("</g>").length - 1;
    expect(closes).toBe(opens);
  });

  it("nested clips close in LIFO order on restores", () => {
    const t = target();
    t.save();
    t.beginPath();
    t.rect(0, 0, 80, 80);
    t.clip();
    t.save();
    t.beginPath();
    t.ellipse(40, 40, 20, 20);
    t.clip();
    t.restore();
    t.restore();
    const svg = t.toSvg();
    const opens = svg.split("<g ").length - 1;
    const closes = svg.split("</g>").length - 1;
    expect(opens).toBe(2);
    expect(closes).toBe(2);
  });
});
