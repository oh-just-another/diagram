import { afterEach, describe, expect, it } from "vitest";
import {
  RichTemplateRegistry,
  defaultRichRegistry,
  defineRichTemplate,
  type RichTemplate,
  type TemplateNode,
} from "../src/rich/index";

const root: TemplateNode = { type: "container", children: [] };

const tpl = (id: string, category = "basic"): RichTemplate =>
  defineRichTemplate({
    id,
    name: `Template ${id}`,
    category,
    icon: "<svg/>",
    root,
  });

describe("RichTemplateRegistry", () => {
  it("register / has / get round-trips a template", () => {
    const r = new RichTemplateRegistry();
    const t = tpl("rich.a");
    expect(r.has("rich.a")).toBe(false);
    r.register(t);
    expect(r.has("rich.a")).toBe(true);
    expect(r.get("rich.a")).toBe(t);
  });

  it("get returns undefined for a missing id", () => {
    const r = new RichTemplateRegistry();
    expect(r.get("nope")).toBeUndefined();
    expect(r.has("nope")).toBe(false);
  });

  it("register throws on a duplicate id", () => {
    const r = new RichTemplateRegistry();
    r.register(tpl("rich.dup"));
    expect(() => r.register(tpl("rich.dup"))).toThrow(/already registered/);
  });

  it("replace overwrites without throwing", () => {
    const r = new RichTemplateRegistry();
    r.register(tpl("rich.r"));
    const updated = { ...tpl("rich.r"), name: "Updated" };
    r.replace(updated);
    expect(r.get("rich.r")?.name).toBe("Updated");
  });

  it("replace also works as an insert for a fresh id", () => {
    const r = new RichTemplateRegistry();
    expect(r.has("rich.new")).toBe(false);
    r.replace(tpl("rich.new"));
    expect(r.has("rich.new")).toBe(true);
  });

  it("list returns every registered template", () => {
    const r = new RichTemplateRegistry();
    r.register(tpl("rich.1"));
    r.register(tpl("rich.2"));
    expect(
      r
        .list()
        .map((t) => t.id)
        .sort(),
    ).toEqual(["rich.1", "rich.2"]);
  });

  it("byCategory filters by exact category", () => {
    const r = new RichTemplateRegistry();
    r.register(tpl("rich.b1", "basic"));
    r.register(tpl("rich.f1", "flowchart"));
    expect(r.byCategory("basic").map((t) => t.id)).toEqual(["rich.b1"]);
    expect(r.byCategory("flowchart").map((t) => t.id)).toEqual(["rich.f1"]);
    expect(r.byCategory("missing")).toEqual([]);
  });

  it("clear empties the registry", () => {
    const r = new RichTemplateRegistry();
    r.register(tpl("rich.c"));
    expect(r.list()).toHaveLength(1);
    r.clear();
    expect(r.list()).toHaveLength(0);
    expect(r.has("rich.c")).toBe(false);
  });
});

describe("defaultRichRegistry singleton", () => {
  afterEach(() => {
    defaultRichRegistry.clear();
  });

  it("is a shared RichTemplateRegistry instance", () => {
    expect(defaultRichRegistry).toBeInstanceOf(RichTemplateRegistry);
    defaultRichRegistry.register(tpl("rich.singleton"));
    expect(defaultRichRegistry.get("rich.singleton")?.id).toBe("rich.singleton");
  });
});
