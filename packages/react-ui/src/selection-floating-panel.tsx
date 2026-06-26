import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type Placement,
  type VirtualElement,
} from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getDescendantsOf,
  getElementWorldBounds,
  isGroup,
  type ElementBase,
} from "@oh-just-another/scene";
import { computeLinkWorldBounds } from "@oh-just-another/renderer-core";
import type { Editor } from "@oh-just-another/state";
import {
  SELECTION_PANEL_OFFSET_PX,
  SELECTION_PANEL_EDGE_INSET_TOP_PX,
  SELECTION_PANEL_EDGE_INSET_RIGHT_PX,
  SELECTION_PANEL_EDGE_INSET_BOTTOM_PX,
  SELECTION_PANEL_EDGE_INSET_LEFT_PX,
} from "./constants.js";
import { useDiagramOptional, useMobileLayout } from "./hooks.js";
import { usePortalContainer } from "./portal-container.js";
import { PropertyPanel } from "./property-panel.js";

/**
 * Floating selection panel. Anchors above the bounding box of the
 * current selection (`union(getElementWorldBounds(s))`), flips to
 * `bottom`/`right`/`left` if there's no room above. Repositions live on
 * selection, scene, and viewport events, plus floating-ui's `autoUpdate`
 * (window resize / ancestor scroll).
 *
 * Rendered to `document.body` via `createPortal` so the panel survives
 * any overflow:hidden on the canvas container. Default z-index sits
 * above the canvas chrome but below modals.
 *
 * Hidden whenever the selection is empty. Not hidden during gestures —
 * the position keeps tracking the moving bbox.
 *
 * Content is delegated to `<PropertyPanel>` (a compact horizontal
 * toolbar). The dispatcher by selection-type lives inside that component.
 */
export interface SelectionFloatingPanelProps {
  /**
   * Distance in px between panel edge and selection bbox.
   * Default `12`.
   */
  readonly offset?: number;
  /**
   * Default placement; `flip` middleware tries fallbacks in order.
   * Default `"top"` with `["bottom","right","left"]` fallback.
   */
  readonly placement?: Placement;
  /**
   * Per-side inset (in px) that shrinks the region the panel may occupy,
   * measured from each viewport edge. Fed to the `shift` middleware as a
   * per-side `padding` so the panel never lands over fixed chrome on that
   * side (top toolbar, bottom bar, docked side panels). Each side defaults
   * to its `SELECTION_PANEL_EDGE_INSET_*_PX` constant; pass a partial to
   * override only some sides.
   */
  readonly edgeInset?: {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  };
}

