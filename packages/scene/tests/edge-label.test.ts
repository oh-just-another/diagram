import { describe, expect, it } from "vitest";
import { linkId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  LINK_LABEL_CHAR_WIDTH_FACTOR,
  LINK_LABEL_END_CLEARANCE,
  LINK_LABEL_MAX_WIDTH,
  LINK_LABEL_PAD_X,
  LINK_LABEL_PAD_Y,
  addLink,
  emptyScene,
  estimateLinkLabelBox,
  findLinkAt,
  linkLabelAnchor,
  linkLabelBounds,
  linkLabelBoundsForPath,
  orderBetween,
  pointAlongPath,
  type Link,
} from "../src/index";

const edge = (overrides: Partial<Link>): Link => ({
  id: linkId("e1"),
  layerId: layerId(DEFAULT_LAYER_ID),
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 200, y: 0 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...overrides,
});

const sceneWith = (edges: Link[]) => {
  let s = emptyScene();
  for (const e of edges) ({ scene: s } = addLink(s, e));
  return s;
};

describe("pointAlongPath", () => {
  it("interpolates a two-point path linearly", () => {
    const p = pointAlongPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      0.25,
    );
    expect(p).toEqual({ x: 25, y: 0 });
  });

  it("walks segments by cumulative length on a polyline", () => {
    // Two segments of 100 each — t=0.75 lands mid-second-segment.
    const p = pointAlongPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      0.75,
    );
    expect(p).toEqual({ x: 100, y: 50 });
  });

  it("returns the last point at t=1", () => {
    const p = pointAlongPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      1,
    );
    expect(p).toEqual({ x: 100, y: 100 });
  });
});

describe("linkLabelAnchor", () => {
  const straightPath = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ];

  it("defaults to the arc-length midpoint on a straight link", () => {
    const a = linkLabelAnchor(straightPath, edge({ label: { text: "x" } }));
    expect(a).toEqual({ x: 100, y: 0 });
  });

  it("clamps an explicit end position away from the arrowheads", () => {
    const atEnd = linkLabelAnchor(straightPath, edge({ label: { text: "x", position: 1 } }));
    expect(atEnd.x).toBeCloseTo(200 - LINK_LABEL_END_CLEARANCE);
    const atStart = linkLabelAnchor(straightPath, edge({ label: { text: "x", position: 0 } }));
    expect(atStart.x).toBeCloseTo(LINK_LABEL_END_CLEARANCE);
  });

  it("degenerates to the true midpoint when the path is shorter than twice the clearance", () => {
    const short = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const a = linkLabelAnchor(short, edge({ label: { text: "x", position: 0 } }));
    expect(a.x).toBeCloseTo(5);
  });

  it("uses the longest segment's midpoint on an elbow link without explicit position", () => {
    // L-shape: short vertical stub, long horizontal run.
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 30 },
      { x: 300, y: 30 },
    ];
    const a = linkLabelAnchor(path, edge({ routing: "orthogonal", label: { text: "x" } }));
    expect(a).toEqual({ x: 150, y: 30 });
  });

  it("an explicit position on an elbow link still follows arc length", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    const a = linkLabelAnchor(
      path,
      edge({ routing: "orthogonal", label: { text: "x", position: 0.25 } }),
    );
    expect(a).toEqual({ x: 0, y: 50 });
  });
});

describe("estimateLinkLabelBox", () => {
  it("grows with text length up to the wrap width, then wraps into more lines", () => {
    const short = estimateLinkLabelBox({ text: "hi" });
    const long = estimateLinkLabelBox({ text: "a much longer caption than the short one" });
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.width).toBeLessThanOrEqual(LINK_LABEL_MAX_WIDTH + LINK_LABEL_PAD_X * 2);
    expect(long.height).toBeGreaterThan(short.height);
  });

  it("counts explicit newlines as separate lines", () => {
    const one = estimateLinkLabelBox({ text: "one" });
    const three = estimateLinkLabelBox({ text: "one\ntwo\nthree" });
    expect(three.height).toBeGreaterThan(one.height * 2);
  });

  it("scales the estimate with fontSize", () => {
    const small = estimateLinkLabelBox({ text: "word", fontSize: 12 });
    const big = estimateLinkLabelBox({ text: "word", fontSize: 24 });
    expect(big.width).toBeCloseTo(
      "word".length * 24 * LINK_LABEL_CHAR_WIDTH_FACTOR + LINK_LABEL_PAD_X * 2,
    );
    expect(big.width).toBeGreaterThan(small.width);
    expect(big.height).toBeGreaterThan(small.height);
  });

  it("pads an empty text to the pill paddings only", () => {
    const box = estimateLinkLabelBox({ text: "" });
    expect(box.width).toBeCloseTo(LINK_LABEL_PAD_X * 2);
  });
});

describe("linkLabelBoundsForPath / linkLabelBounds", () => {
  it("returns null without a label", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    expect(linkLabelBoundsForPath(path, edge({}))).toBeNull();
    expect(linkLabelBoundsForPath(path, edge({ label: { text: "" } }))).toBeNull();
  });

  it("centres the box on the anchor", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const e = edge({ label: { text: "hey" } });
    const b = linkLabelBoundsForPath(path, e);
    expect(b).not.toBeNull();
    expect(b!.x + b!.width / 2).toBeCloseTo(100);
    expect(b!.y + b!.height / 2).toBeCloseTo(0);
  });

  it("scene-aware variant resolves the path itself", () => {
    const e = edge({ label: { text: "hey" } });
    const s = sceneWith([e]);
    const b = linkLabelBounds(s, e);
    expect(b).not.toBeNull();
    expect(b!.x + b!.width / 2).toBeCloseTo(100);
  });
});

describe("findLinkAt — label hit", () => {
  it("a press inside the label pill hits the link even away from the line", () => {
    // Long horizontal link with a tall multiline label: points inside the
    // pill but > threshold px above the line must still select the link.
    const e = edge({ label: { text: "first line\nsecond line\nthird line" } });
    const s = sceneWith([e]);
    const b = linkLabelBounds(s, e)!;
    // Point near the top edge of the pill, well above the 5px line threshold.
    const probe = { x: 100, y: b.y + 2 };
    expect(Math.abs(probe.y - 0)).toBeGreaterThan(5);
    expect(findLinkAt(s, probe)?.id).toBe(e.id);
  });

  it("a press outside both the line and the pill misses", () => {
    const e = edge({ label: { text: "hey" } });
    const s = sceneWith([e]);
    const b = linkLabelBounds(s, e)!;
    expect(findLinkAt(s, { x: 100, y: b.y - 10 })).toBeNull();
  });

  it("without a label the behaviour is unchanged (line only)", () => {
    const e = edge({});
    const s = sceneWith([e]);
    expect(findLinkAt(s, { x: 100, y: 3 })?.id).toBe(e.id);
    expect(findLinkAt(s, { x: 100, y: 30 })).toBeNull();
  });
});

// Padding constants sanity: the estimate must never be smaller than the text
// block it wraps (guards accidental constant edits).
describe("label constants", () => {
  it("paddings are positive and clearance is sane", () => {
    expect(LINK_LABEL_PAD_X).toBeGreaterThan(0);
    expect(LINK_LABEL_PAD_Y).toBeGreaterThan(0);
    expect(LINK_LABEL_END_CLEARANCE).toBeGreaterThan(0);
    expect(LINK_LABEL_END_CLEARANCE).toBeLessThan(LINK_LABEL_MAX_WIDTH);
  });
});
