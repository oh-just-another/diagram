import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getShape, getShapeWorldBounds, type TextShape } from "@oh-just-another/scene";
import { useDiagramOptional, useScene } from "./hooks.js";
import { useEditorSelector } from "./context.js";

/**
 * Overlay `<textarea>` for inline text editing. Renders when the
 * editor's `editingTextShape` is set; positions itself in screen
 * coordinates over the shape's world bounds.
 *
 * Wiring: drop this as a sibling of `<DiagramSurface>` inside
 * `<DiagramRoot>`. Use `editor.beginTextEdit(shapeId)` to open;
 * Enter / blur commits, Escape cancels.
 */
export const TextEditorOverlay = () => {
  const editor = useDiagramOptional();
  const scene = useScene();
  const editingId = useEditorSelector((e) => e.editingTextShape, null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  // Seed draft from current text when editing starts; focus textarea.
  useEffect(() => {
    if (!editingId) return undefined;
    const shape = getShape(scene, editingId) as TextShape | undefined;
    setDraft(shape?.text ?? "");
    // Focus on next tick so the textarea exists.
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
      autoResize(ref.current);
    }, 0);
    return () => clearTimeout(t);
  }, [editingId, scene]);

  // Re-fit on every keystroke. Auto-resize collapses to scrollHeight
  // so the box grows as the user types instead of scrolling inside
  // a fixed height.
  useEffect(() => {
    autoResize(ref.current);
  }, [draft]);

  if (!editor || !editingId) return null;

  const shape = getShape(scene, editingId) as TextShape | undefined;
  if (!shape) return null;

  // World → screen position for the textarea. World-to-screen for a
  // scene without rotation: `screen = (world - pan) * zoom`.
  const worldBounds = getShapeWorldBounds(shape);
  const zoom = scene.viewport.zoom;
  const pan = scene.viewport.pan;
  const tl = {
    x: (worldBounds.x - pan.x) * zoom,
    y: (worldBounds.y - pan.y) * zoom,
  };
  const screenWidth = worldBounds.width * zoom;
  const screenHeight = worldBounds.height * zoom;

  const style: CSSProperties = {
    position: "absolute",
    top: tl.y,
    left: tl.x,
    minWidth: Math.max(60, screenWidth),
    minHeight: Math.max(24, screenHeight),
    fontFamily: shape.fontFamily,
    fontSize: shape.fontSize * zoom,
    color: shape.style.fill ?? "#000",
    background: "rgba(255,255,255,0.95)",
    border: "1px solid var(--accent, #1a73e8)",
    outline: "none",
    padding: 2,
    resize: "none",
    overflow: "hidden",
    zIndex: 100,
  };

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={() => editor.commitTextEdit(draft)}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          editor.cancelTextEdit();
        } else if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          ev.stopPropagation();
          editor.commitTextEdit(draft);
        }
        // Shift+Enter = newline (textarea default).
      }}
      style={style}
      aria-label="Edit text"
    />
  );
};

/**
 * Resize `<textarea>` to fit its content. Sets `height = auto`
 * first so `scrollHeight` reports the natural content height
 * instead of the previous over-allocated value, then bumps to
 * `scrollHeight`. Skips when `el` is null (initial render).
 */
const autoResize = (el: HTMLTextAreaElement | null): void => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};
