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
  BottomBar,
  ButtonGroup,
  ContextMenu,
  DEFAULT_CONTEXT_MENU,
  DEFAULT_TOOLBAR,
  DiagramRoot,
  DiagramSurface,
  HelpButton,
  HelpDialog,
  IconButton,
  LibraryPanel,
  MainMenu,
  ResetToContentButton,
  SelectedShapeActions,
  TextEditorOverlay,
  ToastHost,
  Toolbar,
  TopBar,
  UILayer,
  useDiagramOptional,
  useHelpDialogHotkey,
  usePalettePlacement,
} from "@oh-just-another/react-ui";
import type { Editor, FileDropHandler, Mode } from "@oh-just-another/state";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import type { Rasterizer, TextShaper } from "@oh-just-another/renderer-core";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
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
 * `<Diagram>` — library shell. Mount inside any
 * React tree → working diagram editor with floating top + bottom
 * bars over a full-bleed canvas. No fixed sidebars — Library and
 * Properties panels are floating overlays that appear on demand.
 *
 * Layout breakdown:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [Menu] [Library]    [Toolbar]   [Theme]  │  ← TopBar (3 zones)
 *   │  ┌──────┐                  ┌──────────┐  │
 *   │  │ Lib  │                  │ Selected │  │  ← Side panels (conditional)
 *   │  │ Panel│   <canvas>       │  Shape   │  │
 *   │  │      │                  │  Actions │  │
 *   │  └──────┘                  └──────────┘  │
 *   │ [Zoom] [Fit] [Reset]            [Help]   │  ← BottomBar
 *   └──────────────────────────────────────────┘
 *
 * Hosts hide individual bits via boolean props or replace whole
 * slots through `renderTopBar*` / `renderBottomBar*` props.
 */
export interface DiagramAPI {
  readonly editor: Editor | null;
  readonly getScene: () => Scene;
  readonly loadScene: (scene: Scene) => void;
  readonly capabilities: CapabilityProfile | null;
}

export interface DiagramProps {
  // --- Data ---
  readonly initialScene?: Scene;
  readonly initialMode?: Mode;

  // --- Plugins ---
  readonly templates?: readonly Template[];
  readonly fileDropHandlers?: readonly FileDropHandler[];
  readonly layoutKinds?: readonly LayoutKindEntry<unknown>[];
  readonly animationAdapters?: readonly AnimatedSourceAdapter<unknown>[];

  // --- Imperative API ---
  readonly apiRef?: React.Ref<DiagramAPI>;

  // --- Callbacks ---
  readonly onReady?: (editor: Editor) => void;
  readonly onSceneChange?: (scene: Scene) => void;
  readonly onSelectionChange?: (ids: ReadonlySet<string>) => void;

  // --- Capabilities ---
  readonly capabilities?: CapabilityOverrides;

  // --- Chrome on/off ---
  readonly hideTopBar?: boolean;
  readonly hideBottomBar?: boolean;
  readonly hideToolbar?: boolean;
  readonly hideLibraryButton?: boolean;
  readonly hideMainMenu?: boolean;
  readonly hideZoomControls?: boolean;
  readonly hideResetToContent?: boolean;
  readonly hideHelpButton?: boolean;
  readonly hideContextMenu?: boolean;
  readonly hideSelectedShapeActions?: boolean;

  // --- Slots ---
  readonly renderTopBarLeft?: () => ReactNode;
  readonly renderTopBarCenter?: () => ReactNode;
  readonly renderTopBarRight?: () => ReactNode;
  readonly renderBottomBarLeft?: () => ReactNode;
  readonly renderBottomBarCenter?: () => ReactNode;
  readonly renderBottomBarRight?: () => ReactNode;
  readonly renderMainMenuExtras?: () => ReactNode;
  /** Called when user clicks the "Import" button in the Library panel. */
  readonly onImportTemplates?: () => void;

  // --- Theme ---
  /**
   * Controlled theme. When provided, the menu's Theme submenu only
   * displays the current selection (no state change unless the
   * host wires `onThemeChange`). Omit to let `<Diagram>` manage
   * its own theme via internal state (default behaviour).
   */
  readonly theme?: "dark" | "light" | "system";
  /**
   * Initial theme when `theme` is uncontrolled. Default `"system"`
   * — respects the user's OS preference until they pick something
   * else from the menu.
   */
  readonly defaultTheme?: "dark" | "light" | "system";
  /**
   * Called whenever the user changes the theme via the menu. When
   * `theme` is controlled (passed as a prop), this is the host's
   * only way to receive the new value.
   */
  readonly onThemeChange?: (theme: "dark" | "light" | "system") => void;
  /**
   * Persist the user's theme choice in `localStorage` under the
   * given key so it survives reloads. Pass `true` for the default
   * key `"diagram-theme"`, or a string for a custom one. Omit to
   * keep the menu non-persistent (theme resets to `defaultTheme`
   * on reload).
   */
  readonly persistTheme?: boolean | string;

