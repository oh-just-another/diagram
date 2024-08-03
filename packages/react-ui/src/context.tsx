import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@oh-just-another/state";

/**
 * Holds the live `Editor` instance. Components and hooks read from this
 * context to subscribe to scene / selection / history changes.
 *
 * `DiagramCanvas` creates the editor and wraps its children in
 * `DiagramProvider`; advanced hosts can build the editor themselves and
 * supply it via the standalone provider.
 */
const DiagramContext = createContext<Editor | null>(null);

export interface DiagramProviderProps {
  readonly editor: Editor;
  readonly children: ReactNode;
}

export const DiagramProvider = ({ editor, children }: DiagramProviderProps) => {
  return <DiagramContext.Provider value={editor}>{children}</DiagramContext.Provider>;
};

/** Internal accessor used by every hook. Throws if used outside a provider. */
export const useDiagramContext = (): Editor => {
  const editor = useContext(DiagramContext);
  if (!editor) {
    throw new Error(
      "@oh-just-another/react-ui: hook called outside <DiagramProvider> / <DiagramCanvas>",
    );
  }
  return editor;
};

/**
 * Generic "subscribe to editor + select a value" helper. Re-renders the
 * caller whenever the editor notifies a change *and* the selected value
 * actually changes (referentially or via the optional `isEqual`).
 */
export const useEditorSelector = <T,>(select: (editor: Editor) => T): T => {
  const editor = useDiagramContext();
  const [value, setValue] = useState<T>(() => select(editor));
  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    const update = () => {
      const next = selectRef.current(editor);
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    };
    update();
    return editor.subscribe(update);
  }, [editor]);

  return value;
};
