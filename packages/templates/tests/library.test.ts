import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import { isRectangle, orderBetween } from "@oh-just-another/scene";
import {
  TemplateRegistry,
  TemplateLibraryError,
  loadTemplateLibrary,
  parseTemplateLibrary,
  templateFromSpec,
  templatesFromLibrary,
  type TemplateLibrarySpec,
  type TemplateSpec,
} from "../src/index";

const validSpec: TemplateSpec = {
  id: "demo.rect",
  name: "My rect",
  category: "basic",
  icon: "<svg/>",
  blueprint: {
    type: "rectangle",
    style: { fill: "#abc" },
    width: 100,
    height: 50,
  },
};

const validLibrary = (...templates: TemplateSpec[]): TemplateLibrarySpec => ({
  format: "oh-just-another/template-library",
  version: 1,
  templates,
});

const ctx = () => ({
  id: elementId("x"),
  layerId: layerId("L"),
  position: { x: 5, y: 7 },
  order: orderBetween(null, null),
});

describe("templateFromSpec", () => {
  it("produces a callable Template", () => {
    const tpl = templateFromSpec(validSpec);
    expect(tpl.id).toBe(validSpec.id);
    const shape = tpl.factory(ctx());
    expect(shape.type).toBe("rectangle");
    expect(shape.position).toEqual({ x: 5, y: 7 });
    if (isRectangle(shape)) expect(shape.width).toBe(100);
  });

  it("supports every built-in shape kind in blueprint", () => {
    const variants: TemplateSpec[] = [
      validSpec,
      { ...validSpec, id: "e", blueprint: { type: "ellipse", style: {}, width: 50, height: 50 } },
      {
        ...validSpec,
        id: "p",
        blueprint: {
          type: "polygon",
          style: {},
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      },
      {
        ...validSpec,
        id: "t",
        blueprint: {
          type: "text",
          style: { fill: "#000" },
          text: "Hi",
          fontFamily: "system-ui",
          fontSize: 14,
        },
      },
      {
        ...validSpec,
        id: "i",
        blueprint: { type: "image", style: {}, src: "data:,", width: 32, height: 32 },
      },
    ];
    for (const spec of variants) {
      const tpl = templateFromSpec(spec);
      expect(tpl.factory(ctx()).type).toBe(spec.blueprint.type);
    }
  });
});

describe("parseTemplateLibrary", () => {
  it("accepts a valid library", () => {
    expect(() => parseTemplateLibrary(validLibrary(validSpec))).not.toThrow();
  });

  it("rejects wrong format", () => {
    expect(() => parseTemplateLibrary({ ...validLibrary(validSpec), format: "x" })).toThrow(
      TemplateLibraryError,
    );
  });

  it("rejects wrong version", () => {
    expect(() => parseTemplateLibrary({ ...validLibrary(validSpec), version: 99 })).toThrow();
  });

  it("rejects malformed blueprint", () => {
    expect(() =>
      parseTemplateLibrary(
        validLibrary({
          ...validSpec,
          blueprint: { type: "rectangle", style: {}, width: "wrong" } as never,
        }),
      ),
    ).toThrow(TemplateLibraryError);
  });
});

describe("templatesFromLibrary", () => {
  it("converts every spec into a template", () => {
    const lib = validLibrary(validSpec, { ...validSpec, id: "demo.b" });
    expect(templatesFromLibrary(lib)).toHaveLength(2);
  });
});

describe("loadTemplateLibrary", () => {
  it("accepts a parsed object", () => {
    const r = new TemplateRegistry();
    loadTemplateLibrary(validLibrary(validSpec), r);
    expect(r.has(validSpec.id)).toBe(true);
  });

  it("accepts a JSON string", () => {
    const r = new TemplateRegistry();
    loadTemplateLibrary(JSON.stringify(validLibrary(validSpec)), r);
    expect(r.has(validSpec.id)).toBe(true);
  });

  it("throws on duplicate id by default", () => {
    const r = new TemplateRegistry();
    loadTemplateLibrary(validLibrary(validSpec), r);
    expect(() => loadTemplateLibrary(validLibrary(validSpec), r)).toThrow(/already registered/);
  });

  it("replace: true overwrites instead", () => {
    const r = new TemplateRegistry();
    loadTemplateLibrary(validLibrary(validSpec), r);
    loadTemplateLibrary(validLibrary({ ...validSpec, name: "Updated" }), r, { replace: true });
    expect(r.get(validSpec.id)?.name).toBe("Updated");
  });

  it("invalid JSON string surfaces TemplateLibraryError", () => {
    const r = new TemplateRegistry();
    expect(() => loadTemplateLibrary("{not json}", r)).toThrow(TemplateLibraryError);
  });
});
