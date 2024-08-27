import { describe, expect, it } from "vitest";
import {
  defineRichTemplate,
  extractPorts,
  layoutTree,
  resolveRichTemplateChain,
  type RichTemplate,
  type RichTemplateExtension,
} from "../src/rich/index";

describe("spot positioning", () => {
  it("pins child top-right corner to parent's top-right (badge pattern)", () => {
    const root = {
      type: "container" as const,
      layout: { width: 200, height: 100 },
      children: [
        {
          type: "container" as const,
          id: "badge",
          layout: {
            width: 20,
            height: 20,
            position: "spot" as const,
            anchor: "top-right" as const,
            anchorFocus: "top-right" as const,
            offset: { x: -4, y: 4 },
          },
        },
      ],
    };
    const tree = layoutTree(root);
    const badge = tree.children.find((c) => c.node.id === "badge")!;
    // Parent inner: 0..200 × 0..100. Top-right = (200, 0). Child focus
    // top-right = (20, 0). Origin = 200 - 20 + -4 = 176; 0 - 0 + 4 = 4.
    expect(badge.bounds).toMatchObject({ x: 176, y: 4, width: 20, height: 20 });
  });

  it("center / center keeps the child centred on the parent", () => {
    const root = {
      type: "container" as const,
      layout: { width: 200, height: 100 },
      children: [
        {
          type: "container" as const,
          id: "halo",
          layout: {
            width: 40,
            height: 30,
            position: "spot" as const,
            anchor: "center" as const,
            anchorFocus: "center" as const,
          },
        },
      ],
    };
    const tree = layoutTree(root);
    const halo = tree.children.find((c) => c.node.id === "halo")!;
    // Parent centre (100,50). Child focus centre (20,15). Origin = 80, 35.
    expect(halo.bounds).toMatchObject({ x: 80, y: 35, width: 40, height: 30 });
  });

  it("custom ratio anchor works like a named spot", () => {
    const root = {
      type: "container" as const,
      layout: { width: 200, height: 100 },
      children: [
        {
          type: "container" as const,
          id: "pin",
          layout: {
            width: 10,
            height: 10,
            position: "spot" as const,
            anchor: { ratio: { x: 0.25, y: 0.75 } },
            anchorFocus: "top-left" as const,
          },
        },
      ],
    };
    const tree = layoutTree(root);
    const pin = tree.children.find((c) => c.node.id === "pin")!;
    expect(pin.bounds).toMatchObject({ x: 50, y: 75 });
  });
});

describe("port nodes", () => {
  it("port positioned via spot becomes a ratio anchor on the resulting shape", () => {
    const root = {
      type: "container" as const,
      layout: { width: 200, height: 100 },
      children: [
        {
          type: "port" as const,
          id: "out",
          layout: {
            position: "spot" as const,
            anchor: "right" as const,
            anchorFocus: "center" as const,
          },
        },
      ],
    };
    const tree = layoutTree(root);
    const ports = extractPorts(tree);
    expect(ports.out).toEqual({
      kind: "ratio",
      position: { x: 1, y: 0.5 }, // right-centre of the 200×100 box
    });
  });

  it("multiple ports become separate entries", () => {
    const root = {
      type: "container" as const,
      layout: { width: 200, height: 100 },
      children: [
        {
          type: "port" as const,
          id: "in",
          layout: {
            position: "spot" as const,
            anchor: "left" as const,
            anchorFocus: "center" as const,
          },
        },
        {
          type: "port" as const,
          id: "out",
          layout: {
            position: "spot" as const,
            anchor: "right" as const,
            anchorFocus: "center" as const,
          },
        },
      ],
    };
    const tree = layoutTree(root);
    const ports = extractPorts(tree);
    expect(Object.keys(ports).sort()).toEqual(["in", "out"]);
    expect(ports.in).toEqual({ kind: "ratio", position: { x: 0, y: 0.5 } });
    expect(ports.out).toEqual({ kind: "ratio", position: { x: 1, y: 0.5 } });
  });
});

describe("resolveRichTemplateChain", () => {
  const base: RichTemplate = defineRichTemplate({
    id: "base.card",
    name: "Card",
    category: "rich",
    icon: "<svg/>",
    root: { type: "container", layout: { width: 200, height: 100 } },
    defaults: { title: "Base" },
  });
  const lookup = (id: string) => (id === "base.card" ? base : undefined);

  it("merges overrides on top of the base", () => {
    const ext: RichTemplateExtension = {
      id: "myorg.bigger",
      extends: "base.card",
      name: "Bigger card",
      overrides: { defaults: { title: "Bigger", subtitle: "extra" } },
    };
    const merged = resolveRichTemplateChain(ext, lookup);
    expect(merged.id).toBe("myorg.bigger");
    expect(merged.name).toBe("Bigger card");
    expect(merged.defaults).toEqual({ title: "Bigger", subtitle: "extra" });
    expect(merged.icon).toBe("<svg/>"); // inherited
  });

  it("throws when the chain points at a missing base", () => {
    expect(() =>
      resolveRichTemplateChain({ id: "x", extends: "missing" }, () => undefined),
    ).toThrow(/extends "missing"/);
  });

  it("walks multi-level chains", () => {
    const lvl1: RichTemplateExtension = {
      id: "lvl1",
      extends: "base.card",
      overrides: { defaults: { title: "L1" } },
    };
    const lvl2: RichTemplateExtension = {
      id: "lvl2",
      extends: "lvl1",
      overrides: { defaults: { subtitle: "L2 sub" } },
    };
    const lookupChain = (id: string) =>
      id === "base.card" ? base : id === "lvl1" ? lvl1 : id === "lvl2" ? lvl2 : undefined;
    const merged = resolveRichTemplateChain(lvl2, lookupChain);
    expect(merged.defaults).toEqual({ title: "L1", subtitle: "L2 sub" });
    expect(merged.id).toBe("lvl2");
  });
});
