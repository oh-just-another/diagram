/**
 * Behavioural coverage for `<Palette>`: category sections render from a
 * registry, header buttons collapse / expand their section, a live search
 * query flattens the list and filters by match, and dragging an item
 * publishes the active-drag template (consumed by the canvas preview) and
 * clears it on drag-end.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TemplateRegistry, installBuiltinTemplates } from "@oh-just-another/templates";
import { Palette, getActivePaletteDrag } from "../src/index";

afterEach(cleanup);

const makeRegistry = (): TemplateRegistry => {
  const registry = new TemplateRegistry();
  installBuiltinTemplates(registry);
  return registry;
};

const buildDataTransfer = () => {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
    setDragImage: () => {},
    effectAllowed: "",
    types: [...store.keys()],
    _store: store,
  };
};

describe("Palette accessibility", () => {
  it("items are focusable buttons named with the geometry hint and the drag affordance", () => {
    const registry = makeRegistry();
    const { container } = render(<Palette registry={registry} />);
    const items = [...container.querySelectorAll('[role="button"].du-palette-item')];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.getAttribute("tabindex")).toBe("0");
    const labels = items.map((i) => i.getAttribute("aria-label"));
    expect(labels).toContain("Rectangle, draggable");
    expect(labels).toContain("Decision, Diamond, draggable");
    expect(labels).toContain("Process, Rectangle, draggable");
  });
});

describe("Palette sections", () => {
  it("renders a section header per present category", () => {
    const registry = makeRegistry();
    const { container } = render(<Palette registry={registry} />);
    const headers = container.querySelectorAll("button.du-palette-category");
    expect(headers.length).toBeGreaterThan(0);
    // "basic" is always present in the built-in set.
    const labels = [...headers].map((h) => h.textContent);
    expect(labels.some((l) => l?.includes("basic"))).toBe(true);
  });

  it("collapses and expands a section on header click", () => {
    const registry = makeRegistry();
    const { container } = render(<Palette registry={registry} />);
    const header = container.querySelector("button.du-palette-category") as HTMLButtonElement;
    expect(header.getAttribute("aria-expanded")).toBe("true");
    const section = header.closest("section") as HTMLElement;
    expect(section.querySelector(".du-palette-grid, .du-palette-list")).not.toBeNull();

    act(() => {
      fireEvent.click(header);
    });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    // Item grid removed while collapsed.
    expect(section.querySelector(".du-palette-grid, .du-palette-list")).toBeNull();

    act(() => {
      fireEvent.click(header);
    });
    expect(header.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Palette search", () => {
  it("flattens sections and shows only matching templates", () => {
    const registry = makeRegistry();
    const { container } = render(<Palette registry={registry} searchQuery="rectangle" />);
    // No section headers in flat-search mode.
    expect(container.querySelector("button.du-palette-category")).toBeNull();
    const items = container.querySelectorAll(".du-palette-item");
    expect(items.length).toBeGreaterThan(0);
    // The query narrows the set — it is not the full registry.
    const total = makeRegistry()
      .categories()
      .reduce((n, c) => n + makeRegistry().byCategory(c).length, 0);
    expect(items.length).toBeLessThan(total);
    // The literal "Rectangle" template is among the matches.
    const titles = [...items].map((i) => i.getAttribute("title")?.toLowerCase() ?? "");
    expect(titles.some((t) => t.includes("rectangle"))).toBe(true);
  });

  it("shows an empty-state message when nothing matches", () => {
    const registry = makeRegistry();
    const { container } = render(<Palette registry={registry} searchQuery="zzznope" />);
    expect(container.querySelector(".du-palette-empty")?.textContent).toContain("zzznope");
    expect(container.querySelectorAll(".du-palette-item").length).toBe(0);
  });
});

describe("Palette drag", () => {
  it("publishes the dragged template as the active drag and clears it on drag-end", () => {
    const registry = makeRegistry();
    const { container } = render(<Palette registry={registry} searchQuery="rectangle" />);
    const item = container.querySelector(".du-palette-item") as HTMLElement;
    const dt = buildDataTransfer();

    act(() => {
      fireEvent.dragStart(item, { dataTransfer: dt });
    });
    // The payload the canvas drop-target reads.
    expect(dt.getData("application/x-template-id")).toContain("rectangle");
    const active = getActivePaletteDrag();
    expect(active).not.toBeNull();
    expect(active?.id).toContain("rectangle");

    act(() => {
      fireEvent.dragEnd(item);
    });
    expect(getActivePaletteDrag()).toBeNull();
  });
});
