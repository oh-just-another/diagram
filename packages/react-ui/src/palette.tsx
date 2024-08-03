import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { DEFAULT_LAYER_ID, orderForTop } from "@oh-just-another/scene";
import { shapeId } from "@oh-just-another/types";
import {
  defaultRegistry,
  type Category,
  type Template,
  type TemplateRegistry,
} from "@oh-just-another/templates";
import { useDiagram } from "./hooks.js";

/**
 * Draggable shape palette. Defaults to the global `defaultRegistry`; pass a
 * custom one if your host needs isolated registries (e.g. plugin sandbox).
 *
 * Drop semantics: an HTML5 drag is started with a `templateId` payload; the
 * canvas (or any other drop-target) reads it and calls
 * `editor.addShape(template.factory(...))`. Most hosts wire that in
 * `<DiagramCanvas>` itself.
 */
export interface PaletteProps {
  readonly registry?: TemplateRegistry;
  /** Order of category tabs; only those present in the registry render. */
  readonly categories?: readonly Category[];
  readonly initialCategory?: Category;
  readonly style?: CSSProperties;
  readonly className?: string;
}

const DEFAULT_CATEGORIES: readonly Category[] = ["basic", "flowchart", "custom", "rich"];

export const Palette = ({
  registry = defaultRegistry,
  categories = DEFAULT_CATEGORIES,
  initialCategory,
  style,
  className,
}: PaletteProps) => {
  const present = useMemo(() => new Set(registry.categories()), [registry]);
  const visibleTabs = useMemo(
    () => categories.filter((c) => present.has(c)),
    [categories, present],
  );

  const fallback = visibleTabs[0] ?? "basic";
  const [active, setActive] = useState<Category>(initialCategory ?? fallback);

  const items = useMemo(() => registry.byCategory(active), [registry, active]);

  return (
    <aside
      className={className}
      style={{
        width: 200,
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
          display: "flex",
          gap: 4,
          padding: "6px 8px",
          borderBottom: "1px solid #2a2a2a",
          flexWrap: "wrap",
        }}
      >
        {visibleTabs.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActive(cat)}
            style={{
              background: cat === active ? "#1a3d6e" : "transparent",
              color: cat === active ? "#fff" : "#888",
              border: `1px solid ${cat === active ? "#1a73e8" : "#2a2a2a"}`,
              borderRadius: 3,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          padding: 8,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 6,
          alignContent: "start",
        }}
      >
        {items.map((template) => (
          <PaletteItem key={template.id} template={template} />
        ))}
      </div>
    </aside>
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
        style={{ width: 28, height: 28 }}
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
  const editor = useDiagram();
  return (ev: DragEvent<HTMLElement>) => {
    ev.preventDefault();
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
