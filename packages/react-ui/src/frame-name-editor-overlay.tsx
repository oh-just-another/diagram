import { useEffect, useReducer, useRef } from "react";
import {
  getElement,
  isFrame,
  FRAME_HEADER_HEIGHT,
  FRAME_HEADER_MAX_WIDTH,
  FRAME_HEADER_PADDING_X,
  FRAME_HEADER_FONT_SIZE,
} from "@oh-just-another/scene";
import { useDiagramOptional } from "./hooks.js";

/**
 * Inline editor for a frame's header name. Unlike the in-canvas text
 * editor (invisible sink + canvas-drawn caret), the frame label has no
 * canvas caret, so this is a VISIBLE `<input>` positioned over the header
 * strip and styled to match it (dark bar, light text). Opens via
 * `editor.beginFrameNameEdit(id)` (double-click the header / frame body);
 * commits on Enter or blur, cancels on Escape.
 *
 * Wiring: drop as a sibling of `<DiagramSurface>` inside `<DiagramRoot>`,
 * next to `<TextEditorOverlay>`.
 */
export const FrameNameEditorOverlay = () => {
  const editor = useDiagramOptional();
  const ref = useRef<HTMLInputElement>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);

  // Follow scene / viewport changes (pan / zoom) while editing.
  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", force);
  }, [editor]);

  const editingId = editor?.editingFrameName ?? null;

  // Focus + select-all when an edit starts.
  useEffect(() => {
    if (!editingId) return;
    const el = ref.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [editingId]);

  if (!editor || !editingId) return null;
  const frame = getElement(editor.scene, editingId);
  if (!frame || !isFrame(frame)) return null;

  const vp = editor.scene.viewport;
  const z = vp.zoom;
  const left = (frame.position.x - vp.pan.x) * z;
  const top = (frame.position.y - FRAME_HEADER_HEIGHT * frame.scale.y - vp.pan.y) * z;
  const width = Math.min(FRAME_HEADER_MAX_WIDTH, frame.width) * frame.scale.x * z;
  const height = FRAME_HEADER_HEIGHT * frame.scale.y * z;

  return (
    <input
      // Key by id so the defaultValue resets when switching frames.
      key={editingId}
      ref={ref}
      type="text"
      defaultValue={frame.name ?? ""}
      placeholder="Frame"
      aria-label="Frame name"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onKeyDown={(ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          editor.commitFrameNameEdit(ev.currentTarget.value);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          editor.cancelFrameNameEdit();
        } else {
          // Keep typing keys from reaching canvas hotkeys.
          ev.stopPropagation();
        }
      }}
      onBlur={(ev) => { editor.commitFrameNameEdit(ev.currentTarget.value); }}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        boxSizing: "border-box",
        padding: `0 ${FRAME_HEADER_PADDING_X * z}px`,
        margin: 0,
        border: 0,
        outline: "none",
        background: "#222",
        color: "#ddd",
        font: `${FRAME_HEADER_FONT_SIZE * z}px system-ui, sans-serif`,
        lineHeight: `${height}px`,
        pointerEvents: "auto",
        zIndex: 100,
      }}
    />
  );
};
