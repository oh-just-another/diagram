import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CommentsPanel,
  ContextMenu,
  DEFAULT_CONTEXT_MENU,
  DEFAULT_TOOLBAR,
  DiagramRoot,
  DiagramSurface,
  EdgeStylePanel,
  FloatingZoomControls,
  HelpDialog,
  LayerPanel,
  MainMenu,
  Palette,
  PropertyPanel,
  Toolbar,
  ToastHost,
  TextEditorOverlay,
  WelcomeScreen,
  useHelpDialogHotkey,
} from "@oh-just-another/react-ui";
import type { Editor, FileDropHandler, Mode } from "@oh-just-another/state";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import type { Rasterizer, TextShaper } from "@oh-just-another/renderer-core";
import { WasmTextShaper } from "@oh-just-another/text-wasm";
import { WasmRasterizer } from "@oh-just-another/raster-wasm";
import {
  registerAnimationAdapter,
  setActiveRasterizer,
  setActiveTextShaper,
  type AnimatedSourceAdapter,
} from "@oh-just-another/renderer-core";
import {
  registerLayoutKind,
  type LayoutKindEntry,
} from "@oh-just-another/scene";
import { type Template, defaultRegistry } from "@oh-just-another/templates";
import {
  detectCapabilities,
  logCapabilities,
  type CapabilityOverrides,
  type CapabilityProfile,
} from "./capabilities";
import { createRenderWorker } from "./render-worker-factory";

/**
 * `<Diagram>` — the library-shaped entry point. Mount it inside any
 * React tree and you get a working diagram editor: renderer picked
 * automatically by browser capabilities, full chrome (toolbar, palette,
 * property panel, layer panel, comments) by default, WASM text shaper
 * loaded on browsers that support it.
 *
 * Host customisation:
 *
 *   • Plug **plugins** to extend behaviour without forking — custom
 *     templates, file-drop handlers, layout kinds, animation adapters.
 *   • Hide individual chrome pieces via boolean props.
 *   • Inject host UI via the slot props (`renderHeader`, etc.).
 *   • Reach into the editor imperatively via `apiRef`.
 *
 * All props are optional. Bare `<Diagram />` boots into an empty
 * scene with default chrome.
 */
export interface DiagramAPI {
  /** Direct handle to the underlying `Editor`. */
  readonly editor: Editor | null;
  /** Current scene snapshot — equivalent to `editor.scene`. */
  readonly getScene: () => Scene;
  /**
   * Replace the whole scene. Equivalent to `editor.loadScene(...)`.
   * Resets history by default (matches `loadScene` defaults).
   */
  readonly loadScene: (scene: Scene) => void;
  /** Capability profile actually in use after detection + overrides. */
  readonly capabilities: CapabilityProfile | null;
}

export interface DiagramProps {
  // --- Data ---
  /** Starting scene. Defaults to `emptyScene()`. */
  readonly initialScene?: Scene;
  /** Initial mode (`select` / `draw-rect` / etc). Default `select`. */
  readonly initialMode?: Mode;

  // --- Plugins (extend without forking) ---
  /**
   * Extra templates appended to the default palette. Hosts that want
   * to *replace* the default registry should not use this — register
   * with their own `TemplateRegistry` instead and pass that
   * downstream via context.
   */
  readonly templates?: readonly Template[];
  /** Extra file-drop handlers, registered after the built-ins. */
  readonly fileDropHandlers?: readonly FileDropHandler[];
  /** Custom layout kinds — `metadata.autoLayout = { kind: ... }`. */
  readonly layoutKinds?: readonly LayoutKindEntry<unknown>[];
  /** Animation adapters (gif/lottie/video) for `ImageShape`. */
  readonly animationAdapters?: readonly AnimatedSourceAdapter<unknown>[];

  // --- Imperative API ---
  /**
   * Ref that receives a stable `DiagramAPI` handle every render —
   * mutable `.editor` keeps a live reference, so callers can read
   * the latest scene without forcing a re-render.
   */
  readonly apiRef?: React.Ref<DiagramAPI>;

  // --- Callbacks ---
  /** Called once when the editor is mounted and ready. */
  readonly onReady?: (editor: Editor) => void;
  /** Fires after every scene mutation (uses `editor.subscribe`). */
  readonly onSceneChange?: (scene: Scene) => void;
  /** Fires after every selection mutation. */
  readonly onSelectionChange?: (ids: ReadonlySet<string>) => void;

  // --- Capabilities (auto by default) ---
  /**
   * Force-override the auto-detected capability profile. Any field
   * not listed reverts to auto-detection. Useful to disable WASM
   * for debugging or to lock a backend in a screenshot test.
   */
  readonly capabilities?: CapabilityOverrides;

  // --- Chrome on/off ---
  readonly hideToolbar?: boolean;
  readonly hidePalette?: boolean;
  readonly hidePropertyPanel?: boolean;
  readonly hideLayerPanel?: boolean;
  readonly hideCommentsPanel?: boolean;
  readonly hideContextMenu?: boolean;
  readonly hideMainMenu?: boolean;
  readonly hideZoomControls?: boolean;
  readonly hideWelcomeScreen?: boolean;