export const SelectionFloatingPanel = ({
  offset: gap = SELECTION_PANEL_OFFSET_PX,
  placement = "top",
  edgeInset,
}: SelectionFloatingPanelProps = {}) => {
  const edgePadding = {
    top: edgeInset?.top ?? SELECTION_PANEL_EDGE_INSET_TOP_PX,
    right: edgeInset?.right ?? SELECTION_PANEL_EDGE_INSET_RIGHT_PX,
    bottom: edgeInset?.bottom ?? SELECTION_PANEL_EDGE_INSET_BOTTOM_PX,
    left: edgeInset?.left ?? SELECTION_PANEL_EDGE_INSET_LEFT_PX,
  };
  const editor = useDiagramOptional();
  const portalContainer = usePortalContainer();
  // On touch / narrow screens the panel docks to the bottom instead of
  // floating at the selection bbox — no floating-ui math.
  const mobile = useMobileLayout();
  const [hasSelection, setHasSelection] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Force-rerender token bumped every time selection or scene or
  // viewport changes. The actual position computation lives in a
  // layoutEffect that depends on this token + editor.
  const [tick, setTick] = useState(0);
  // Hide the panel until floating-ui has resolved its first
  // `computePosition` for the current selection, otherwise the panel
  // mounts at (0, 0) for one frame before snapping into place.
  const [positioned, setPositioned] = useState(false);

  // Subscribe to editor events via the umbrella `"change"` event:
  //
  // 1. `editor.selectedLink` is NOT included in the editor's observable
  //    snapshot, so the `"selection"` event doesn't fire on edge select /
  //    deselect — leaving an edge-only selection invisible to a panel
  //    that only subscribes to `"selection"`.
  // 2. The panel needs to react to scene, viewport, AND selection, and
  //    `"change"` covers all three plus history changes. Position
  //    re-compute is cheap.
  useEffect(() => {
    if (!editor) return;
    const refresh = () => {
      const prev = editor.selection;
      void prev;
      const next = editor.selection.size > 0 || editor.selectedLink !== null;
      setHasSelection((had) => {
        // Reset the "positioned" flag whenever the panel transitions
        // from hidden → visible so the new selection's first paint waits
        // for floating-ui to land, avoiding a flash at the old position.
        if (!had && next) setPositioned(false);
        return next;
      });
      setTick((t) => t + 1);
    };
    refresh(); // initial state
    return editor.on("change", refresh);
  }, [editor]);

  useLayoutEffect(() => {
    // Mobile docks to the bottom — skip the floating-ui positioning entirely.
    if (!editor || !hasSelection || mobile) return;
    const panel = panelRef.current;
    if (!panel) return;
    const virtualEl = makeSelectionVirtualEl(editor);
    if (!virtualEl) return;

    const update = () => {
      void computePosition(virtualEl, panel, {
        placement,
        middleware: [
          offset(gap),
          // `padding: edgePadding` makes the top/bottom (and the
          // placement-axis) insets effective: `flip` treats the viewport
          // as shrunk by the per-side inset, so it flips to a fallback
          // side once the panel comes within that inset of the current
          // placement's edge — not only on a real 0px overflow. `shift`
          // below only slides the panel along the cross axis.
          flip({ fallbackPlacements: ["bottom", "right", "left"], padding: edgePadding }),
          // Cross-axis clamp only (horizontal for a top/bottom-placed panel) —
          // the left/right insets. NOT crossAxis: that would slide the panel
          // along the placement axis, over the element, instead of letting
          // `flip` hand it to the opposite side.
          shift({ padding: edgePadding }),
        ],
      }).then(({ x, y }) => {
        panel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        // Reveal the panel after the first successful position. The
        // `positioned` state gate keeps it invisible until floating-ui
        // resolves, avoiding a one-frame flash at (0, 0).
        setPositioned(true);
      });
    };
    update();
    // `autoUpdate` covers scroll / resize. The `tick` re-runs above cover
    // selection / scene / viewport (which `autoUpdate` doesn't know
    // about — those come from the event emitter).
    const cleanup = autoUpdate(virtualEl, panel, update);
    return cleanup;
    // Depend on the four primitive insets (not the freshly-built
    // `edgePadding` object, which would change identity every render).
  }, [
    editor,
    hasSelection,
    mobile,
    tick,
    gap,
    placement,
    edgePadding.top,
    edgePadding.right,
    edgePadding.bottom,
    edgePadding.left,
  ]);

  if (!editor || !hasSelection) return null;

  // Mobile: dock the panel to the bottom edge (above the bottom bar +
  // safe-area), full width. The PropertyPanel's own mobile variant shows
  // the primary row + ⋮ expand. No floating-ui, no flash-gate.
  if (mobile) {
    return createPortal(
      <div className="du-sel-panel-dock" role="toolbar" aria-label="Selection actions">
        <PropertyPanel mobile />
      </div>,
      portalContainer,
    );
  }

  // Portal to body so the panel survives any overflow:hidden on the
  // canvas container. Inline `transform` is set by the layout effect
  // above; the pre-paint at (0,0) is hidden by the CSS opacity 0 → 1
  // animation on `.du-sel-panel-floating`.
  return createPortal(
    <div
      ref={panelRef}
      className="du-sel-panel-floating"
      role="toolbar"
      aria-label="Selection actions"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1500,
        pointerEvents: "auto",
        // Hide-until-positioned so the user never sees the panel at
        // (0, 0) for the first frame. `pointer-events:none` while hidden
        // so a stray click during the gap doesn't fire on the
        // out-of-place panel.
        opacity: positioned ? 1 : 0,
        transition: positioned ? "opacity 120ms ease" : "none",
        ...(positioned ? {} : { pointerEvents: "none" }),
      }}
    >
      <PropertyPanel />
    </div>,
    portalContainer,
  );
};

