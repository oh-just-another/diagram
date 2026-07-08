import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { getElementWorldBounds, type Scene } from "@oh-just-another/scene";
import { renderScene, renderLinks } from "@oh-just-another/renderer-core";
import { Canvas2DTarget, setupHiDpi } from "@oh-just-another/renderer-canvas";
import { bounds as B } from "@oh-just-another/math";
import type { Bounds, Vec2 } from "@oh-just-another/types";
import type { Editor } from "@oh-just-another/state";
import { useDiagramOptional } from "./hooks.js";
import {
  MINIMAP_FRAME_COLOR,
  MINIMAP_FRAME_FILL,
  MINIMAP_FRAME_LINE_WIDTH,
  MINIMAP_HEIGHT_PX,
  MINIMAP_PADDING_PX,
  MINIMAP_THROTTLE_MS,
  MINIMAP_WIDTH_PX,
} from "./constants.js";

export interface MinimapProps {
  /** Canvas width in CSS pixels. Defaults to {@link MINIMAP_WIDTH_PX}. */
  readonly width?: number;
  /** Canvas height in CSS pixels. Defaults to {@link MINIMAP_HEIGHT_PX}. */
  readonly height?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  /**
   * Editor to preview. Defaults to the one provided by the enclosing
   * `<DiagramRoot>` (via context). Pass explicitly when the minimap lives
   * outside the provider tree (e.g. next to a high-level `<Diagram>`).
   */
  readonly editor?: Editor;
}

/** World-space transform mapping the fitted scene into the minimap canvas. */
interface MiniFit {
  readonly zoom: number;
  /** World point at the minimap's top-left corner. */
  readonly pan: Vec2;
}

/** Union of every element's world AABB, or `null` for an empty scene. */
const sceneContentBounds = (scene: Scene): Bounds | null => {
  let acc: Bounds | null = null;
  for (const el of scene.elements.values()) {
    if (el.hidden === true) continue;
    const bb = getElementWorldBounds(el);
    acc = acc ? B.union(acc, bb) : bb;
  }
  return acc;
};

/** Fit `content` into a `w`×`h` canvas with {@link MINIMAP_PADDING_PX} margin. */
const fitContent = (content: Bounds, w: number, h: number): MiniFit | null => {
  const availW = w - MINIMAP_PADDING_PX * 2;
  const availH = h - MINIMAP_PADDING_PX * 2;
  if (availW <= 0 || availH <= 0 || content.width <= 0 || content.height <= 0) return null;
  const zoom = Math.min(availW / content.width, availH / content.height);
  const cx = content.x + content.width / 2;
  const cy = content.y + content.height / 2;
  return { zoom, pan: { x: cx - w / 2 / zoom, y: cy - h / 2 / zoom } };
};

/**
 * Small overview canvas: renders the whole scene scaled to fit, overlays a
 * frame for the current viewport, and pans the main view on click / drag.
 *
 * Repaints are throttled to {@link MINIMAP_THROTTLE_MS} and driven by the
 * editor's change subscription (scene edits *and* pan / zoom both notify).
 */
export const Minimap = ({
  width = MINIMAP_WIDTH_PX,
  height = MINIMAP_HEIGHT_PX,
  className,
  style,
  editor: editorProp,
}: MinimapProps) => {
  const contextEditor = useDiagramOptional();
  const editor = editorProp ?? contextEditor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Latest fit used for the last paint — read by pointer handlers to map a
  // minimap pixel back to a world point without recomputing.
  const fitRef = useRef<MiniFit | null>(null);
  const draggingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editor) return;
    const scene = editor.scene;
    const dpr = setupHiDpi(canvas, width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const target = new Canvas2DTarget(ctx, width, height, dpr);
    target.clear();

    const content = sceneContentBounds(scene);
    const fit = content ? fitContent(content, width, height) : null;
    fitRef.current = fit;
    if (!fit) return;

    const miniScene: Scene = {
      ...scene,
      viewport: {
        ...scene.viewport,
        pan: fit.pan,
        zoom: fit.zoom,
        rotation: 0,
        size: { width, height },
      },
    };
    renderScene(miniScene, target);
    renderLinks(miniScene, target);

    // Viewport frame — the world rect currently visible in the main view,
    // projected into minimap pixels. Drawn in CSS px on the dpr-scaled ctx.
    const vp = scene.viewport;
    if (vp.zoom > 0 && vp.size.width > 0 && vp.size.height > 0) {
      const fx = (vp.pan.x - fit.pan.x) * fit.zoom;
      const fy = (vp.pan.y - fit.pan.y) * fit.zoom;
      const fw = (vp.size.width / vp.zoom) * fit.zoom;
      const fh = (vp.size.height / vp.zoom) * fit.zoom;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = MINIMAP_FRAME_FILL;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.strokeStyle = MINIMAP_FRAME_COLOR;
      ctx.lineWidth = MINIMAP_FRAME_LINE_WIDTH;
      ctx.strokeRect(fx, fy, fw, fh);
    }
  }, [editor, width, height]);

  // Throttled repaint on every editor change. A leading draw runs immediately;
  // bursts within the window collapse into a single trailing draw.
  useEffect(() => {
    if (!editor) return undefined;
    draw();
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const elapsed = Date.now() - last;
      if (elapsed >= MINIMAP_THROTTLE_MS) {
        last = Date.now();
        draw();
      } else {
        timer ??= setTimeout(() => {
          timer = null;
          last = Date.now();
          draw();
        }, MINIMAP_THROTTLE_MS - elapsed);
      }
    };
    const unsubscribe = editor.subscribe(schedule);
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [editor, draw]);

  // Center the main viewport on the world point under a minimap pixel.
  const panToPixel = useCallback(
    (px: number, py: number) => {
      const fit = fitRef.current;
      if (!editor || !fit) return;
      const world: Vec2 = { x: px / fit.zoom + fit.pan.x, y: py / fit.zoom + fit.pan.y };
      const vp = editor.scene.viewport;
      const centerX = vp.pan.x + vp.size.width / 2 / vp.zoom;
      const centerY = vp.pan.y + vp.size.height / 2 / vp.zoom;
      editor.panBy({ x: (centerX - world.x) * vp.zoom, y: (centerY - world.y) * vp.zoom });
    },
    [editor],
  );

  const localPoint = (e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = localPoint(e);
      panToPixel(p.x, p.y);
    },
    [panToPixel],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const p = localPoint(e);
      panToPixel(p.x, p.y);
    },
    [panToPixel],
  );

  const handlePointerUp = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="Diagram minimap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        display: "block",
        width,
        height,
        cursor: "pointer",
        touchAction: "none",
        ...style,
      }}
    />
  );
};