  // --- Layout ---
  readonly className?: string;
  readonly style?: CSSProperties;
}

export type DiagramTheme = "dark" | "light" | "system";

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
    hideTopBar,
    hideBottomBar,
    hideToolbar,
    hideLibraryButton,
    hideMainMenu,
    hideZoomControls,
    hideResetToContent,
    hideHelpButton,
    hideContextMenu,
    hideSelectedShapeActions,
    renderTopBarLeft,
    renderTopBarCenter,
    renderTopBarRight,
    renderBottomBarLeft,
    renderBottomBarCenter,
    renderBottomBarRight,
    renderMainMenuExtras,
    onImportTemplates,
    theme: themeProp,
    defaultTheme = "system",
    onThemeChange,
    persistTheme,
    className,
    style,
  } = props;

  // Theme: controlled when `themeProp` is provided, otherwise
  // self-managed via `internalTheme`. The lazy `useState` initializer
  // reads from `localStorage` once when `persistTheme` is on.
  const storageKey = useMemo(() => {
    if (persistTheme === true) return "diagram-theme";
    if (typeof persistTheme === "string") return persistTheme;
    return null;
  }, [persistTheme]);
  const [internalTheme, setInternalTheme] = useState<DiagramTheme>(() => {
    if (!storageKey || typeof window === "undefined") return defaultTheme;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return defaultTheme;
  });
  const theme: DiagramTheme = themeProp ?? internalTheme;
  const changeTheme = useCallback(
    (next: DiagramTheme) => {
      if (themeProp === undefined) setInternalTheme(next);
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next);
      }
      onThemeChange?.(next);
    },
    [themeProp, onThemeChange, storageKey],
  );

  const seed = useMemo<Scene>(() => initialScene ?? emptyScene(), [initialScene]);

  // --- Plugin registration ---
  useEffect(() => {
    if (templates) for (const t of templates) defaultRegistry.register(t);
    if (layoutKinds) for (const k of layoutKinds) registerLayoutKind(k);
    if (animationAdapters) for (const a of animationAdapters) registerAnimationAdapter(a);
  }, [templates, layoutKinds, animationAdapters]);

  // --- Capabilities + WASM async load ---
  const [profile, setProfile] = useState<CapabilityProfile | null>(null);
  const [wasmShaper, setWasmShaper] = useState<TextShaper | null>(null);
  const [wasmRaster, setWasmRaster] = useState<Rasterizer | null>(null);
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
              setActiveTextShaper(shaper);
              setWasmShaper(shaper);
            },
            (err) => {
              // eslint-disable-next-line no-console
              console.warn("[diagram] WASM text shaper load failed", err);
            },
          ),
        );
      }
      if (detected.wasmRaster) {
        loads.push(
          WasmRasterizer.loadBundled().then(
            (r) => {
              if (cancelled) return;
              setActiveRasterizer(r);
              setWasmRaster(r);
            },
            (err) => {
              // eslint-disable-next-line no-console
              console.warn("[diagram] WASM rasterizer load failed", err);
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

  // --- Editor wiring ---
  const [editor, setEditor] = useState<Editor | null>(null);
  const handleReady = useCallback(
    (e: Editor) => {
      if (fileDropHandlers) {
        for (const handler of fileDropHandlers) e.registerFileDropHandler(handler);
      }
      setEditor(e);
      onReady?.(e);
    },
    [fileDropHandlers, onReady],
  );

  useEffect(() => {
    if (!editor) return undefined;
    if (!wasmShaper && !wasmRaster) return undefined;
    editor.setMode(editor.mode);
    return undefined;
  }, [editor, wasmShaper, wasmRaster]);

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

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      return undefined;
    }
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  if (!profile) {
    return <div className={className} style={style} />;
  }

  return (
    <ToastHost>
      <div
        className={className}
        data-diagram-root
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "var(--du-canvas-bg)",
          ...style,
        }}
      >
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
          <EditorShell
            hideTopBar={hideTopBar}
            hideBottomBar={hideBottomBar}
            hideToolbar={hideToolbar}
            hideLibraryButton={hideLibraryButton}
            hideMainMenu={hideMainMenu}
            hideZoomControls={hideZoomControls}
            hideResetToContent={hideResetToContent}
            hideHelpButton={hideHelpButton}
            hideContextMenu={hideContextMenu}
            hideSelectedShapeActions={hideSelectedShapeActions}
            renderTopBarLeft={renderTopBarLeft}
            renderTopBarCenter={renderTopBarCenter}
            renderTopBarRight={renderTopBarRight}
            renderBottomBarLeft={renderBottomBarLeft}
            renderBottomBarCenter={renderBottomBarCenter}
            renderBottomBarRight={renderBottomBarRight}
            renderMainMenuExtras={renderMainMenuExtras}
            onImportTemplates={onImportTemplates}
            theme={theme}
            changeTheme={changeTheme}
          />
        </DiagramRoot>
      </div>
    </ToastHost>
  );
});

