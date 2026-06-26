import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import type { Bounds } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  expandDropZoneToFit,
  getContainerSpec,
  getDropZoneWorld,
  getDropZonesWorld,
  isContainer,
  orderBetween,
  registerContainerResolver,
  registerContainerZonesResolver,
  type Element,
  type ElementBase,
} from "../src/index";

const baseRect = (id: string, overrides: Partial<Element> = {}): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 400,
    height: 200,
    ...overrides,
  }) as Element;

describe("getContainerSpec — fallback arms", () => {
  it("returns null for a shape with no metadata", () => {
    const r = baseRect("r");
    expect(getContainerSpec(r)).toBeNull();
    expect(isContainer(r)).toBe(false);
    expect(getDropZoneWorld(r)).toBeNull();
  });

  it("returns null when metadata.container is not an object", () => {
    // Non-object container (e.g. a stray boolean) hits `typeof m !== 'object'`.
    const r = baseRect("r", {
      metadata: { container: true } as unknown as Readonly<Record<string, unknown>>,
    });
    expect(getContainerSpec(r)).toBeNull();
  });

  it("returns null when metadata.container has no dropZone", () => {
    const r = baseRect("r", { metadata: { container: { padding: 4 } } });
    expect(getContainerSpec(r)).toBeNull();
  });

  it("reads a static container with no padding (padding omitted arm)", () => {
    const dropZone: Bounds = { x: 5, y: 5, width: 100, height: 80 };
    const r = baseRect("r", { metadata: { container: { dropZone } } });
    const spec = getContainerSpec(r)!;
    expect(spec.dropZone).toEqual(dropZone);
    expect(spec.padding).toBeUndefined();
  });

  it("synthesises an autoLayout drop-zone with the default padding (0) when none given", () => {
    // autoLayout present, no container.padding → AUTO_LAYOUT_DEFAULT_PADDING = 0.
    const r = baseRect("r", {
      width: 300,
      height: 100,
      metadata: { autoLayout: { kind: "stack" } },
    });
    const spec = getContainerSpec(r)!;
    expect(spec.padding).toBe(0);
    expect(spec.dropZone).toEqual({ x: 0, y: 0, width: 300, height: 100 });
  });

  it("does not synthesise when autoLayout is present but width/height are absent", () => {
    // A text-like shape (no numeric width/height) with autoLayout falls
    // through the synthesiser guard and lands on the static fallback (null).
    const textish = {
      id: elementId("t"),
      layerId: DEFAULT_LAYER_ID,
      type: "text",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      metadata: { autoLayout: { kind: "stack" } },
    } as unknown as ElementBase;
    expect(getContainerSpec(textish)).toBeNull();
  });
});

describe("container resolver chain", () => {
  // Resolver keyed on a private marker so it stays inert for every other
  // test's shapes (module-level registry has no unregister).
  const RESOLVER_MARK = "__container_extra_resolver__";
  const resolverZone: Bounds = { x: 1, y: 2, width: 30, height: 40 };
  registerContainerResolver((shape) => {
    const meta = shape.metadata as { [RESOLVER_MARK]?: boolean } | undefined;
    return meta?.[RESOLVER_MARK] ? { dropZone: resolverZone, padding: 3 } : null;
  });

  it("a registered resolver wins over metadata.container", () => {
    const r = baseRect("r", {
      metadata: {
        [RESOLVER_MARK]: true,
        container: { dropZone: { x: 99, y: 99, width: 1, height: 1 } },
      } as unknown as Readonly<Record<string, unknown>>,
    });
    const spec = getContainerSpec(r)!;
    expect(spec.dropZone).toEqual(resolverZone);
    expect(spec.padding).toBe(3);
  });

  it("registerContainerResolver is idempotent for the same reference", () => {
    const fn = (): null => null;
    // Calling twice must not throw / double-register; behaviour stays a no-op.
    registerContainerResolver(fn);
    registerContainerResolver(fn);
    expect(getContainerSpec(baseRect("r", { metadata: {} }))).toBeNull();
  });
});

describe("getDropZonesWorld — single vs multi-zone", () => {
  it("falls back to the single drop-zone (wrapped) for plain containers", () => {
    const r = baseRect("r", {
      position: { x: 100, y: 50 },
      metadata: { container: { dropZone: { x: 10, y: 20, width: 100, height: 60 } } },
    });
    const zones = getDropZonesWorld(r);
    expect(zones).toEqual([{ x: 110, y: 70, width: 100, height: 60 }]);
  });

  it("returns [] for a non-container shape", () => {
    expect(getDropZonesWorld(baseRect("r", { metadata: {} }))).toEqual([]);
  });

  it("uses a registered zones-resolver and translates every lane to world", () => {
    const ZONES_MARK = "__zones_extra_resolver__";
    registerContainerZonesResolver((shape) => {
      const meta = shape.metadata as { [ZONES_MARK]?: boolean } | undefined;
      return meta?.[ZONES_MARK]
        ? [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 50, y: 0, width: 10, height: 10 },
          ]
        : null;
    });
    const r = baseRect("r", {
      position: { x: 200, y: 300 },
      metadata: { [ZONES_MARK]: true } as unknown as Readonly<Record<string, unknown>>,
    });
    const zones = getDropZonesWorld(r);
    expect(zones).toHaveLength(2);
    expect(zones[0]).toEqual({ x: 200, y: 300, width: 10, height: 10 });
    expect(zones[1]).toEqual({ x: 250, y: 300, width: 10, height: 10 });
  });
});

describe("expandDropZoneToFit — spec/padding arms", () => {
  it("returns null when the shape is not a container", () => {
    const r = baseRect("r", { metadata: {} });
    expect(expandDropZoneToFit(r, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it("treats a missing padding as 0 when growing", () => {
    // Static container without padding → spec.padding ?? 0 takes the 0 arm.
    const r = baseRect("r", {
      position: { x: 0, y: 0 },
      metadata: { container: { dropZone: { x: 0, y: 0, width: 100, height: 100 } } },
    });
    const next = expandDropZoneToFit(r, { x: 120, y: 10, width: 20, height: 20 })!;
    expect(next).not.toBeNull();
    // Right edge reaches child right (140) with zero padding.
    expect(next.x + next.width).toBe(140);
  });
});
