import { describe, expect, it } from "vitest";
import { layerId, shapeId } from "@oh-just-another/types";
import { orderBetween } from "@oh-just-another/scene";
import {
  BUILTIN_TEMPLATES,
  TemplateRegistry,
  installBuiltinTemplates,
  type Template,
} from "../src/index";

const dummy: Template = {
  id: "demo.dummy",
  name: "Dummy",
  category: "basic",
  icon: "<svg/>",
  factory: (c) => ({
    id: c.id,
    layerId: c.layerId,
    type: "rectangle",
    position: c.position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: c.order,
    style: { fill: "#000" },
    width: 50,
    height: 50,
  }),
};

const ctx = () => ({
  id: shapeId("x"),
  layerId: layerId("L"),
  position: { x: 0, y: 0 },
  order: orderBetween(null, null),
});

describe("TemplateRegistry", () => {
  it("register / has / get", () => {
    const r = new TemplateRegistry();
    expect(r.has(dummy.id)).toBe(false);
    r.register(dummy);
    expect(r.has(dummy.id)).toBe(true);
    expect(r.get(dummy.id)).toBe(dummy);
  });

  it("duplicate register throws", () => {
    const r = new TemplateRegistry();
    r.register(dummy);
    expect(() => r.register(dummy)).toThrow(/already registered/);
  });

  it("replace overwrites without throwing", () => {
    const r = new TemplateRegistry();
    r.register(dummy);
    const updated = { ...dummy, name: "Dummy v2" };
    r.replace(updated);
    expect(r.get(dummy.id)?.name).toBe("Dummy v2");
  });

  it("byCategory filters by exact match", () => {
    const r = new TemplateRegistry();
    r.register(dummy);
    r.register({ ...dummy, id: "demo.other", category: "flowchart" });
    expect(r.byCategory("basic").map((t) => t.id)).toEqual([dummy.id]);
    expect(r.byCategory("flowchart").map((t) => t.id)).toEqual(["demo.other"]);
  });

  it("categories lists distinct categories in registration order", () => {
    const r = new TemplateRegistry();
    r.register(dummy);
    r.register({ ...dummy, id: "demo.b", category: "flowchart" });
    r.register({ ...dummy, id: "demo.c", category: "basic" });
    expect(r.categories()).toEqual(["basic", "flowchart"]);
  });

  it("factory returns a typed shape", () => {
    const r = new TemplateRegistry();
    r.register(dummy);
    const shape = r.get(dummy.id)!.factory(ctx());
    expect(shape.type).toBe("rectangle");
    expect(shape.id).toBe(shapeId("x"));
    expect(shape.position).toEqual({ x: 0, y: 0 });
  });

  it("clear empties the registry", () => {
    const r = new TemplateRegistry();
    r.register(dummy);
    r.clear();
    expect(r.list()).toHaveLength(0);
  });
});

describe("BUILTIN_TEMPLATES + installBuiltinTemplates", () => {
  it("ships at least 6 basic + 5 flowchart templates", () => {
    const basic = BUILTIN_TEMPLATES.filter((t) => t.category === "basic");
    const flow = BUILTIN_TEMPLATES.filter((t) => t.category === "flowchart");
    expect(basic.length).toBeGreaterThanOrEqual(6);
    expect(flow.length).toBeGreaterThanOrEqual(5);
  });

  it("every built-in factory produces a valid shape", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const shape = t.factory(ctx());
      expect(shape.position).toEqual({ x: 0, y: 0 });
      expect(shape.layerId).toBe(layerId("L"));
    }
  });

  it("install populates a fresh registry without errors", () => {
    const r = new TemplateRegistry();
    installBuiltinTemplates(r);
    expect(r.list().length).toBe(BUILTIN_TEMPLATES.length);
  });

  it("each built-in id is unique", () => {
    const ids = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(BUILTIN_TEMPLATES.length);
  });

  it("each built-in has a non-empty SVG icon", () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.icon).toMatch(/^<svg/);
    }
  });
});
