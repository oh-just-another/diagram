import { describe, expect, it, vi } from "vitest";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import { parseSvg, paintSvgIcon, type SvgIcon } from "../src/rich/index";

// --- Recording fake RenderTarget ---
//
// `paintSvgIcon` only touches a handful of the RenderTarget surface. We mock
// every method with `vi.fn()` so assertions can inspect call order/args, and
// stub the read-only `size` getter that the interface requires.

type RecordingTarget = RenderTarget & {
  [K in keyof RenderTarget]: RenderTarget[K] extends (...args: never[]) => unknown
    ? ReturnType<typeof vi.fn>
    : RenderTarget[K];
};

const makeTarget = (): RecordingTarget =>
  ({
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
    markDirty: vi.fn(),
    size: { width: 100, height: 100 },
  }) as unknown as RecordingTarget;

/** Find the first parsed element of a given kind. */
const firstOf = (icon: SvgIcon, kind: string): unknown =>
  icon.elements.find((e) => (e as { kind: string }).kind === kind);

// =====================================================================
// parseSvg — structural parsing
// =====================================================================

describe("parseSvg — root / viewBox", () => {
  it("returns null for input without an <svg> element", () => {
    expect(parseSvg("not svg at all")).toBeNull();
    expect(parseSvg("")).toBeNull();
    expect(parseSvg("<div>nope</div>")).toBeNull();
  });

  it("parses the viewBox attribute", () => {
    const icon = parseSvg('<svg viewBox="1 2 30 40"></svg>');
    expect(icon).not.toBeNull();
    expect(icon?.viewBox).toEqual({ x: 1, y: 2, width: 30, height: 40 });
  });

  it("accepts comma-separated viewBox numbers", () => {
    const icon = parseSvg('<svg viewBox="0,0,10,20"></svg>');
    expect(icon?.viewBox).toEqual({ x: 0, y: 0, width: 10, height: 20 });
  });

  it("falls back to 0 0 24 24 when viewBox is missing", () => {
    const icon = parseSvg("<svg></svg>");
    expect(icon?.viewBox).toEqual({ x: 0, y: 0, width: 24, height: 24 });
  });

  it("falls back to default viewBox when viewBox has wrong arity", () => {
    expect(parseSvg('<svg viewBox="1 2 3"></svg>')?.viewBox).toEqual({
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
  });

  it("falls back to default viewBox when viewBox contains non-numbers", () => {
    expect(parseSvg('<svg viewBox="0 0 10 abc"></svg>')?.viewBox).toEqual({
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
  });

  it("parses an empty <svg> body into zero elements", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"></svg>');
    expect(icon?.elements).toHaveLength(0);
  });

  it("is case-insensitive about the SVG tag", () => {
    expect(parseSvg('<SVG viewBox="0 0 1 1"></SVG>')).not.toBeNull();
  });
});

describe("parseSvg — shapes", () => {
  it("parses a rect with numeric attrs only", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="10" height="6"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { attrs: Record<string, number> };
    expect(rect.attrs).toMatchObject({ x: 2, y: 3, width: 10, height: 6 });
  });

  it("drops non-numeric attrs from primitive shapes", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="1" y="2" width="3" height="4" class="foo"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { attrs: Record<string, number> };
    expect(rect.attrs).not.toHaveProperty("class");
    expect(Object.keys(rect.attrs).sort()).toEqual(["height", "width", "x", "y"]);
  });

  it("parses a circle", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>');
    const c = firstOf(icon as SvgIcon, "circle") as { attrs: Record<string, number> };
    expect(c.attrs).toMatchObject({ cx: 12, cy: 12, r: 5 });
  });

  it("parses an ellipse", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><ellipse cx="1" cy="2" rx="3" ry="4"/></svg>');
    const e = firstOf(icon as SvgIcon, "ellipse") as { attrs: Record<string, number> };
    expect(e.attrs).toMatchObject({ cx: 1, cy: 2, rx: 3, ry: 4 });
  });

  it("parses a line", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><line x1="0" y1="0" x2="10" y2="20"/></svg>');
    const l = firstOf(icon as SvgIcon, "line") as { attrs: Record<string, number> };
    expect(l.attrs).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 20 });
  });

  it("parses a polygon's points", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><polygon points="0,0 10,0 10,10"/></svg>');
    const p = firstOf(icon as SvgIcon, "polygon") as { points: { x: number; y: number }[] };
    expect(p.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("parses a polyline's points (space-separated)", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><polyline points="1 2 3 4"/></svg>');
    const p = firstOf(icon as SvgIcon, "polyline") as { points: { x: number; y: number }[] };
    expect(p.points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it("drops a trailing odd coordinate in points", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><polygon points="0 0 5 5 9"/></svg>');
    const p = firstOf(icon as SvgIcon, "polygon") as { points: { x: number; y: number }[] };
    expect(p.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
  });

  it("skips a polygon with no parseable points", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><polygon points=""/></svg>');
    expect(icon?.elements).toHaveLength(0);
  });

  it("skips a path with no parseable commands", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><path d=""/></svg>');
    expect(icon?.elements).toHaveLength(0);
  });

  it("handles paired (non-self-closing) primitive tags", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="1" y="1" width="2" height="2"></rect></svg>',
    );
    expect(firstOf(icon as SvgIcon, "rect")).toBeDefined();
  });

  it("parses multiple sibling shapes in order", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1"/><circle cx="2" cy="2" r="1"/></svg>',
    );
    expect((icon as SvgIcon).elements.map((e) => (e as { kind: string }).kind)).toEqual([
      "rect",
      "circle",
    ]);
  });
});