  // --- Slots ---
  /** Rendered inside the header next to the title. */
  readonly renderHeaderLeft?: () => ReactNode;
  /** Rendered inside the header on the right. */
  readonly renderHeaderRight?: () => ReactNode;
  /** Custom main-menu items appended to the default. */
  readonly renderMainMenuExtras?: () => ReactNode;
  /** Replace the welcome-screen content. */
  readonly renderWelcomeScreen?: () => ReactNode;

  // --- Theme ---
  /** `"dark"` / `"light"` / `"system"`. Default `"system"`. */
  readonly theme?: "dark" | "light" | "system";

  // --- Layout ---
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const Diagram = forwardRef<DiagramAPI, DiagramProps>(function Diagram(
  props,
  ref,
) {
  const {
    initialScene,
    initialMode = "select",
    templates,
    fileDropHandlers,
    layoutKinds,
    animationAdapters,
    onReady,
    onSceneChange,
    onSelectionChange,
    capabilities: capabilityOverrides,
    hideToolbar,
    hidePalette,
    hidePropertyPanel,
    hideLayerPanel,
    hideCommentsPanel,
    hideContextMenu,
    hideMainMenu,
    hideZoomControls,
    hideWelcomeScreen,
    renderHeaderLeft,
    renderHeaderRight,
    renderMainMenuExtras,
    renderWelcomeScreen,
    theme = "system",
    className,
    style,
  } = props;

  const seed = useMemo<Scene>(() => initialScene ?? emptyScene(), [initialScene]);

  // --- Plugin registration (process-global; safe to re-run because
  // every registry is idempotent on key/id) -----------------------
  useEffect(() => {
    if (templates) {
      for (const t of templates) defaultRegistry.register(t);
    }
    if (layoutKinds) {
      for (const k of layoutKinds) registerLayoutKind(k);
    }
    if (animationAdapters) {
      for (const a of animationAdapters) registerAnimationAdapter(a);
    }
  }, [templates, layoutKinds, animationAdapters]);

  // --- Capabilities ------------------------------------------------
  const [profile, setProfile] = useState<CapabilityProfile | null>(null);
  const [wasmShaper, setWasmShaper] = useState<TextShaper | null>(null);
  const [wasmRaster, setWasmRaster] = useState<Rasterizer | null>(null);
  // React StrictMode in dev double-mounts every effect. Capability
  // detection probes a real WebGL2 context (among others); doing
  // that twice can hit the browser's per-page GL context cap and
  // make the actual editor mount fail with "WebGL2 unavailable".
  // Cache the in-flight promise so the second mount reuses it.
  const detectionRef = useRef<Promise<CapabilityProfile> | null>(null);
  const loggedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!detectionRef.current) {
        detectionRef.current = detectCapabilities(capabilityOverrides);
      }
      const detected = await detectionRef.current;
      if (cancelled) return;
      if (!loggedRef.current) {
        loggedRef.current = true;
        logCapabilities(detected);
      }
      setProfile(detected);
      const loads: Promise<unknown>[] = [];
      if (detected.wasmText) {
        loads.push(
          WasmTextShaper.loadBundled().then(
            (shaper) => {
              if (cancelled) return;
              // Register straight into the process-global text-
              // shaper registry — that's where every backend reads
              // the active shaper from (renderer-canvas's MSDF
              // path, kernel's `wrapText`, etc.). Skipping this
              // step means the WebGL2 backend never sees the
              // newly-loaded shaper and stays on the OffscreenCanvas
              // fallback even though the bundle finished loading.
              setActiveTextShaper(shaper);
              setWasmShaper(shaper);
            },
            (err) => {
              // eslint-disable-next-line no-console
              console.warn(
                "[diagram] WASM text shaper load failed, falling back to Canvas2D",
                err,
              );
            },
          ),
        );
      }
      if (detected.wasmRaster) {
        loads.push(
          WasmRasterizer.loadBundled().then(
            (r) => {
              if (cancelled) return;
              // Same as the text shaper: rasterizer goes into the
              // global registry the WebGL2 backend reads on every
              // bezierCurveTo / quadraticCurveTo call.
              setActiveRasterizer(r);
              setWasmRaster(r);
            },
            (err) => {
              // eslint-disable-next-line no-console
              console.warn(
                "[diagram] WASM rasterizer load failed, falling back to JS sampler",
                err,
              );
            },
          ),
        );
      }
      await Promise.allSettled(loads);
    })();
    return () => {
      cancelled = true;
    };
  }, [capabilityOverrides]);

  // --- Editor wiring -----------------------------------------------
  const [editor, setEditor] = useState<Editor | null>(null);
  const handleReady = useCallback(
    (e: Editor) => {
      // Custom file-drop handlers (registered after the built-ins so
      // image / scene-json win unless the host shadows them).
      if (fileDropHandlers) {
        for (const handler of fileDropHandlers) e.registerFileDropHandler(handler);
      }
      setEditor(e);
      onReady?.(e);
    },
    [fileDropHandlers, onReady],
  );

  // Force a re-render once WASM shaper / rasterizer becomes
  // available after the editor has already mounted. The render
  // pipeline reads the active shaper through a process-global
  // registry, so once we call `setActiveTextShaper` the next
  // render picks up the MSDF path — but the editor only renders
  // on its own state changes. Nudging via `setMode(editor.mode)`
  // triggers a notify/render without mutating editor state.
  useEffect(() => {
    if (!editor) return undefined;
    if (!wasmShaper && !wasmRaster) return undefined;
    editor.setMode(editor.mode);
    return undefined;
  }, [editor, wasmShaper, wasmRaster]);

  // Subscribe to scene / selection changes.
  useEffect(() => {
    if (!editor || (!onSceneChange && !onSelectionChange)) return undefined;
    let lastScene = editor.scene;
    let lastSelection = editor.selection;
    return editor.subscribe(() => {
      if (onSceneChange && editor.scene !== lastScene) {
        lastScene = editor.scene;
        onSceneChange(editor.scene);
      }
      if (onSelectionChange && editor.selection !== lastSelection) {
        lastSelection = editor.selection;
        onSelectionChange(editor.selection);
      }
    });
  }, [editor, onSceneChange, onSelectionChange]);

  // --- Imperative API ----------------------------------------------
  useImperativeHandle<DiagramAPI, DiagramAPI>(
    ref,
    () => ({
      editor,
      getScene: () => editor?.scene ?? seed,
      loadScene: (scene) => editor?.loadScene(scene),
      capabilities: profile,
    }),
    [editor, seed, profile],
  );

  // --- Theme attribute --------------------------------------------
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      return undefined;
    }
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  // --- HelpDialog state -------------------------------------------
  const [helpOpen, setHelpOpen] = useState(false);
  useHelpDialogHotkey(() => setHelpOpen((v) => !v));

  if (!profile) {
    // First frame — capabilities still resolving. Render an empty
    // shell to reserve layout space; the resolve is fast (sync
    // matchMedia + sync getContext + ≤ one frame for WebGPU adapter).
    return <div className={className} style={style} />;
  }

  return (
    <ToastHost>
      <div
        className={className}
        data-diagram-root
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          ...style,
        }}
      >
        {(renderHeaderLeft || renderHeaderRight || !hideMainMenu) && (
          <header
            data-diagram-header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {!hideMainMenu && (
                <MainMenu>
                  {renderMainMenuExtras ? renderMainMenuExtras() : null}
                </MainMenu>
              )}
              {renderHeaderLeft?.()}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {renderHeaderRight?.()}
            </div>
          </header>
        )}

        <DiagramRoot
          initialScene={seed}
          initialMode={initialMode}
          onReady={handleReady}
          renderer={profile.renderer}
          {...(profile.renderer === "offscreen"
            ? { workerFactory: createRenderWorker }
            : {})}
          {...(wasmShaper ? { textShaper: wasmShaper } : {})}
          {...(wasmRaster ? { rasterizer: wasmRaster } : {})}
        >
          <main
            data-diagram-main
            style={{ display: "flex", flex: 1, minHeight: 0, background: "var(--bg)" }}
          >
            {!hidePalette && (
              <div data-diagram-panel="palette" style={panelWrapperStyle}>
                <Palette style={paletteStyle} />
              </div>
            )}
            <div data-diagram-panel="canvas" style={canvasWrapperStyle}>
              <DiagramSurface style={{ flex: 1 }} />
              {!hideToolbar && <Toolbar items={DEFAULT_TOOLBAR} />}
              {!hideZoomControls && <FloatingZoomControls />}
              {!hideWelcomeScreen &&
                (renderWelcomeScreen ? renderWelcomeScreen() : <WelcomeScreen />)}
              <TextEditorOverlay />
              {!hideContextMenu && <ContextMenu items={DEFAULT_CONTEXT_MENU} />}
              <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
            </div>
            {!hidePropertyPanel && (
              <div data-diagram-panel="property" style={panelWrapperStyle}>
                <PropertyPanel style={panelStyle} />
                <EdgeStylePanel style={panelStyle} />
              </div>
            )}
            {!hideLayerPanel && (
              <div data-diagram-panel="layers" style={panelWrapperStyle}>
                <LayerPanel />
              </div>
            )}
            {!hideCommentsPanel && (
              <div data-diagram-panel="comments" style={panelWrapperStyle}>
                <CommentsPanel />
              </div>
            )}
          </main>
        </DiagramRoot>
      </div>
    </ToastHost>
  );
});

const paletteStyle: CSSProperties = {
  flex: "0 0 200px",
  background: "var(--panel)",
  color: "var(--text)",
  borderRight: "1px solid var(--border)",
};

const panelStyle: CSSProperties = {
  flex: "0 0 240px",
  background: "var(--panel)",
  color: "var(--text)",
  borderLeft: "1px solid var(--border)",
};

const panelWrapperStyle: CSSProperties = { display: "flex", minHeight: 0 };
const canvasWrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  position: "relative",
};