/**
 * Inner shell — must render *inside* `<DiagramRoot>` so hooks that
 * need the editor context (`usePalettePlacement`, `useDiagramOptional`,
 * `useHelpDialogHotkey`) resolve correctly. Composes the
 * canvas-surface + ui-layer overlay + side panels into one tree.
 */
const EditorShell = ({
  hideTopBar,
  hideBottomBar,
  hideToolbar,
  hideLibraryButton,
  hideMainMenu,
  hideZoomControls,
  hideResetToContent,
  hideHelpButton,
  hideContextMenu,
  hideSelectedShapeActions,
  renderTopBarLeft,
  renderTopBarCenter,
  renderTopBarRight,
  renderBottomBarLeft,
  renderBottomBarCenter,
  renderBottomBarRight,
  renderMainMenuExtras,
  onImportTemplates,
  theme,
  changeTheme,
}: {
  readonly hideTopBar: boolean | undefined;
  readonly hideBottomBar: boolean | undefined;
  readonly hideToolbar: boolean | undefined;
  readonly hideLibraryButton: boolean | undefined;
  readonly hideMainMenu: boolean | undefined;
  readonly hideZoomControls: boolean | undefined;
  readonly hideResetToContent: boolean | undefined;
  readonly hideHelpButton: boolean | undefined;
  readonly hideContextMenu: boolean | undefined;
  readonly hideSelectedShapeActions: boolean | undefined;
  readonly renderTopBarLeft: (() => ReactNode) | undefined;
  readonly renderTopBarCenter: (() => ReactNode) | undefined;
  readonly renderTopBarRight: (() => ReactNode) | undefined;
  readonly renderBottomBarLeft: (() => ReactNode) | undefined;
  readonly renderBottomBarCenter: (() => ReactNode) | undefined;
  readonly renderBottomBarRight: (() => ReactNode) | undefined;
  readonly renderMainMenuExtras: (() => ReactNode) | undefined;
  readonly onImportTemplates: (() => void) | undefined;
  readonly theme: DiagramTheme;
  readonly changeTheme: (next: DiagramTheme) => void;
}) => {
  const editor = useDiagramOptional();
  const paletteDropHandlers = usePalettePlacement();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useHelpDialogHotkey(() => setHelpOpen((v) => !v));

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onDragEnter={paletteDropHandlers.onDragEnter}
      onDragOver={paletteDropHandlers.onDragOver}
      onDragLeave={paletteDropHandlers.onDragLeave}
      onDrop={paletteDropHandlers.onDrop}
    >
      {/* Full-bleed canvas underneath everything. */}
      <DiagramSurface style={{ position: "absolute", inset: 0 }} />

      {/* Per-shape overlays (text editor, context menu) sit between
          canvas and UI layer — they're positioned in scene-space and
          shouldn't be hidden by floating chrome. */}
      <TextEditorOverlay />
      {!hideContextMenu && <ContextMenu items={DEFAULT_CONTEXT_MENU} />}

      {/* UI layer — top/bottom bars + side panels. */}
      <UILayer>
        {!hideTopBar && (
          <TopBar
            left={
              <>
                {!hideMainMenu && (
                  <MainMenu>
                    <MainMenu.Group title="File">
                      <MainMenu.Item onClick={() => openSceneFile(editor)}>
                        Open…
                      </MainMenu.Item>
                      <MainMenu.Item
                        onClick={() => editor && downloadScene(editor.scene)}
                        disabled={!editor}
                      >
                        Save as JSON
                      </MainMenu.Item>
                      <MainMenu.Item
                        onClick={() => editor && downloadPng(editor)}
                        disabled={!editor}
                      >
                        Export as PNG
                      </MainMenu.Item>
                      <MainMenu.Item
                        onClick={() => editor && downloadSvg(editor.scene)}
                        disabled={!editor}
                      >
                        Export as SVG
                      </MainMenu.Item>
                      <MainMenu.Item
                        onClick={() => {
                          if (!editor) return;
                          if (
                            window.confirm("Reset canvas? This clears all shapes.")
                          ) {
                            // editor.clear() keeps viewport (zoom /
                            // pan / gridSize) and layers — only
                            // shapes / edges go. loadScene(emptyScene())
                            // would also drop the grid because
                            // DEFAULT_VIEWPORT has no gridSize.
                            editor.clear();
                          }
                        }}
                        disabled={!editor}
                      >
                        Reset canvas
                      </MainMenu.Item>
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="Edit">
                      <MainMenu.Item
                        shortcut="⌘Z"
                        onClick={() => editor?.undo()}
                        disabled={!editor}
                      >
                        Undo
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⇧⌘Z"
                        onClick={() => editor?.redo()}
                        disabled={!editor}
                      >
                        Redo
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌘X"
                        onClick={() => editor?.cutSelected()}
                        disabled={!editor}
                      >
                        Cut
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌘C"
                        onClick={() => editor?.copySelected()}
                        disabled={!editor}
                      >
                        Copy
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌘V"
                        onClick={() => editor?.paste()}
                        disabled={!editor}
                      >
                        Paste
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌘A"
                        onClick={() => editor?.selectAll()}
                        disabled={!editor}
                      >
                        Select all
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌫"
                        onClick={() => editor?.deleteSelected()}
                        disabled={!editor}
                      >
                        Delete selected
                      </MainMenu.Item>
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="View">
                      <MainMenu.Item
                        shortcut="⇧F"
                        onClick={() => editor?.zoomToFit()}
                        disabled={!editor}
                      >
                        Fit to screen
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌘+"
                        onClick={() => editor?.zoomIn()}
                        disabled={!editor}
                      >
                        Zoom in
                      </MainMenu.Item>
                      <MainMenu.Item
                        shortcut="⌘−"
                        onClick={() => editor?.zoomOut()}
                        disabled={!editor}
                      >
                        Zoom out
                      </MainMenu.Item>
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="Theme">
                      <MainMenu.Item
                        active={theme === "light"}
                        onClick={() => changeTheme("light")}
                      >
                        Light
                      </MainMenu.Item>
                      <MainMenu.Item
                        active={theme === "dark"}
                        onClick={() => changeTheme("dark")}
                      >
                        Dark
                      </MainMenu.Item>
                      <MainMenu.Item
                        active={theme === "system"}
                        onClick={() => changeTheme("system")}
                      >
                        System
                      </MainMenu.Item>
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="Help">
                      <MainMenu.Item shortcut="?" onClick={() => setHelpOpen(true)}>
                        Hotkeys
                      </MainMenu.Item>
                      <MainMenu.ItemLink
                        href="https://github.com/oh-just-another/diagram"
                        external
                      >
                        GitHub
                      </MainMenu.ItemLink>
                    </MainMenu.Group>
                    {renderMainMenuExtras ? (
                      <>
                        <MainMenu.Separator />
                        {renderMainMenuExtras()}
                      </>
                    ) : null}
                  </MainMenu>
                )}
                {renderTopBarLeft ? renderTopBarLeft() : null}
              </>
            }
            center={
              !hideToolbar
                ? renderTopBarCenter
                  ? renderTopBarCenter()
                  : <Toolbar items={DEFAULT_TOOLBAR} />
                : renderTopBarCenter?.()
            }
            right={
              <>
                {renderTopBarRight ? renderTopBarRight() : null}
                {!hideLibraryButton && (
                  <IconButton
                    label="Library"
                    active={libraryOpen}
                    onClick={() => setLibraryOpen((v) => !v)}
                  >
                    ☰
                  </IconButton>
                )}
              </>
            }
          />
        )}

        {!hideBottomBar && (
          <BottomBar
            left={
              renderBottomBarLeft
                ? renderBottomBarLeft()
                : !hideZoomControls
                  ? <ZoomControls />
                  : null
            }
            center={
              renderBottomBarCenter
                ? renderBottomBarCenter()
                : !hideResetToContent
                  ? <ResetToContentButton />
                  : null
            }
            right={
              renderBottomBarRight
                ? renderBottomBarRight()
                : !hideHelpButton
                  ? <HelpButton />
                  : null
            }
          />
        )}

        <LibraryPanel
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          {...(onImportTemplates ? { onImport: onImportTemplates } : {})}
        />

        {!hideSelectedShapeActions && <SelectedShapeActions />}
      </UILayer>

      {/* Standalone HelpDialog for hotkey activation — only renders
          when the `?` hotkey opens it without going through the
          button. HelpButton manages its own copy when clicked. */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {void editor}
    </div>
  );
};