// =====================================================================
// parseSvg — paint inheritance & colour normalisation
// =====================================================================

describe("parseSvg — paint", () => {
  it("inherits fill/stroke/stroke-width from <svg> root", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24" fill="#abc" stroke="#def" stroke-width="3"><rect x="0" y="0" width="1" height="1"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as {
      paint: { fill: string; stroke: string; strokeWidth: number };
    };
    expect(rect.paint).toEqual({ fill: "#abc", stroke: "#def", strokeWidth: 3 });
  });

  it("element attrs override inherited paint", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24" fill="#abc" stroke-width="3"><rect x="0" y="0" width="1" height="1" fill="#111" stroke-width="9"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as {
      paint: { fill: string; strokeWidth: number };
    };
    expect(rect.paint.fill).toBe("#111");
    expect(rect.paint.strokeWidth).toBe(9);
  });

  it("defaults: no fill/stroke attrs → null fill, null stroke, strokeWidth 1", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as {
      paint: { fill: string | null; stroke: string | null; strokeWidth: number };
    };
    expect(rect.paint).toEqual({ fill: null, stroke: null, strokeWidth: 1 });
  });

  it("normalises fill='none' to null", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1" fill="none"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { fill: string | null } };
    expect(rect.paint.fill).toBeNull();
  });

  it("replaces currentColor with the default colour", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1" fill="currentColor"/></svg>',
      "#ff0000",
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { fill: string | null } };
    expect(rect.paint.fill).toBe("#ff0000");
  });

  it("replaces currentColor on the <svg> root", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="0" y="0" width="1" height="1"/></svg>',
      "#00ff00",
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { fill: string | null } };
    expect(rect.paint.fill).toBe("#00ff00");
  });

  it("uses the built-in default colour (#222) when none is supplied", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24" stroke="currentColor"><rect x="0" y="0" width="1" height="1"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { stroke: string | null } };
    expect(rect.paint.stroke).toBe("#222");
  });

  it("preserves an arbitrary colour string verbatim (incl. case)", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1" fill="RebeccaPurple"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { fill: string | null } };
    expect(rect.paint.fill).toBe("RebeccaPurple");
  });

  it("falls back stroke-width to inherited value when attr is non-numeric", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24" stroke-width="4"><rect x="0" y="0" width="1" height="1" stroke-width="bad"/></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { strokeWidth: number } };
    expect(rect.paint.strokeWidth).toBe(4);
  });
});

// =====================================================================
// parseSvg — nested groups <g>
// =====================================================================

