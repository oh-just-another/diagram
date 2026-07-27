import { useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import { getElementWorldBounds, isSticky, type StickyElement } from "@oh-just-another/scene";
import { useDiagramOptional } from "../core/hooks.js";
import { usePortalContainer } from "../core/portal-container.js";
import { EMOJI_QUICK_PICKS } from "../core/constants.js";

/**
 * Emoji-reaction bar pinned to every sticky note's bottom-left corner:
 * the existing reactions as counter pills (click toggles YOUR reaction —
 * adds it if you haven't reacted, removes it if you have; counters grow
 * only through other collaborators) and an add button that opens a quick
 * emoji picker. Reaction state lives on
 * the element (`StickyElement.reactions`), so it syncs through the
 * normal scene channel in collaborative sessions. Hidden in read-only
 * mode (reacting mutates the scene).
 */
export const StickyReactions = () => {
  const editor = useDiagramOptional();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", () => {
      bump();
    });
  }, [editor]);

  if (!editor || editor.readOnly) return null;
  const host = editor.hostElement as HTMLElement | null;
  if (!host) return null;

  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  const stickies: { shape: StickyElement; x: number; y: number }[] = [];
  for (const shape of editor.scene.elements.values()) {
    if (!isSticky(shape)) continue;
    const b = getElementWorldBounds(shape);
    stickies.push({
      shape,
      x: (b.x - v.pan.x) * v.zoom + hostRect.left,
      y: (b.y + b.height - v.pan.y) * v.zoom + hostRect.top,
    });
  }
  if (stickies.length === 0) return null;

  return createPortal(
    <>
      {stickies.map(({ shape, x, y }) => (
        <div key={shape.id} className="du-sticky-reactions" style={{ left: x + 4, top: y + 4 }}>
          {(shape.reactions ?? []).map((reaction) => {
            // Scenes saved before reactions became per-user carry
            // `{glyph, count}` without `users` — show their count until
            // the first toggle rewrites the entry.
            const legacy = reaction as { users?: readonly string[]; count?: number };
            const count = legacy.users?.length ?? legacy.count ?? 0;
            return (
              <button
                key={reaction.glyph}
                type="button"
                className="du-sticky-reaction-pill"
                title={`Toggle ${reaction.glyph} reaction`}
                aria-label={`Toggle ${reaction.glyph} reaction (${String(count)})`}
                onClick={() => {
                  editor.toggleStickyReaction(shape.id, reaction.glyph);
                }}
              >
                {reaction.glyph} {count}
              </button>
            );
          })}
          <button
            type="button"
            className="du-sticky-reaction-add"
            title="Add emoji reaction"
            aria-label="Add emoji reaction"
            onClick={() => {
              setPickerFor((cur) => (cur === shape.id ? null : shape.id));
            }}
          >
            <SmilePlus size={12} strokeWidth={1.75} aria-hidden />
          </button>
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
      ))}
    </>,
    portalContainer,
  );
};
