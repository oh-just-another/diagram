import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { DEFAULT_LAYER_ID, orderForTop } from "@oh-just-another/scene";
import { shapeId } from "@oh-just-another/types";
import {
  defaultRegistry,
  type Category,
  type Template,
  type TemplateRegistry,
} from "@oh-just-another/templates";
import { useDiagramOptional } from "./hooks.js";
import { PALETTE_ITEM_SIZE, PALETTE_WIDTH } from "./constants.js";

/**
 * Draggable shape palette. Defaults to the global `defaultRegistry`; pass a
 * custom one if your host needs isolated registries (e.g. plugin sandbox).
 *
 * Templates are grouped into collapsible sections by `Category` — no tab
 * switching, so the user sees everything at once and scrolls vertically.
 * Each section header doubles as a collapse toggle.
 *
 * Drop semantics: an HTML5 drag is started with a `templateId` payload; the
 * canvas (or any other drop-target) reads it and calls
 * `editor.addShape(template.factory(...))`. Most hosts wire that in
 * `<DiagramCanvas>` itself.
 */
export interface PaletteProps {
  readonly registry?: TemplateRegistry;
  /** Order of category sections; only those present in the registry render. */
  readonly categories?: readonly Category[];
  /** Categories that start collapsed. Defaults to none. */
  readonly collapsedByDefault?: readonly Category[];
  readonly style?: CSSProperties;
  readonly className?: string;
}

const DEFAULT_CATEGORIES: readonly Category[] = ["basic", "flowchart", "custom", "rich"];

export const Palette = ({
  registry = defaultRegistry,
  categories = DEFAULT_CATEGORIES,
  collapsedByDefault = [],
  style,
  className,
}: PaletteProps) => {
  const present = useMemo(() => new Set(registry.categories()), [registry]);
  const visibleCategories = useMemo(
    () => categories.filter((c) => present.has(c)),
    [categories, present],
  );
  const sections = useMemo(
    () => visibleCategories.map((cat) => ({ category: cat, items: registry.byCategory(cat) })),
    [registry, visibleCategories],
  );

  const [collapsed, setCollapsed] = useState<ReadonlySet<Category>>(
    () => new Set(collapsedByDefault),
  );
  const toggle = (cat: Category): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <aside
      className={className}
      style={{
        width: PALETTE_WIDTH,
        background: "#161616",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        color: "#ddd",
        ...style,
      }}
    >
      <h2
        style={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "#777",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        Palette
      </h2>

      <div
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {sections.map(({ category, items }) => (
          <CategorySection
            key={category}
            category={category}
            items={items}
            collapsed={collapsed.has(category)}
            onToggle={() => toggle(category)}
          />
        ))}
      </div>
    </aside>
  );
};

const CategorySection = ({
  category,
  items,
  collapsed,
  onToggle,
}: {
  readonly category: Category;
  readonly items: readonly Template[];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}) => {
  if (items.length === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={{
          width: "100%",
          background: "transparent",
          color: "#888",
          border: "none",
          borderBottom: "1px solid #2a2a2a",
          padding: "8px 12px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          font: "inherit",
          fontWeight: 600,
        }}
      >
        <span>{category}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{collapsed ? "▶" : "▼"}</span>
      </button>
      {collapsed ? null : (
        <div
          style={{
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 6,
            alignContent: "start",
            borderBottom: "1px solid #2a2a2a",
          }}
        >
          {items.map((template) => (
            <PaletteItem key={template.id} template={template} />
          ))}
        </div>
      )}
    </section>
  );
};

const PaletteItem = ({ template }: { readonly template: Template }) => {
  const onDragStart = (ev: DragEvent<HTMLDivElement>) => {
    ev.dataTransfer.setData("application/x-template-id", template.id);
    ev.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      role="button"
      draggable
      title={template.name}
      onDragStart={onDragStart}
      style={{
        background: "#1f1f1f",
        border: "1px solid #2f2f2f",
        borderRadius: 4,
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        color: "#bbb",
        cursor: "grab",
        padding: "6px 4px",
        textAlign: "center",
        fontSize: 10,
        lineHeight: 1.1,
      }}
    >
      <span
        style={{ width: PALETTE_ITEM_SIZE, height: PALETTE_ITEM_SIZE }}
        // Icons are trusted SVG markup defined in the registry by template
        // authors — same source of truth as the canvas renderer uses.
        dangerouslySetInnerHTML={{ __html: template.icon }}
      />
      <span>{template.name}</span>
    </div>
  );
};

/**
 * Convenience wrapper to drop a palette item onto a host element. Hosts that
 * are not using `<DiagramCanvas>` can wire this themselves; the bundled
 * canvas component installs an equivalent handler automatically.
 */
export const usePaletteDropHandler = () => {
  const editor = useDiagramOptional();
  return (ev: DragEvent<HTMLElement>) => {
    ev.preventDefault();
    if (!editor) return; // surface not mounted yet
    const templateId = ev.dataTransfer.getData("application/x-template-id");
    if (!templateId) return;
    const template = defaultRegistry.get(templateId);
    if (!template) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    const worldPoint = editor.screenToWorld(screenPoint);
    const id = shapeId(
      `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    );
    const shape = template.factory({
      id,
      layerId: DEFAULT_LAYER_ID,
      position: worldPoint,
      order: orderForTop(
        [...editor.scene.shapes.values()]
          .filter((s) => s.layerId === DEFAULT_LAYER_ID)
          .map((s) => s.order),
      ),
    });
    editor.addShape(shape);
  };
};