describe("parseSvg — groups", () => {
  it("flattens children of a <g> into the element list", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><g><rect x="0" y="0" width="1" height="1"/><circle cx="1" cy="1" r="1"/></g></svg>',
    );
    expect((icon as SvgIcon).elements.map((e) => (e as { kind: string }).kind)).toEqual([
      "rect",
      "circle",
    ]);
  });

  it("propagates paint through a <g> to its children", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><g fill="#123" stroke-width="7"><rect x="0" y="0" width="1" height="1"/></g></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as {
      paint: { fill: string | null; strokeWidth: number };
    };
    expect(rect.paint.fill).toBe("#123");
    expect(rect.paint.strokeWidth).toBe(7);
  });

  it("a child can override the group's paint", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><g fill="#123"><rect x="0" y="0" width="1" height="1" fill="#999"/></g></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as { paint: { fill: string | null } };
    expect(rect.paint.fill).toBe("#999");
  });

  it("handles nested <g> groups with layered inheritance", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><g fill="#111"><g stroke="#222"><rect x="0" y="0" width="1" height="1"/></g></g></svg>',
    );
    const rect = firstOf(icon as SvgIcon, "rect") as {
      paint: { fill: string | null; stroke: string | null };
    };
    // The element regex uses a `\1` backreference with a non-greedy body, so the
    // OUTER <g>'s content stops at the FIRST </g>. The inner <g stroke="#222"> is
    // left without a matching close, so it never registers as a group and its
    // stroke is not inherited — the rect is matched directly under the outer g
    // (fill=#111, stroke inherited from root = null).
    expect(rect.paint.fill).toBe("#111");
    expect(rect.paint.stroke).toBeNull();
  });
});

// =====================================================================
// parsePathData (exercised through parseSvg with <path d="...">)
// =====================================================================

/** Helper: parse a single <path> and return its command array. */
const pathCommands = (d: string): readonly unknown[] => {
  const icon = parseSvg(`<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`);
  const p = firstOf(icon as SvgIcon, "path") as { commands: readonly unknown[] } | undefined;
  return p?.commands ?? [];
};

describe("parsePathData — absolute commands", () => {
  it("M then L", () => {
    expect(pathCommands("M1 2 L3 4")).toEqual([
      { kind: "move", x: 1, y: 2 },
      { kind: "line", x: 3, y: 4 },
    ]);
  });

  it("repeated coordinate pairs after M are consumed by the same M handler (each emits move)", () => {
    // The inner operand loop keeps `cmd` fixed at "M", so trailing pairs are
    // re-run through the M branch and emit further "move" commands rather than
    // the spec's implicit lineto.
    expect(pathCommands("M0 0 1 1 2 2")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "move", x: 1, y: 1 },
      { kind: "move", x: 2, y: 2 },
    ]);
  });

  it("H sets x, keeps y", () => {
    expect(pathCommands("M2 3 H10")).toEqual([
      { kind: "move", x: 2, y: 3 },
      { kind: "line", x: 10, y: 3 },
    ]);
  });

  it("V sets y, keeps x", () => {
    expect(pathCommands("M2 3 V10")).toEqual([
      { kind: "move", x: 2, y: 3 },
      { kind: "line", x: 2, y: 10 },
    ]);
  });

  it("C cubic bezier", () => {
    expect(pathCommands("M0 0 C1 2 3 4 5 6")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "cubic", c1x: 1, c1y: 2, c2x: 3, c2y: 4, x: 5, y: 6 },
    ]);
  });

  it("Q quadratic bezier", () => {
    expect(pathCommands("M0 0 Q1 2 3 4")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "quad", cx: 1, cy: 2, x: 3, y: 4 },
    ]);
  });

  it("a trailing Z with no following operand emits no close (operand loop never runs)", () => {
    // The close is pushed inside the operand loop, which only runs while the
    // next token is a number. A Z at end-of-input has no following operand, so
    // the loop body never executes and no { kind: "close" } is emitted.
    expect(pathCommands("M0 0 L1 1 Z")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 1, y: 1 },
    ]);
  });
});

