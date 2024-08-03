import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { Editor, type EditorOptions, type Mode } from "@oh-just-another/state";
import type { Scene } from "@oh-just-another/scene";
import { DiagramEditorBridge } from "./context.js";

/**
 * Recommended composition: `<DiagramRoot>` owns the editor and provides it
 * to *all* descendants. The actual canvas DOM is rendered by a child
 * `<DiagramSurface>` somewhere inside the tree — typically next to the
 * Palette / PropertyPanel, so all three live as flex siblings.
 *
 * ```tsx
 * <DiagramRoot initialScene={...} initialMode="select">
 *   <Toolbar />
 *   <Palette />
 *   <DiagramSurface style={{ flex: 1, background: "#fff" }} />
 *   <PropertyPanel />
 * </DiagramRoot>
 * ```
 */

type RegisterSurface = (host: HTMLElement | null) => void;
const RegisterSurfaceContext = createContext<RegisterSurface | null>(null);

export interface DiagramRootProps {
  readonly initialScene: Scene;
  readonly initialMode?: Mode;
  readonly children: ReactNode;
  /** Called once the editor is ready (after a `<DiagramSurface>` mounts). */
  readonly onReady?: (editor: Editor) => void;
  /** Skip the implicit `installBuiltinRenderers()` call. */
  readonly skipInstallRenderers?: boolean;
}

export const DiagramRoot = ({
  initialScene,
  initialMode,
  children,
  onReady,
  skipInstallRenderers,
}: DiagramRootProps) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const layeredRef = useRef<LayeredCanvas | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const registerSurface = useCallback<RegisterSurface>((host) => {
    // Tear down any existing editor first — handles dev-mode double effects
    // and the host swapping for any reason. `LayeredCanvas.dispose()` is
    // crucial: it removes the three <canvas> children it appended to the
    // host, otherwise React's StrictMode double-mount in dev would leave
    // a stale set of canvases behind and we'd see "ghost" shapes from the
    // previous render pipeline.
    observerRef.current?.disconnect();
    observerRef.current = null;
    editorRef.current?.dispose();
    editorRef.current = null;
    layeredRef.current?.dispose();
    layeredRef.current = null;

    if (!host) {
      setEditor(null);
      return;
    }

    if (!skipInstallRenderers) installBuiltinRenderers();

    const { width, height } = host.getBoundingClientRect();
    const layered = new LayeredCanvas(host, width, height);
    const opts: EditorOptions = {
      host,
      mainTarget: layered.get("main"),
      overlayTarget: layered.get("overlay"),
      initialScene,
      ...(initialMode !== undefined ? { initialMode } : {}),
    };
    const e = new Editor(opts);

    layeredRef.current = layered;
    editorRef.current = e;
    setEditor(e);
    onReady?.(e);

    const ro = new ResizeObserver(() => {
      const next = host.getBoundingClientRect();
      layered.resize(next.width, next.height);
      e.setMode(e.mode); // forces a re-render at the new size
    });
    ro.observe(host);
    observerRef.current = ro;
    // Intentional empty deps — registerSurface is a stable callback for the
    // whole DiagramRoot lifetime; initialScene/initialMode are read once on
    // first mount and changed thereafter via the editor API.
  }, []);

  // Make sure the editor is disposed if `<DiagramRoot>` unmounts even if
  // no surface registered an unmount first (defensive).
  useLayoutEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      editorRef.current?.dispose();
      layeredRef.current?.dispose();
      observerRef.current = null;
      editorRef.current = null;
      layeredRef.current = null;
    };
  }, []);

  return (
    <DiagramEditorBridge.Provider value={editor}>
      <RegisterSurfaceContext.Provider value={registerSurface}>
        {children}
      </RegisterSurfaceContext.Provider>
    </DiagramEditorBridge.Provider>
  );
};

export interface DiagramSurfaceProps {
  readonly style?: CSSProperties;
  readonly className?: string;
}

/**
 * Mounts the canvas host DOM where it is placed in the tree. Must live
 * inside a `<DiagramRoot>`. Renders a plain `<div>` and registers it with
 * the root; the root then creates the editor + `LayeredCanvas` against it.
 */
export const DiagramSurface = ({ style, className }: DiagramSurfaceProps) => {
  const register = useContext(RegisterSurfaceContext);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!register) return undefined;
    register(ref.current);
    return () => register(null);
  }, [register]);

  if (!register) {
    throw new Error("@oh-just-another/react-ui: <DiagramSurface> rendered outside <DiagramRoot>.");
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        ...style,
      }}
    />
  );
};
