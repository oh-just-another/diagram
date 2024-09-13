import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
      backgroundTarget: layered.get("background"),
      initialScene,
      ...(initialMode !== undefined ? { initialMode } : {}),
    };
    const e = new Editor(opts);
    // Sync viewport size to actual canvas dimensions — without this
    // `Editor.computeViewportWorld()` uses a stale value from
    // `initialScene.viewport.size` (host often seeds 0x0 or
    // legacy hardcoded), which leads to under-coverage of the culling rect and
    // shapes outside this rect are not rendered.
    e.setViewportSize(width, height);

    layeredRef.current = layered;
    editorRef.current = e;
    setEditor(e);
    onReady?.(e);

    const ro = new ResizeObserver(() => {
      const next = host.getBoundingClientRect();
      layered.resize(next.width, next.height);
      e.setViewportSize(next.width, next.height);
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
        <LiveRegion editor={editor} />
      </RegisterSurfaceContext.Provider>
    </DiagramEditorBridge.Provider>
  );
};

/**
 * Hidden `aria-live="polite"` region that pipes `editor.onAnnounce`
 * messages to assistive tech. Rendered automatically by every
 * `<DiagramRoot>`; visually hidden but readable by screen readers.
 */
const LiveRegion = ({ editor }: { readonly editor: Editor | null }) => {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!editor) return undefined;
    return editor.onAnnounce(setMessage);
  }, [editor]);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {message}
    </div>
  );
};

export interface DiagramSurfaceProps {
  readonly style?: CSSProperties;
  readonly className?: string;
  /**
   * Accessible name for the canvas region — read out by screen readers
   * and shown as the visible focus-ring tooltip. Defaults to
   * `"Diagram canvas"`. Override per-app to give context (e.g. the
   * document title).
   */
  readonly ariaLabel?: string;
}

/**
 * Mounts the canvas host DOM where it is placed in the tree. Must live
 * inside a `<DiagramRoot>`. Renders a plain `<div>` and registers it with
 * the root; the root then creates the editor + `LayeredCanvas` against it.
 *
 * The surface is `tabIndex=0` + `role="application"` so keyboard users
 * can land on it via Tab and screen readers announce it as an interactive
 * canvas (the contents are non-DOM). Hosts that want a different
 * accessible name pass `ariaLabel`.
 */
export const DiagramSurface = ({ style, className, ariaLabel }: DiagramSurfaceProps) => {
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
      role="application"
      tabIndex={0}
      aria-label={ariaLabel ?? "Diagram canvas"}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        // Visible focus ring — UA-default for `outline` is sometimes
        // suppressed by parent `*:focus { outline: none }` rules; we
        // declare an explicit one so keyboard users always see focus.
        outline: "none",
        ...style,
      }}
      onFocus={(ev) => {
        ev.currentTarget.style.outline = "2px solid var(--accent, #1a73e8)";
        ev.currentTarget.style.outlineOffset = "-2px";
      }}
      onBlur={(ev) => {
        ev.currentTarget.style.outline = "none";
      }}
    />
  );
};
