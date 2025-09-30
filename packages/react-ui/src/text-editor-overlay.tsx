import { useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { getElement, type TextElement } from "@oh-just-another/scene";
import { useDiagramOptional } from "./hooks.js";

/**
 * Invisible keystroke/IME sink for in-canvas text editing. The caret and
 * selection are drawn on the canvas by the renderer (the editor's
 * overlay pass); this component is not a visible editor — it is a 1×1,
 * fully-transparent `<textarea>` that holds keyboard focus so the
 * browser delivers typing, IME composition, clipboard and native
 * caret/selection navigation. Each change is mirrored into the editor
 * (`setEditingText` / `setEditingSelection`), which mutates the shape's
 * text live and owns the on-canvas caret.
 *
 * Wiring: drop as a sibling of `<DiagramSurface>` inside `<DiagramRoot>`.
 * Editing opens via `editor.beginTextEdit(id)` / the text tool; it
 * commits on Escape, on a click outside the shape, or on a tool change.
 */
export const TextEditorOverlay = () => {
  const editor = useDiagramOptional();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);

  // Re-render on any editor change so value/selection stay mirrored.
  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", force);
  }, [editor]);

  const editingId = editor?.editingTextElement ?? null;

  // Focus the sink whenever an edit starts.
  useEffect(() => {
    if (!editingId) return;
    ref.current?.focus();
  }, [editingId]);

  // Mirror the editor's text + selection INTO the textarea so native
  // navigation, IME and typing all operate on the live content. Guarded
  // so it never fights the user's own caret.
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!editor || !editingId || !ta) return;
    const shape = getElement(editor.scene, editingId) as TextElement | undefined;
    const text = shape?.type === "text" ? shape.text : "";
    if (ta.value !== text) ta.value = text;
    const sel = editor.editingTextSelection;
    if (sel && (ta.selectionStart !== sel.start || ta.selectionEnd !== sel.end)) {
      ta.setSelectionRange(sel.start, sel.end, sel.dir);
    }
  });

  if (!editor || !editingId) return null;
  const shape = getElement(editor.scene, editingId) as TextElement | undefined;
  if (shape?.type !== "text") return null;

  // Park the sink at the text's screen position so the IME candidate
  // window appears near the caret. It's invisible and click-through.
  const vp = editor.scene.viewport;
  const left = (shape.position.x - vp.pan.x) * vp.zoom;
  const top = (shape.position.y - vp.pan.y) * vp.zoom;

  const dirOf = (ta: HTMLTextAreaElement): "forward" | "backward" =>
    ta.selectionDirection === "backward" ? "backward" : "forward";

  return (
    <textarea
      ref={ref}
      defaultValue={shape.text}
      // `onInput` covers typing, paste, cut, delete and IME end — read
      // the textarea's authoritative value + caret and push them live.
      onInput={(ev) => {
        const t = ev.currentTarget;
        editor.setEditingText(t.value, t.selectionStart, t.selectionEnd, dirOf(t));
      }}
      onSelect={(ev) => {
        const t = ev.currentTarget;
        editor.setEditingSelection(t.selectionStart, t.selectionEnd, dirOf(t));
      }}
      onKeyDown={(ev) => {
        // Escape (and Cmd/Ctrl+Enter) commit and exit; plain Enter is a
        // newline (native textarea behaviour, mirrored via onInput).
        if (ev.key === "Escape" || (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey))) {
          ev.preventDefault();
          ev.stopPropagation();
          editor.commitTextEdit();
        }
      }}
      onBlur={() => {
        // A click inside the text repositions the caret (canvas handles
        // it) and must NOT end editing — keep focus if still in an edit
        // after the click resolves. A real exit (commit) clears
        // `editingTextElement`, so it won't refocus then.
        const id = editingId;
        setTimeout(() => {
          const ta = ref.current;
          if (ta && editor.editingTextElement === id && document.activeElement !== ta) {
            ta.focus();
          }
        }, 0);
      }}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Text editor"
      style={{
        position: "absolute",
        top,
        left,
        width: 1,
        height: 1,
        padding: 0,
        margin: 0,
        border: 0,
        outline: "none",
        opacity: 0,
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre",
        // Click-through so canvas pointer handling (caret placement /
        // drag-select / commit-outside) receives the events.
        pointerEvents: "none",
        zIndex: 100,
      }}
    />
  );
};
