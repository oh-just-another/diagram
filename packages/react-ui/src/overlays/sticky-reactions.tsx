import { useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { getElementWorldBounds, isSticky, type StickyElement } from "@oh-just-another/scene";
import {
  stickyReactionPillRects,
  stickyReactionAddRect,
  STICKY_REACTION_FONT_SIZE,
  stickyReactionChromeVisible,
} from "@oh-just-another/renderer-core";
import { useDiagramOptional } from "../core/hooks.js";
import { useQuietViewport } from "../core/use-quiet-viewport.js";
import { usePortalContainer } from "../core/portal-container.js";
import {
  EMOJI_QUICK_PICKS,
  STICKY_REACTION_MEASURE_FALLBACK_CHAR_WIDTH_FACTOR,
} from "../core/constants.js";

/**
 * Sticky reactions, interaction half. The pills AND the "+" button are
 * painted by the CANVAS renderer (single visual source that tracks the
 * shape 1:1 while dragging; pills also reach PNG / SVG exports); this
 * overlay only lays TRANSPARENT click zones over the same rects (shared
 * geometry via `stickyReactionPillRects` / `stickyReactionAddRect`) and
 * hosts the DOM emoji picker the "+" zone opens. Clicking a pill toggles
 * YOUR reaction — adds it if you haven't reacted, removes it if you
 * have; counters grow only through other collaborators. Reaction state
 * lives on the element (`StickyElement.reactions`), so it syncs through
 * the normal scene channel. Hidden in read-only mode (reacting mutates
 * the scene) and while the viewport is moving.
 */

/** Hidden 2D context measuring pill labels with the renderer's pill font. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
const pillMeasure = (text: string): number => {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) {
    return (
      text.length * STICKY_REACTION_FONT_SIZE * STICKY_REACTION_MEASURE_FALLBACK_CHAR_WIDTH_FACTOR
    );
  }
  measureCtx.font = `${String(STICKY_REACTION_FONT_SIZE)}px system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
};

export const StickyReactions = () => {
  const editor = useDiagramOptional();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const portalContainer = usePortalContainer();
  const quiet = useQuietViewport(editor);

  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", () => {
      bump();
    });
  }, [editor]);

  if (!editor || editor.readOnly || !quiet) return null;
  const host = editor.hostElement as HTMLElement | null;
  if (!host) return null;

  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  // A sticky too small on screen has no reaction chrome on the canvas —
  // no zones to click.
  const stickies: StickyElement[] = [];
  for (const shape of editor.scene.elements.values()) {
    if (isSticky(shape) && stickyReactionChromeVisible(shape, v.zoom)) stickies.push(shape);
  }
  if (stickies.length === 0) return null;

  return createPortal(
    <>
      {stickies.map((shape) => {
        const b = getElementWorldBounds(shape);
        const scaleX = shape.width > 0 ? b.width / shape.width : 1;
        const scaleY = shape.height > 0 ? b.height / shape.height : 1;
        const toScreenX = (localX: number) =>
          (b.x + localX * scaleX - v.pan.x) * v.zoom + hostRect.left;
        const toScreenY = (localY: number) =>
          (b.y + localY * scaleY - v.pan.y) * v.zoom + hostRect.top;
        const pills = stickyReactionPillRects(shape, pillMeasure, v.zoom);
        const add = stickyReactionAddRect(shape, pillMeasure, v.zoom);
        return (
          <div key={shape.id}>
            {pills.map((pill) => (
              <button
                key={pill.glyph}
                type="button"
                className="du-sticky-reaction-hit"
                style={{
                  left: toScreenX(pill.x),
                  top: toScreenY(pill.y),
                  width: pill.width * scaleX * v.zoom,
                  height: pill.height * scaleY * v.zoom,
                }}
                title={`Toggle ${pill.glyph} reaction`}
                aria-label={`Toggle ${pill.glyph} reaction`}
                onClick={() => {
                  editor.toggleStickyReaction(shape.id, pill.glyph);
                }}
              />
            ))}
            <div
              className="du-sticky-reactions"
              style={{ left: toScreenX(add.x), top: toScreenY(add.y) }}
            >
              <button
                type="button"
                className="du-sticky-reaction-hit"
                style={{
                  left: toScreenX(add.x),
                  top: toScreenY(add.y),
                  width: add.width * scaleX * v.zoom,
                  height: add.height * scaleY * v.zoom,
                }}
                title="Add emoji reaction"
                aria-label="Add emoji reaction"
                onClick={() => {
                  setPickerFor((cur) => (cur === shape.id ? null : shape.id));
                }}
              />
              {pickerFor === shape.id ? (
                <div className="du-sticky-reaction-picker" role="menu" aria-label="Pick a reaction">
                  {EMOJI_QUICK_PICKS.map((glyph) => (
                    <button
                      key={glyph}
                      type="button"
                      className="du-sel-emoji-item"
                      aria-label={`React with ${glyph}`}
                      onClick={() => {
                        editor.toggleStickyReaction(shape.id, glyph);
                        setPickerFor(null);
                      }}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </>,
    portalContainer,
  );
};
