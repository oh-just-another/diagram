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
import {
  createLayeredSurfaceWithFallback,
  installBuiltinRenderers,
  type LayeredSurface,
  type RendererBackend,
} from "@oh-just-another/renderer-canvas";
import { Editor, type EditorOptions, type Mode } from "@oh-just-another/state";
import type { Rasterizer, TextShaper } from "@oh-just-another/renderer-core";
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
  /**
   * Renderer backend. `"canvas2d"` (default) is the always-safe path;
   * `"webgl2"` and `"offscreen"` are opt-in and require host support
   * (the demo wires a switcher to try each at runtime).
   *
   * Changing this prop after mount **recreates** the editor and
   * surface — the host should keep the value stable except when the
   * user explicitly switches backend.
   */
  readonly renderer?: RendererBackend;
  /**
   * Worker factory for the `offscreen` backend. Hosts must provide
   * a function that returns a fresh `Worker` instance pointing at
   * `@oh-just-another/renderer-canvas`'s `render-worker.ts`. The factory
   * is bundler-specific (Vite vs webpack vs Rollup all spell the
   * URL differently), so the kernel never ships a default.
   */
  readonly workerFactory?: () => Worker;
  /**
   * Pre-loaded WASM text shaper (or any `TextShaper` impl).
   * Forwarded straight into `EditorOptions.textShaper` so the
   * built-in `drawText` renderer uses it for wrap measurements.
   * Pass `WasmTextShaper.loadBundled()` (await first!) from
   * `@oh-just-another/text-wasm`.
   */
  readonly textShaper?: TextShaper;
  /**
   * Pre-loaded WASM rasterizer. Forwarded into the editor for
   * hosts that want path-heavy code to go through WASM bezier
   * flatten / stroke-to-fill.
   */
  readonly rasterizer?: Rasterizer;
}

export const DiagramRoot = ({
  initialScene,
  initialMode,
  children,
  onReady,
  skipInstallRenderers,
  renderer = "canvas2d",
  workerFactory,
  textShaper,
  rasterizer,
}: DiagramRootProps) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const surfaceRef = useRef<LayeredSurface | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  // The factory ref keeps `registerSurface`'s deps stable while
  // still letting renderer/backend reactivity below see the latest
  // values when it re-mounts the surface.
  const rendererRef = useRef<RendererBackend>(renderer);
  const workerFactoryRef = useRef<(() => Worker) | undefined>(workerFactory);
  const textShaperRef = useRef<TextShaper | undefined>(textShaper);
  const rasterizerRef = useRef<Rasterizer | undefined>(rasterizer);
  rendererRef.current = renderer;
  workerFactoryRef.current = workerFactory;
  textShaperRef.current = textShaper;
  rasterizerRef.current = rasterizer;

  const mountSurface = useCallback((host: HTMLElement) => {
    if (!skipInstallRenderers) installBuiltinRenderers();

    const { width, height } = host.getBoundingClientRect();
    const { surface, effectiveBackend } = createLayeredSurfaceWithFallback(
      host,
      width,
      height,
      {
        backend: rendererRef.current,
        ...(workerFactoryRef.current ? { workerFactory: workerFactoryRef.current } : {}),
      },
      (requested, err) => {
        // Backend unavailable (no WebGL2 / OffscreenCanvas / context
        // limit hit). The fallback already returned a canvas2d
        // surface; log so dev tools surface the reason. Hosts that
        // want a toast can read `editor.host.dataset.effectiveBackend`.
        console.warn(
          `[DiagramRoot] ${requested} renderer unavailable, falling back to canvas2d:`,
          err,
        );
      },
    );
    host.dataset.effectiveBackend = effectiveBackend;
    const opts: EditorOptions = {
      host,
      mainTarget: surface.get("main"),
      overlayTarget: surface.get("overlay"),
      backgroundTarget: surface.get("background"),
      initialScene,
      ...(initialMode !== undefined ? { initialMode } : {}),
      ...(textShaperRef.current ? { textShaper: textShaperRef.current } : {}),
      ...(rasterizerRef.current ? { rasterizer: rasterizerRef.current } : {}),
    };
    const e = new Editor(opts);
    e.setViewportSize(width, height);

    surfaceRef.current = surface;
    editorRef.current = e;
    setEditor(e);
    onReady?.(e);

    // Backends with deferred submission (offscreen) need a flush
    // hook after every Editor frame. Subscribe to `onChange` and
    // present at the next microtask so Editor's internal rAF has
    // already painted into the RecordingTargets.
    const subscribe = e.subscribe(() => {
      queueMicrotask(() => surfaceRef.current?.present());
    });
    unsubscribeRef.current = subscribe;
    surface.present();

    const ro = new ResizeObserver(() => {
      const next = host.getBoundingClientRect();
      surface.resize(next.width, next.height);
      e.setViewportSize(next.width, next.height);
      e.setMode(e.mode); // forces a re-render at the new size
    });
    ro.observe(host);
    observerRef.current = ro;
  }, []);

  const teardownSurface = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    editorRef.current?.dispose();
    editorRef.current = null;
    surfaceRef.current?.dispose();
    surfaceRef.current = null;
  }, []);

  const registerSurface = useCallback<RegisterSurface>(
    (host) => {
      teardownSurface();
      hostRef.current = host;
      if (!host) {
        setEditor(null);
        return;
      }
      mountSurface(host);
    },
    [mountSurface, teardownSurface],
  );

  // Re-mount the surface when the host swaps backends at runtime.
  // The first mount is driven by `registerSurface`; subsequent
  // backend changes need an explicit tear-down + remount because
  // `LayeredSurface` ownership is per-backend.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    teardownSurface();
    mountSurface(host);
  }, [renderer, mountSurface, teardownSurface]);

  // Make sure the editor is disposed if `<DiagramRoot>` unmounts even if
  // no surface registered an unmount first (defensive).
  useLayoutEffect(() => {
    return () => {
      teardownSurface();
      hostRef.current = null;
    };
  }, [teardownSurface]);

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
