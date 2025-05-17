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
    theme = "system",
    className,
    style,
  } = props;

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
                {(!hideMainMenu || !hideLibraryButton) && (
                  <ButtonGroup ariaLabel="Main menu">
                    {!hideMainMenu && (
                      <MainMenu>
                        {renderMainMenuExtras ? renderMainMenuExtras() : null}
                      </MainMenu>
                    )}
                    {!hideLibraryButton && (
                      <IconButton
                        label="Library"
                        active={libraryOpen}
                        onClick={() => setLibraryOpen((v) => !v)}
                      >
                        ☰
                      </IconButton>
                    )}
                  </ButtonGroup>
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
            right={renderTopBarRight ? renderTopBarRight() : null}
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
