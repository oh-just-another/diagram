import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor, EditorEvents } from "@oh-just-another/state";

/**
 * Holds the live `Editor` instance. Components and hooks read from this
 * context to subscribe to scene / selection / history changes.
 *
 * Two ways to populate it:
 *   - Build an editor yourself and pass it via `<DiagramProvider>`. Useful
 *     when you want full lifecycle control (multi-canvas, server-built
 *     editor, etc).
 *   - Use `<DiagramRoot>` (in `diagram-root.tsx`): it lazy-creates the editor
 *     when a child `<DiagramSurface>` mounts and provides it here.
 *
 * Most hooks tolerate the `null` value during the brief window between
 * `<DiagramRoot>` rendering and `<DiagramSurface>` mounting — they return
 * sensible defaults. `useDiagramContext` (the strict variant) still throws
 * so direct imperative misuse outside a provider is caught early.
 */
const DiagramContext = createContext<Editor | null>(null);

export interface DiagramProviderProps {
  readonly editor: Editor;
  readonly children: ReactNode;
}

/** Static provider — wraps a ready-made editor. */
export const DiagramProvider = ({ editor, children }: DiagramProviderProps) => {
  return <DiagramContext.Provider value={editor}>{children}</DiagramContext.Provider>;
};

/**
 * Internal bridge used by `<DiagramRoot>` to flow a lazy editor down to its
 * descendants. Exported so the root can set it.
 */
export const DiagramEditorBridge = DiagramContext;

/**
 * Strict accessor — throws when called outside any provider. Use for
 * imperative paths that *require* the editor right now (`editor.addShape`,
 * `editor.screenToWorld`, etc).
 */
export const useDiagramContext = (): Editor => {
  const editor = useContext(DiagramContext);
  if (!editor) {
    throw new Error(
      "@oh-just-another/react-ui: hook called outside <DiagramProvider> / <DiagramRoot>, " +
        "or before <DiagramSurface> mounted.",
    );
  }
  return editor;
};

/**
 * Forgiving variant — returns `null` when the editor hasn't been created
 * yet. Pair with safe defaults; used by the reactive hooks to render
 * cleanly during the first frame.
 */
export const useDiagramContextOptional = (): Editor | null => useContext(DiagramContext);

/**
 * "Subscribe to editor + select a value" helper. Re-runs `select` whenever
 * the editor notifies a change; re-renders the caller when the projected
 * value actually changes.
 *
 * The editor may be missing during the very first frame (before
 * `<DiagramSurface>` registers with `<DiagramRoot>`). `defaultValue` is
 * returned during that window.
 */
export const useEditorSelector = <T,>(
  select: (editor: Editor) => T,
  defaultValue: T,
  /**
   * Optional typed event to subscribe to instead of the umbrella
   * `change`. When omitted, falls back to `editor.subscribe(fn)`, which
   * fires on every notify. Passing e.g. `"mode"` makes the hook re-run
   * the selector only when the mode flipped, skipping selection /
   * viewport / scene notifies entirely.
   */
  event?: keyof EditorEvents,
): T => {
  const editor = useDiagramContextOptional();
  const [value, setValue] = useState<T>(() => (editor ? select(editor) : defaultValue));
  // Keep select / defaultValue in refs so the subscription effect runs only
  // when the editor identity changes. Callers may pass fresh literals every
  // render — that's fine.
  const selectRef = useRef(select);
  selectRef.current = select;
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  useEffect(() => {
    if (!editor) {
      setValue(defaultRef.current);
      return undefined;
    }
    const update = () => {
      const next = selectRef.current(editor);
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    };
    update();
    // Typed event when given; umbrella subscribe otherwise. Both paths
    // fire in lock-step (typed events fan out of the same notify() that
    // runs the umbrella subscribers), so the typed path is just narrower.
    if (event !== undefined) {
      return editor.on(event, update);
    }
    return editor.subscribe(update);
  }, [editor, event]);

  return value;
};