describe("parsePathData — relative commands", () => {
  it("m relative moveto accumulates from origin", () => {
    // First m is relative-to-(0,0); a fresh m re-dispatches as another move,
    // accumulating from the current point.
    expect(pathCommands("m5 5 m1 1")).toEqual([
      { kind: "move", x: 5, y: 5 },
      { kind: "move", x: 6, y: 6 },
    ]);
  });

  it("repeated coordinate pairs after a relative m are re-run through m (relative moves)", () => {
    // As with absolute M, `cmd` stays "m" across the operand loop, so the
    // trailing pairs accumulate as further relative "move" commands.
    expect(pathCommands("m5 5 1 1 2 2")).toEqual([
      { kind: "move", x: 5, y: 5 },
      { kind: "move", x: 6, y: 6 },
      { kind: "move", x: 8, y: 8 },
    ]);
  });

  it("l relative lineto adds to current point", () => {
    expect(pathCommands("M10 10 l5 -3")).toEqual([
      { kind: "move", x: 10, y: 10 },
      { kind: "line", x: 15, y: 7 },
    ]);
  });

  it("h relative horizontal", () => {
    expect(pathCommands("M10 10 h5")).toEqual([
      { kind: "move", x: 10, y: 10 },
      { kind: "line", x: 15, y: 10 },
    ]);
  });

  it("v relative vertical", () => {
    expect(pathCommands("M10 10 v5")).toEqual([
      { kind: "move", x: 10, y: 10 },
      { kind: "line", x: 10, y: 15 },
    ]);
  });

  it("c relative cubic adds control & end points to current", () => {
    expect(pathCommands("M10 10 c1 1 2 2 3 3")).toEqual([
      { kind: "move", x: 10, y: 10 },
      { kind: "cubic", c1x: 11, c1y: 11, c2x: 12, c2y: 12, x: 13, y: 13 },
    ]);
  });

  it("q relative quad adds control & end points to current", () => {
    expect(pathCommands("M10 10 q1 1 2 2")).toEqual([
      { kind: "move", x: 10, y: 10 },
      { kind: "quad", cx: 11, cy: 11, x: 12, y: 12 },
    ]);
  });

  it("a z followed by a command letter (not a number) emits no close and does not reset the pen", () => {
    // The close-push and the cx/cy reset both live inside the operand loop,
    // which only runs while the next token is a number. Here z is followed by
    // `l`, so the loop never runs: no { kind: "close" }, and the pen stays at
    // (15,15). The trailing relative l1 1 is therefore from (15,15) → (16,16).
    expect(pathCommands("M10 10 l5 5 z l1 1")).toEqual([
      { kind: "move", x: 10, y: 10 },
      { kind: "line", x: 15, y: 15 },
      { kind: "line", x: 16, y: 16 },
    ]);
  });
});

describe("parsePathData — subpaths, whitespace, number formats", () => {
  it("multiple subpaths (two M segments)", () => {
    expect(pathCommands("M0 0 L1 0 M5 5 L6 5")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 1, y: 0 },
      { kind: "move", x: 5, y: 5 },
      { kind: "line", x: 6, y: 5 },
    ]);
  });

  it("comma separators are equivalent to spaces", () => {
    expect(pathCommands("M0,0 L3,4")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 3, y: 4 },
    ]);
  });

  it("no separator between command and number", () => {
    expect(pathCommands("M0 0L10 10")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 10, y: 10 },
    ]);
  });

  it("leading-dot decimals (.5)", () => {
    expect(pathCommands("M.5 .25 L.75 .125")).toEqual([
      { kind: "move", x: 0.5, y: 0.25 },
      { kind: "line", x: 0.75, y: 0.125 },
    ]);
  });

  it("negative and scientific-notation numbers", () => {
    const cmds = pathCommands("M-1.5e2 -3 L1e1 2") as { x: number; y: number }[];
    expect(cmds[0]).toEqual({ kind: "move", x: -150, y: -3 });
    expect(cmds[1]).toEqual({ kind: "line", x: 10, y: 2 });
  });

  it("returns empty array for an unparseable d string", () => {
    expect(pathCommands("garbage")).toEqual([]);
  });

  it("skips leading numbers that have no preceding command", () => {
    expect(pathCommands("5 5 M1 1")).toEqual([{ kind: "move", x: 1, y: 1 }]);
  });
});

