import { getElement } from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import { cursorForHandle, type HandleId } from "../../handle.js";
import { ANCHOR_DOT_ACTIVE_RADIUS, LINK_START_ANCHOR_OUTSET } from "../../constants.js";
import { anchorOverlayPoints } from "../anchor-points.js";
import type { Editor } from "../../editor.js";

/**
 * Stable keys for cursor states a host can override with a custom image via
 * {@link Editor.setCursorOverride}. Each maps to one outcome of `computeCursor`.
 */
export type CursorRole =
  | "default"
  | "pan-ready"
  | "pan-active"
  | "move"
  | "draw"
  | "text"
  | "link-start"
  | "link-handle"
  | "annotation"
  | "resize-nwse"
  | "resize-nesw"
  | "resize-ns"
  | "resize-ew";

/**
 * A custom cursor: either a raw CSS `cursor` value, or an image with an
 * optional `@2x` variant (DPR-aware via `image-set`), hotspot, and keyword
 * fallback.
 */
export type CursorSpec =
  | string
  | {
      /** 1x image URL or data-URL. */
      readonly url: string;
      /** Optional 2x image for hi-DPI (retina) — emitted via `image-set`. */
      readonly url2x?: string;
      /** Hotspot offset (px) within the image; defaults to (0, 0). */
      readonly hotspot?: Vec2;
      /** Keyword shown if the image can't load / is too large. */
      readonly fallback?: string;
    };

/** Resize handle → cursor override role. */
const RESIZE_ROLE: Record<HandleId, CursorRole> = {
  nw: "resize-nwse",
  se: "resize-nwse",
  ne: "resize-nesw",
  sw: "resize-nesw",
  n: "resize-ns",
  s: "resize-ns",
  e: "resize-ew",
  w: "resize-ew",
};

/** Build a CSS `cursor` value from a {@link CursorSpec}. */
export const cssCursor = (spec: CursorSpec, fallbackKeyword: string): string => {
  if (typeof spec === "string") return spec;
  const hx = spec.hotspot?.x ?? 0;
  const hy = spec.hotspot?.y ?? 0;
  const img =
    spec.url2x !== undefined
      ? `image-set(url("${spec.url}") 1x, url("${spec.url2x}") 2x)`
      : `url("${spec.url}")`;
  return `${img} ${String(hx)} ${String(hy)}, ${spec.fallback ?? fallbackKeyword}`;
};

/**
 * Resolve a cursor role to a CSS `cursor` value: a host-registered custom image
 * (via {@link Editor.setCursorOverride}) if present, else `fallbackKeyword`.
 */
export const resolveCursor = (
  editor: Editor,
  role: CursorRole,
  fallbackKeyword: string,
): string => {
  const spec = editor.getCursorOverride(role);
  return spec === undefined ? fallbackKeyword : cssCursor(spec, fallbackKeyword);
};

/**
 * True when `p` is within the grab radius of one of the single selected
 * element's link-start dots — used to show a `crosshair` (start a link).
 * Mirrors the anchor-drag hit-test in pointer-binding so the cursor matches
 * exactly where a press would begin a link.
 */
export const isOverLinkStartDot = (editor: Editor, p: Vec2): boolean => {
  if (editor.mode !== "select" || editor._selection.size !== 1) return false;
  const id = [...editor._selection][0];
  if (id === undefined) return false;
  const shape = getElement(editor._scene, id);
  if (!shape) return false;
  const zoom = editor._scene.viewport.zoom || 1;
  const { worldPoints } = anchorOverlayPoints(shape, LINK_START_ANCHOR_OUTSET / zoom);
  const grab = (ANCHOR_DOT_ACTIVE_RADIUS + editor.anchorStartHitSlop) / zoom;
  const grab2 = grab * grab;
  for (const wp of worldPoints) {
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    if (dx * dx + dy * dy <= grab2) return true;
  }
  return false;
};

/**
 * The CSS cursor for the current interaction state. Priority: active gesture →
 * text edit → pan affordance → draw tool → idle hover hit-test. Pure read of
 * editor state; no side effects.
 */
export const computeCursor = (editor: Editor, p: Vec2 | null): string => {
  // Each outcome is a (role, fallback-keyword) pair; `resolveCursor` returns a
  // host-registered custom image for that role if one exists, else the keyword.
  const r = (role: CursorRole, keyword: string): string => resolveCursor(editor, role, keyword);
  const resizeRole = (h: HandleId): string => r(RESIZE_ROLE[h], cursorForHandle(h));
  // 1. Active gestures (highest priority — what the pointer is doing now).
  if (editor.panGesture) return r("pan-active", "grabbing");
  if (editor.linkDragFromAnchor?.moved === true) return r("draw", "crosshair");
  if (editor.isDraggingWaypoint || editor.isDraggingSegment) return r("move", "grabbing");
  if (editor.annotationDrag?.moved === true) return r("move", "grabbing");
  if (editor.brushStroke) return r("draw", "crosshair");
  // Machine-driven drag past the threshold (`gestureTx` opens then): resize
  // shows the handle's arrow; element / link move shows grabbing.
  if (editor.gestureTx) {
    const t = editor.actor.getSnapshot().context.pressTarget;
    if (t && (t.kind === "handle" || t.kind === "group-handle")) return resizeRole(t.handle);
    if (t && (t.kind === "element" || t.kind === "link" || t.kind === "edge-endpoint")) {
      return r("move", "grabbing");
    }
  }
  // 2. In-canvas text editing → I-beam.
  if (editor.editingTextElement !== null) return r("text", "text");
  // 3. Pan affordance (idle): Space held or hand tool.
  if (editor.spaceHeld || editor.mode === "hand") return r("pan-ready", "grab");
  // 4. Draw tools (idle, before a gesture starts).
  switch (editor.mode) {
    case "draw-rect":
    case "draw-ellipse":
    case "draw-frame":
    case "draw-edge":
    case "brush":
      return r("draw", "crosshair");
    case "draw-text":
      return r("text", "text");
    default:
      break;
  }
  // 5. Idle hover in select mode — key off the hit-test target.
  if (p) {
    if (isOverLinkStartDot(editor, p)) return r("link-start", "crosshair");
    const t = editor.hitTest(p);
    switch (t.kind) {
      case "handle":
      case "group-handle":
        return resizeRole(t.handle);
      case "edge-endpoint":
        return r("link-handle", "grab");
      case "annotation":
        return r("annotation", "pointer");
      default:
        return r("default", "default");
    }
  }
  return r("default", "default");
};