/**
 * Bottom-left zoom controls — three pills (zoom-out / zoom level / zoom-in)
 * + a fit-to-screen button. Wraps the editor's zoom API in the
 * unified IconButton chrome so the visual style matches the rest of
 * the bar.
 */
const ZoomControls = () => {
  const editor = useDiagramOptional();
  // Force re-render on viewport change.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    return editor.subscribe(() => force((n) => n + 1));
  }, [editor]);
  if (!editor) return null;
  const zoom = editor.scene.viewport.zoom;
  return (
    <ButtonGroup ariaLabel="Zoom">
      <IconButton label="Zoom out" onClick={() => editor.zoomOut()}>
        −
      </IconButton>
      <span
        className="du-icon-button"
        aria-label="Current zoom"
        style={{
          minWidth: 56,
          padding: "0 8px",
          borderRadius: 0,
          cursor: "default",
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <IconButton label="Zoom in" onClick={() => editor.zoomIn()}>
        +
      </IconButton>
      <IconButton label="Fit to screen" onClick={() => editor.zoomToFit()}>
        ⤢
      </IconButton>
    </ButtonGroup>
  );
};

// --- MainMenu File-group helpers --------------------------------------------

/**
 * Trigger a browser download of arbitrary bytes. Used by the
 * Save / Export menu items. Creates a temporary `<a>`, clicks it,
 * cleans up the object URL on the next animation frame so the
 * browser has time to start the download.
 */
const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  requestAnimationFrame(() => URL.revokeObjectURL(url));
};