describe("parsePathData — unsupported commands (S/T/A) skip operands gracefully", () => {
  it("S smooth cubic is skipped (4 operands consumed) without throwing", () => {
    // The S is consumed along with its 4 numbers; the trailing L still parses.
    const cmds = pathCommands("M0 0 S1 2 3 4 L9 9") as { kind: string }[];
    expect(cmds[0]).toEqual({ kind: "move", x: 0, y: 0 });
    expect(cmds.some((c) => c.kind === "cubic")).toBe(false);
    expect(cmds.at(-1)).toEqual({ kind: "line", x: 9, y: 9 });
  });

  it("T smooth quad is skipped (2 operands consumed)", () => {
    const cmds = pathCommands("M0 0 T3 4 L9 9") as { kind: string }[];
    expect(cmds.some((c) => c.kind === "quad")).toBe(false);
    expect(cmds.at(-1)).toEqual({ kind: "line", x: 9, y: 9 });
  });

  it("A arc is skipped (7 operands consumed)", () => {
    const cmds = pathCommands("M0 0 A5 5 0 0 1 10 10 L9 9") as { kind: string }[];
    expect(cmds[0]).toEqual({ kind: "move", x: 0, y: 0 });
    // A consumes 7 numbers; the following L must still be reached.
    expect(cmds.at(-1)).toEqual({ kind: "line", x: 9, y: 9 });
  });
});

// =====================================================================
// paintSvgIcon — transform / scaling
// =====================================================================

describe("paintSvgIcon — scaling & transform", () => {
  it("no-ops on zero/negative bounds", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 0, height: 10 }, t);
    paintSvgIcon(icon, { x: 0, y: 0, width: 10, height: -1 }, t);
    expect(t.save).not.toHaveBeenCalled();
  });

  it("save/restore wrap the paint pass", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.restore).toHaveBeenCalledTimes(1);
  });

  it("uses uniform scale = min(sx, sy) and centers a non-square fit", () => {
    // viewBox 10x10 into a 100x40 box → s = min(10, 4) = 4.
    // offsetX = 0 + (100 - 10*4)/2 = 30; offsetY = 0 + (40 - 10*4)/2 = 0.
    const icon = parseSvg(
      '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 100, height: 40 }, t);
    expect(t.scale).toHaveBeenCalledWith(4, 4);
    // first translate is the centering offset
    expect(t.translate.mock.calls[0]?.[0]).toBeCloseTo(30, 5);
    expect(t.translate.mock.calls[0]?.[1]).toBeCloseTo(0, 5);
  });

  it("translates by -viewBox.x/-viewBox.y after scaling", () => {
    const icon = parseSvg(
      '<svg viewBox="5 7 10 10"><rect x="0" y="0" width="1" height="1"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 10, height: 10 }, t);
    // second translate undoes the viewBox origin
    expect(t.translate.mock.calls[1]).toEqual([-5, -7]);
  });

  it("incorporates bounds.x/bounds.y into the centering offset", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 50, y: 20, width: 10, height: 10 }, t);
    // s = 1, offsetX = 50, offsetY = 20
    expect(t.translate.mock.calls[0]).toEqual([50, 20]);
  });
});

// =====================================================================
// paintSvgIcon — per-shape draw calls
// =====================================================================

describe("paintSvgIcon — rect", () => {
  it("issues beginPath + rect + fill (filled rect)", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="10" height="6" fill="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.setFill).toHaveBeenCalledWith("#000");
    expect(t.beginPath).toHaveBeenCalled();
    expect(t.rect).toHaveBeenCalledWith(2, 3, 10, 6);
    expect(t.fill).toHaveBeenCalled();
    expect(t.stroke).not.toHaveBeenCalled();
  });

  it("strokes (not fills) a stroke-only rect", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="4" height="4" stroke="#f00" stroke-width="2"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.setStroke).toHaveBeenCalledWith("#f00");
    expect(t.setStrokeWidth).toHaveBeenCalledWith(2);
    expect(t.stroke).toHaveBeenCalled();
    expect(t.fill).not.toHaveBeenCalled();
  });

  it("defaults missing rect attrs to 0", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect width="5" height="5" fill="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.rect).toHaveBeenCalledWith(0, 0, 5, 5);
  });
});

