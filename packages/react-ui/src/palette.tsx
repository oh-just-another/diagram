import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { DEFAULT_LAYER_ID, orderForTop } from "@oh-just-another/scene";
import { shapeId } from "@oh-just-another/types";
import {
  defaultRegistry,
  type Category,
  type Template,
  type TemplateRegistry,
} from "@oh-just-another/templates";
import { walkDataTransfer } from "@oh-just-another/state";
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
        background: "var(--panel, #161616)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        color: "var(--text, #ddd)",
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
          color: "var(--muted, #777)",
          borderBottom: "1px solid var(--border, #2a2a2a)",
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
          color: "var(--muted, #888)",
          border: "none",
          borderBottom: "1px solid var(--border, #2a2a2a)",
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

// Module-level state — the canvas needs to know which template is
// being dragged so it can spin up a live placement preview. HTML5 DnD
// hides dataTransfer.getData() during dragover (security), so we use a
// pub/sub for the active drag instead.
let activeDrag: Template | null = null;
const dragListeners = new Set<() => void>();
const setActiveDrag = (tmpl: Template | null): void => {
  if (activeDrag === tmpl) return;
  activeDrag = tmpl;
  for (const fn of dragListeners) fn();
};

/** Currently-dragged palette template, or `null` when nothing is in flight. */
export const getActivePaletteDrag = (): Template | null => activeDrag;

/** Subscribe to active-drag changes. Returns unsubscribe. */
export const subscribePaletteDrag = (fn: () => void): (() => void) => {
  dragListeners.add(fn);
  return () => {
    dragListeners.delete(fn);
  };
};

/** Hook variant of `subscribePaletteDrag` — returns the current drag template. */
export const usePaletteDrag = (): Template | null => {
  const [tmpl, setTmpl] = useState<Template | null>(activeDrag);
  useEffect(() => subscribePaletteDrag(() => setTmpl(activeDrag)), []);
  return tmpl;
};

// Fake drag image so the browser doesn't paint its default ghost of
// the palette item — the actual shape rendered on canvas via
// `beginPlacement` is the only thing the user should see following
// the cursor.
//
// An in-DOM div with a single near-transparent pixel of content
// (background-color: rgba(0,0,0,0.01)) and a real width/height is
// accepted by browsers as a valid drag image while rendering
// effectively nothing.
let emptyDragImage: HTMLDivElement | null = null;
const getEmptyDragImage = (): HTMLDivElement | null => {
  if (typeof document === "undefined") return null;
  if (emptyDragImage && document.body.contains(emptyDragImage)) return emptyDragImage;
  const div = document.createElement("div");
  div.setAttribute("aria-hidden", "true");
  // Off-screen position keeps it out of layout. 1×1 size and a barely-
  // visible background satisfy the browser's "non-trivial drag image"
  // check without showing anything to the user.
  div.style.cssText =
    "position:fixed;top:-1000px;left:-1000px;width:1px;height:1px;background:rgba(0,0,0,0.01)";
  document.body.appendChild(div);
  emptyDragImage = div;
  return div;
};

const PaletteItem = ({ template }: { readonly template: Template }) => {
  const onDragStart = (ev: DragEvent<HTMLDivElement>) => {
    ev.dataTransfer.setData("application/x-template-id", template.id);
    ev.dataTransfer.effectAllowed = "copy";
    // Hide the browser's default ghost. The canvas renders the real
    // shape via beginPlacement.
    const ghost = getEmptyDragImage();
    if (ghost) ev.dataTransfer.setDragImage(ghost, 0, 0);
    setActiveDrag(template);
  };
  const onDragEnd = (): void => {
    setActiveDrag(null);
  };

  return (
    <div
      role="button"
      draggable
      title={template.name}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: "var(--button-bg, #1f1f1f)",
        border: "1px solid var(--border, #2f2f2f)",
        borderRadius: 4,
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        color: "var(--text, #bbb)",
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
 * Drag-to-place handlers for a canvas element. Wires the full preview
 * UX: as soon as the cursor enters the canvas with a palette drag in
 * flight, the template's default shape appears centred under the
 * cursor; dragover updates the position; drop commits as a single
 * history entry; dragleave / Escape cancels (no history).
 *
 * Returns props that should spread onto the canvas wrapper element:
 *
 * ```tsx
 * const placement = usePalettePlacement();
 * <section {...placement}>...</section>
 * ```
 */
export const usePalettePlacement = () => {
  const editor = useDiagramOptional();
  const placementRef = useRef<{
    update: (worldCenter: { x: number; y: number }) => void;
    commit: () => void;
    cancel: () => void;
  } | null>(null);

  // Escape cancels — only listens when a placement is active.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== "Escape" || !placementRef.current) return;
      placementRef.current.cancel();
      placementRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // If the drag ends outside any canvas — clean up.
  useEffect(
    () =>
      subscribePaletteDrag(() => {
        if (activeDrag === null && placementRef.current) {
          placementRef.current.cancel();
          placementRef.current = null;
        }
      }),
    [],
  );

  const ensurePlacement = (ev: DragEvent<HTMLElement>): boolean => {
    if (placementRef.current || !editor || !activeDrag) return false;
    const template = activeDrag;
    const rect = ev.currentTarget.getBoundingClientRect();
    const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    const worldPoint = editor.screenToWorld(screenPoint);
    const id = shapeId(
      `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    );
    const shape = template.factory({
      id,
      layerId: DEFAULT_LAYER_ID,
      position: worldPoint, // temporary; placement.update will recenter
      order: orderForTop(
        [...editor.scene.shapes.values()]
          .filter((s) => s.layerId === DEFAULT_LAYER_ID)
          .map((s) => s.order),
      ),
    });
    placementRef.current = editor.beginPlacement(shape);
    placementRef.current.update(worldPoint);
    return true;
  };

  const cursorWorld = (ev: DragEvent<HTMLElement>): { x: number; y: number } | null => {
    if (!editor) return null;
    const rect = ev.currentTarget.getBoundingClientRect();
    return editor.screenToWorld({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
  };

  return {
    onDragEnter: (ev: DragEvent<HTMLElement>): void => {
      if (!ev.dataTransfer.types.includes("application/x-template-id")) return;
      ev.preventDefault();
      ensurePlacement(ev);
    },
    onDragOver: (ev: DragEvent<HTMLElement>): void => {
      if (!ev.dataTransfer.types.includes("application/x-template-id")) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
      if (!placementRef.current) {
        ensurePlacement(ev);
      }
      const world = cursorWorld(ev);
      if (world && placementRef.current) placementRef.current.update(world);
    },
    onDragLeave: (ev: DragEvent<HTMLElement>): void => {
      // dragleave fires for every child element too — only act when the
      // pointer truly left the current target.
      if (ev.currentTarget.contains(ev.relatedTarget as Node | null)) return;
      if (placementRef.current) {
        placementRef.current.cancel();
        placementRef.current = null;
      }
    },
    onDrop: (ev: DragEvent<HTMLElement>): void => {
      ev.preventDefault();
      // Palette-template drop has priority — that's the active drag
      // started by `<Palette>` items.
      if (placementRef.current) {
        const world = cursorWorld(ev);
        if (world) placementRef.current.update(world);
        placementRef.current.commit();
        placementRef.current = null;
        return;
      }
      // Otherwise treat it as a file drop from the OS / browser.
      const dt = ev.dataTransfer;
      if (!dt) return;
      const world = cursorWorld(ev);
      const target = world ?? { x: 0, y: 0 };
      if (!editor) return;
      // Walk recursively — descends folders via `webkitGetAsEntry`
      // when available, falls back to the flat `files` list otherwise.
      // Each yielded leaf file is dispatched independently; one bad
      // sub-folder doesn't stop the rest.
      void (async () => {
        for await (const file of walkDataTransfer(dt, {
          onError: (path, err) =>
            console.warn(`[file-drop] failed at ${path}:`, err),
        })) {
          void editor.dispatchFileDrop(file, target);
        }
      })();
    },
  };
};

/**
 * Convenience wrapper to drop a palette item onto a host element. Hosts that
 * are not using `<DiagramCanvas>` can wire this themselves; the bundled
 * canvas component installs an equivalent handler automatically.
 *
 * Drops only — no live preview (use `usePalettePlacement` for that).
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