/** "Save as JSON" — serialises the scene through @serialization. */
const downloadScene = (scene: Scene): void => {
  const json = stringifyScene(scene, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), "scene.diagram.json");
};

/**
 * "Open…" — file picker that accepts `.diagram.json`, parses it,
 * and replaces the editor's scene. Resets history (matches the
 * default `loadScene` behaviour). User cancellation = no-op.
 */
const openSceneFile = (editor: Editor | null): void => {
  if (!editor) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const scene = parseScene(text);
        editor.loadScene(scene);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[diagram] failed to parse scene file:", err);
        window.alert(
          "Failed to parse the file — make sure it was saved through this app's Save action.",
        );
      }
    });
  };
  input.click();
};

/**
 * "Export as PNG" — grabs the main canvas DOM element and calls
 * `toBlob`. Works for both Canvas2D and WebGL2 backends since
 * `preserveDrawingBuffer: true` is already set on the WebGL
 * context. The overlay / background layers are NOT composited in
 * — they're cheap UI decorations (selection halo, grid) rather
 * than scene content, and most users want the bare shapes
 * exported. Hosts who need a full composite roll their own.
 */
const downloadPng = (editor: Editor): void => {
  void editor; // hooked off the DOM, not the Editor reference
  // The main shape layer is the only canvas tagged with this dataset
  // attribute. Both Canvas2D and WebGL2 layered surfaces emit it
  // (LayeredCanvas / WebGL2LayeredSurface). preserveDrawingBuffer
  // is on in WebGL2 so `toBlob` returns the latest frame.
  const main = document.querySelector('canvas[data-layer="main"]');
  if (!(main instanceof HTMLCanvasElement)) return;
  main.toBlob((blob: Blob | null) => {
    if (!blob) return;
    downloadBlob(blob, "scene.png");
  }, "image/png");
};

/**
 * "Export as SVG" — uses `@renderer-svg.renderSceneToSvg` so the
 * output is identical to the headless render path (vector, no
 * bitmap fall-back, works in any browser). One file per scene.
 */
const downloadSvg = (scene: Scene): void => {
  const svg = renderSceneToSvg(scene);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "scene.svg");
};