describe("paintSvgIcon — circle / ellipse", () => {
  it("circle uses ellipse(cx, cy, r, r)", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="5" fill="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.ellipse).toHaveBeenCalledWith(12, 8, 5, 5);
    expect(t.fill).toHaveBeenCalled();
  });

  it("ellipse uses ellipse(cx, cy, rx, ry)", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><ellipse cx="1" cy="2" rx="3" ry="4" fill="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.ellipse).toHaveBeenCalledWith(1, 2, 3, 4);
  });
});

describe("paintSvgIcon — line", () => {
  it("moves to (x1,y1) then lines to (x2,y2) and strokes", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><line x1="0" y1="0" x2="10" y2="20" stroke="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.moveTo).toHaveBeenCalledWith(0, 0);
    expect(t.lineTo).toHaveBeenCalledWith(10, 20);
    expect(t.stroke).toHaveBeenCalled();
  });

  it("never fills a line even when fill is set (line painter only strokes)", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><line x1="0" y1="0" x2="1" y2="1" fill="#000" stroke="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.fill).not.toHaveBeenCalled();
  });
});

describe("paintSvgIcon — polygon / polyline", () => {
  it("polygon: moveTo first, lineTo rest, closePath, then fill", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><polygon points="0,0 10,0 10,10" fill="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.moveTo).toHaveBeenCalledWith(0, 0);
    expect(t.lineTo).toHaveBeenNthCalledWith(1, 10, 0);
    expect(t.lineTo).toHaveBeenNthCalledWith(2, 10, 10);
    expect(t.closePath).toHaveBeenCalled();
    expect(t.fill).toHaveBeenCalled();
  });

  it("polyline does NOT closePath", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><polyline points="0,0 10,0 10,10" stroke="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.moveTo).toHaveBeenCalledWith(0, 0);
    expect(t.closePath).not.toHaveBeenCalled();
    expect(t.stroke).toHaveBeenCalled();
  });
});

describe("paintSvgIcon — path", () => {
  it("emits the matching draw call for every command kind", () => {
    // The trailing Z has no following operand, so the parser emits no close
    // command (the operand loop never runs) — hence closePath is NOT called.
    // A subpath that needs to close must place a coordinate after Z, but here
    // we assert the move/line/quad/cubic draw calls that DO get emitted.
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M0 0 L1 1 Q2 2 3 3 C4 4 5 5 6 6 Z" fill="#000" stroke="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.moveTo).toHaveBeenCalledWith(0, 0);
    expect(t.lineTo).toHaveBeenCalledWith(1, 1);
    expect(t.quadraticCurveTo).toHaveBeenCalledWith(2, 2, 3, 3);
    expect(t.bezierCurveTo).toHaveBeenCalledWith(4, 4, 5, 5, 6, 6);
    expect(t.closePath).not.toHaveBeenCalled();
    expect(t.fill).toHaveBeenCalled();
    expect(t.stroke).toHaveBeenCalled();
  });

  it("a fill-less, stroke-less path neither fills nor strokes", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0 L1 1"/></svg>') as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.beginPath).toHaveBeenCalled();
    expect(t.fill).not.toHaveBeenCalled();
    expect(t.stroke).not.toHaveBeenCalled();
  });
});

describe("paintSvgIcon — empty icon", () => {
  it("still wraps in save/restore but draws nothing", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24"></svg>') as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.restore).toHaveBeenCalledTimes(1);
    expect(t.beginPath).not.toHaveBeenCalled();
  });

  it("paints multiple elements in document order", () => {
    const icon = parseSvg(
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="1" height="1" fill="#000"/><circle cx="1" cy="1" r="1" fill="#000"/></svg>',
    ) as SvgIcon;
    const t = makeTarget();
    paintSvgIcon(icon, { x: 0, y: 0, width: 24, height: 24 }, t);
    expect(t.rect).toHaveBeenCalled();
    expect(t.ellipse).toHaveBeenCalled();
    // rect's beginPath comes before circle's
    const order = t.beginPath.mock.invocationCallOrder;
    expect(order).toHaveLength(2);
    expect(order[0]).toBeLessThan(order[1] as number);
  });
});