// ---------------------------------------------------------------------------
// Selection bbox → virtual element
// ---------------------------------------------------------------------------

/**
 * Construct a floating-ui virtual element whose `getBoundingClientRect`
 * returns the client-space rect of the current selection's world-space
 * bounding box. Returns `null` when nothing is selected.
 *
 * Hot path — called whenever floating-ui recomputes. Reads
 * `editor.selection`, `editor.selectedLink`, `editor.scene`, and
 * `editor.hostElement` directly each call so freshness is guaranteed
 * without React state plumbing.
 */
const makeSelectionVirtualEl = (editor: Editor): VirtualElement | null => {
  const host = editor.hostElement;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hostElement typed non-null but may be unset before mount
  if (!host) return null;
  return {
    getBoundingClientRect: () => {
      const bbox = computeSelectionWorldBbox(editor);
      if (!bbox) {
        // No selection — return a degenerate 0×0 rect at host top-left.
        // floating-ui handles this gracefully; the panel hides when
        // selection is empty so this branch shouldn't be reached.
        const r = host.getBoundingClientRect();
        return new DOMRect(r.left, r.top, 0, 0);
      }
      const v = editor.scene.viewport;
      const sx = (bbox.x - v.pan.x) * v.zoom;
      const sy = (bbox.y - v.pan.y) * v.zoom;
      const sw = Math.max(1, bbox.width * v.zoom);
      const sh = Math.max(1, bbox.height * v.zoom);
      const hostRect = host.getBoundingClientRect();
      return new DOMRect(hostRect.left + sx, hostRect.top + sy, sw, sh);
    },
    contextElement: host,
  };
};

const computeSelectionWorldBbox = (
  editor: Editor,
): { x: number; y: number; width: number; height: number } | null => {
  const shapes: ElementBase[] = [];
  for (const id of editor.selection) {
    const s = editor.scene.elements.get(id);
    if (s) shapes.push(s);
  }
  if (shapes.length === 0) {
    // Link-only selection: take the edge's resolved world bbox. Uses the
    // same path-based bounds as the renderer (`computeLinkWorldBounds` →
    // `getLinkPath`), so every endpoint kind — point / anchor / outline /
    // floating — and the elbow / curve bends are covered.
    const linkId = editor.selectedLink;
    if (linkId) {
      const edge = editor.scene.links.get(linkId);
      if (edge) return computeLinkWorldBounds(editor.scene, edge);
    }
    return null;
  }
  let acc: { x: number; y: number; width: number; height: number } | null = null;
  for (const s of shapes) {
    // Group shapes have a 0×0 intrinsic bound (their bbox depends on
    // children, registered as `{ x:0, y:0, width:0, height:0 }`). Expand
    // to the bbox of every descendant; without this, the floating panel
    // anchors over a zero-pixel point at the group origin and visually
    // disappears.
    if (isGroup(s) && editor.scene.elements.has(s.id)) {
      const descendants = getDescendantsOf(editor.scene, s.id);
      for (const d of descendants) {
        if (isGroup(d)) continue; // skip nested 0×0 groups
        let b: { x: number; y: number; width: number; height: number };
        try {
          b = getElementWorldBounds(d);
        } catch {
          continue;
        }
        if (b.width === 0 && b.height === 0) continue;
        acc = unionRect(acc, b);
      }
      continue;
    }
    let b: { x: number; y: number; width: number; height: number };
    try {
      b = getElementWorldBounds(s);
    } catch {
      continue;
    }
    acc = unionRect(acc, b);
  }
  return acc;
};

const unionRect = (
  acc: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } => {
  if (!acc) return { ...b };
  const minX = Math.min(acc.x, b.x);
  const minY = Math.min(acc.y, b.y);
  const maxX = Math.max(acc.x + acc.width, b.x + b.width);
  const maxY = Math.max(acc.y + acc.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

// ---------------------------------------------------------------------------
// Re-exports for test convenience.
// ---------------------------------------------------------------------------

export { computeSelectionWorldBbox as _computeSelectionWorldBboxForTesting };
