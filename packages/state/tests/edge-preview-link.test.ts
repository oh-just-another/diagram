import { describe, expect, it } from "vitest";
import { layerId } from "@oh-just-another/types";
import { emptyScene } from "@oh-just-another/scene";
import { buildEdgePreviewLink } from "../src/editor/applies/create.js";
import { DEFAULT_LINK_ROUTING, DEFAULT_LINK_ARROWHEAD } from "../src/constants.js";

/**
 * The live draw-edge preview is a WYSIWYG of the link that gets created — the
 * same default object (solid, default routing + arrowhead), not a faded /
 * dashed stand-in. `buildEdgePreviewLink` builds that throwaway link from the
 * resolved preview ends, reusing any already-routed polyline so the elbow
 * geometry matches exactly.
 */
const lid = layerId("layer1");
const previewId = layerId("preview") as never; // any LinkId-ish for the test

describe("buildEdgePreviewLink", () => {
  it("uses the default link object — default routing/arrowhead, solid (no dash)", () => {
    const link = buildEdgePreviewLink(
      emptyScene(),
      { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
      previewId,
      lid,
    );
    expect(link.routing).toBe(DEFAULT_LINK_ROUTING);
    expect(link.arrowheads?.to).toBe(DEFAULT_LINK_ARROWHEAD);
    // Solid — no dash inherited.
    expect(link.style?.dashArray ?? null).toBeNull();
    expect(link.from).toEqual({ kind: "point", position: { x: 0, y: 0 } });
    expect(link.to).toEqual({ kind: "point", position: { x: 100, y: 0 } });
  });

  it("reuses an already-routed polyline as routedPoints (geometry matches)", () => {
    // points = [from, ...corners, to]; interior corners become routedPoints so
    // getLinkPath reproduces the exact elbow path.
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 80 },
    ];
    const link = buildEdgePreviewLink(
      emptyScene(),
      { from: { x: 0, y: 0 }, to: { x: 100, y: 80 }, points },
      previewId,
      lid,
    );
    expect(link.routedPoints).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 80 },
    ]);
  });

  it("a 2-point (straight) polyline adds no routedPoints", () => {
    const link = buildEdgePreviewLink(
      emptyScene(),
      { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      previewId,
      lid,
    );
    expect(link.routedPoints).toBeUndefined();
  });
});
