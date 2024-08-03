import {
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
import { DiagramProvider } from "./context.js";

/**
 * Wraps a `<div>` host element, instantiates an `Editor` against it, and
 * exposes the editor to the React subtree via `DiagramProvider`. Designed
 * to be the *one* thing you mount to get a working diagram surface.
 *
 * The editor's lifetime is tied to the component: it's created in
 * `useLayoutEffect` (so children can read it during their own
 * `useLayoutEffect`s) and disposed on unmount.
 */
export interface DiagramCanvasProps {
  /** Initial scene (typically `emptyScene()` or a loaded document). */
  readonly initialScene: Scene;
  readonly initialMode?: Mode;
  /**
   * Optional handler that receives the freshly-constructed `Editor`. Useful
   * for hosts that want imperative access without spelunking through the
   * provider context.
   */
  readonly onReady?: (editor: Editor) => void;
  /** Inline style applied to the host element. Default: full size. */
  readonly style?: CSSProperties;
  readonly className?: string;
  /** Renderered inside the provider — typically `Toolbar`, `Palette`, etc. */
  readonly children?: ReactNode;
  /**
   * Skip the implicit `installBuiltinRenderers()` call. Use when the host
   * already installed renderers (e.g. plus custom shape types) before
   * mounting the canvas.
   */
  readonly skipInstallRenderers?: boolean;
}

export const DiagramCanvas = ({
  initialScene,
  initialMode,
  onReady,
  style,
  className,
  children,
  skipInstallRenderers,
}: DiagramCanvasProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  // useLayoutEffect so the editor (and therefore the provider value) is
  // available before children's effects run. Otherwise hooks like
  // `useSelection` would throw on the first render.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

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
    setEditor(e);
    onReady?.(e);

    const ro = new ResizeObserver(() => {
      const next = host.getBoundingClientRect();
      layered.resize(next.width, next.height);
      // Trigger a re-render without changing mode — easiest way to force the
      // editor to repaint at the new size.
      e.setMode(e.mode);
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      e.dispose();
      // LayeredCanvas creates DOM nodes — let the React unmount flow remove
      // the host; the inner canvases live inside it and go with it.
      setEditor(null);
    };
    // Intentional empty-deps: the editor lifetime spans the component lifetime.
    // Props that drive editor state (initialScene/initialMode) are read once
    // on mount; runtime changes go through the editor API instead of remount.
  }, []);

  const finalStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    touchAction: "none",
    userSelect: "none",
    ...style,
  };

  return (
    <div ref={hostRef} className={className} style={finalStyle}>
      {editor ? <DiagramProvider editor={editor}>{children}</DiagramProvider> : null}
    </div>
  );
};

// `useEffect` is imported to keep the hooks API consistent if we add an
// alternative non-layout entrypoint later; for now Strict Mode is fine.
void useEffect;
