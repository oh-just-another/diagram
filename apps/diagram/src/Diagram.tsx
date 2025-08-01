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
  Clipboard,
  Copy,
  Delete,
  Download,
  FileDown,
  FileUp,
  Grid3x3,
  Grip,
  HelpCircle,
  ImageDown,
  Library as LibraryIcon,
  Maximize,
  Minus,
  Monitor,
  Moon,
  MousePointer,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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
  SelectionFloatingPanel,
  TextEditorOverlay,
  ToastHost,
  Toolbar,
  TooltipProvider,
  TopBar,
  UILayer,
  useDiagramOptional,
  useHelpDialogHotkey,
  usePalettePlacement,
  useScene,
} from "@oh-just-another/react-ui";

/**
 * Lucide icon sizing — `MENU_ICON_SIZE` is for in-row icons of
 * `MainMenu.Item`, `TOGGLE_ICON_SIZE` is for the segmented Theme /
 * Grid toggles, `BUTTON_ICON_SIZE` is for `IconButton` slot
 * children (library, zoom, fit). All share `BUTTON_ICON_STROKE`
 * for visual consistency with the toolbar.
 */
const MENU_ICON_SIZE = 14;
const TOGGLE_ICON_SIZE = 14;
const BUTTON_ICON_SIZE = 16;
const BUTTON_ICON_STROKE = 1.75;
const menuIcon = { size: MENU_ICON_SIZE, strokeWidth: BUTTON_ICON_STROKE } as const;
const toggleIcon = { size: TOGGLE_ICON_SIZE, strokeWidth: BUTTON_ICON_STROKE } as const;
const buttonIcon = { size: BUTTON_ICON_SIZE, strokeWidth: BUTTON_ICON_STROKE } as const;
import type { Editor, FileDropHandler, Mode } from "@oh-just-another/state";
import { emptyScene, type GridStyle, type Scene } from "@oh-just-another/scene";
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
import { exportSceneToPng, type PngExportBackground } from "./png-export";

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
  readonly hideSelectionPanel?: boolean;

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
    hideSelectionPanel,
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
      <TooltipProvider>
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
            hideSelectionPanel={hideSelectionPanel}
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
      </TooltipProvider>
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
  hideSelectionPanel,
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
  readonly hideSelectionPanel: boolean | undefined;
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
  // Subscribe to scene changes so the Grid toggle in MainMenu reads
  // the latest viewport.gridSize / gridStyle. `useScene` is a thin
  // selector hook — re-renders only on scene identity flips.
  void useScene();
  const paletteDropHandlers = usePalettePlacement();
  // Auto-open on mount if the user previously pinned OR docked the
  // panel — both flags semantically mean "I want this panel visible
  // permanently". `open` itself isn't persisted; it's derived from
  // pin/dock storage so a session that ended with the panel closed
  // (regular floating overlay) doesn't keep popping back open.
  const [libraryOpen, setLibraryOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const pinned = window.localStorage.getItem("du:library:pinned") === "1";
      const docked = window.localStorage.getItem("du:library:docked") === "1";
      return pinned || docked;
    } catch {
      return false;
    }
  });
  // Library dock state lives in the host so the shell can reflow
  // canvas + bars when the panel becomes a sibling column instead
  // of a floating overlay. Seeded from localStorage by LibraryPanel
  // itself; the callback below keeps the host's copy in sync.
  const [libraryDocked, setLibraryDocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("du:library:docked") === "1";
    } catch {
      return false;
    }
  });
  const [helpOpen, setHelpOpen] = useState(false);
  useHelpDialogHotkey(() => setHelpOpen((v) => !v));

  // While the library is docked + open, the canvas area shrinks
  // by the panel's width so the surface doesn't get covered. The
  // bars (TopBar / BottomBar) inherit the same inset so they stop
  // before the panel's edge.
  const DOCKED_PANEL_WIDTH = 240;
  const dockedInset = libraryOpen && libraryDocked ? DOCKED_PANEL_WIDTH : 0;

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onDragEnter={paletteDropHandlers.onDragEnter}
      onDragOver={paletteDropHandlers.onDragOver}
      onDragLeave={paletteDropHandlers.onDragLeave}
      onDrop={paletteDropHandlers.onDrop}
    >
      {/* Canvas area — shrinks horizontally when the library
          panel is docked so the surface + bars stop before its
          edge. `right` inset is used because LibraryPanel
          defaults to side="right". */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: dockedInset,
        }}
      >
        <DiagramSurface style={{ position: "absolute", inset: 0 }} />
        <TextEditorOverlay />
        {!hideContextMenu && <ContextMenu items={DEFAULT_CONTEXT_MENU} />}
      </div>

      {/* Docked library — static column on the right of the
          canvas area. Hidden when the panel is not docked OR
          not open; in that case the standard overlay copy below
          renders inside the UI layer. */}
      {libraryOpen && libraryDocked ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: DOCKED_PANEL_WIDTH,
            borderLeft: "1px solid var(--du-ui-border)",
            background: "var(--du-ui-bg-solid)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <LibraryPanel
            open
            docked
            onDockedChange={(d) => setLibraryDocked(d)}
            onClose={() => setLibraryOpen(false)}
            {...(onImportTemplates ? { onImport: onImportTemplates } : {})}
          />
        </div>
      ) : null}

      {/* UI layer — top/bottom bars + overlay panels. Stops at
          the docked-panel edge so floating chrome doesn't slide
          underneath the dock. */}
      <UILayer style={{ right: dockedInset }}>
        {!hideTopBar && (
          <TopBar
            left={
              <ButtonGroup ariaLabel="Logo and main menu">
                <span
                  aria-label="Diagram"
                  title="Diagram"
                  className="du-icon-button"
                  style={{
                    minWidth: 36,
                    padding: "0 10px",
                    cursor: "default",
                    fontWeight: 600,
                    letterSpacing: 0.5,
                  }}
                >
                  ⌗
                </span>
                {!hideMainMenu && (
                  <MainMenu>
                    <MainMenu.Group title="File">
                      <MainMenu.Item
                        icon={<FileUp {...menuIcon} />}
                        onClick={() => openSceneFile(editor)}
                      >
                        Open…
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<FileDown {...menuIcon} />}
                        onClick={() => editor && downloadScene(editor.scene)}
                        disabled={!editor}
                      >
                        Save as JSON
                      </MainMenu.Item>
                      <MainMenu.Submenu
                        icon={<Download {...menuIcon} />}
                        label="Export…"
                        disabled={!editor}
                      >
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() => editor && void downloadPng(editor, "transparent")}
                          disabled={!editor}
                        >
                          PNG (transparent)
                        </MainMenu.Item>
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() => editor && void downloadPng(editor, "color")}
                          disabled={!editor}
                        >
                          PNG (with background)
                        </MainMenu.Item>
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() => editor && void downloadPng(editor, "color-and-grid")}
                          disabled={!editor}
                        >
                          PNG (with background + grid)
                        </MainMenu.Item>
                        <MainMenu.Separator />
                        <MainMenu.Item
                          icon={<Download {...menuIcon} />}
                          onClick={() => editor && downloadSvg(editor.scene)}
                          disabled={!editor}
                        >
                          SVG
                        </MainMenu.Item>
                      </MainMenu.Submenu>
                      <MainMenu.Item
                        icon={<RotateCcw {...menuIcon} />}
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
                        icon={<Undo2 {...menuIcon} />}
                        shortcut="⌘Z"
                        onClick={() => editor?.undo()}
                        disabled={!editor}
                      >
                        Undo
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Redo2 {...menuIcon} />}
                        shortcut="⇧⌘Z"
                        onClick={() => editor?.redo()}
                        disabled={!editor}
                      >
                        Redo
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Scissors {...menuIcon} />}
                        shortcut="⌘X"
                        onClick={() => editor?.cutSelected()}
                        disabled={!editor}
                      >
                        Cut
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Copy {...menuIcon} />}
                        shortcut="⌘C"
                        onClick={() => editor?.copySelected()}
                        disabled={!editor}
                      >
                        Copy
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Clipboard {...menuIcon} />}
                        shortcut="⌘V"
                        onClick={() => editor?.paste()}
                        disabled={!editor}
                      >
                        Paste
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<MousePointer {...menuIcon} />}
                        shortcut="⌘A"
                        onClick={() => editor?.selectAll()}
                        disabled={!editor}
                      >
                        Select all
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Delete {...menuIcon} />}
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
                        icon={<Maximize {...menuIcon} />}
                        shortcut="⇧F"
                        onClick={() => editor?.zoomToFit()}
                        disabled={!editor}
                      >
                        Fit to screen
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<ZoomIn {...menuIcon} />}
                        shortcut="⌘+"
                        onClick={() => editor?.zoomIn()}
                        disabled={!editor}
                      >
                        Zoom in
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<ZoomOut {...menuIcon} />}
                        shortcut="⌘−"
                        onClick={() => editor?.zoomOut()}
                        disabled={!editor}
                      >
                        Zoom out
                      </MainMenu.Item>
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="Theme">
                      <MainMenu.Toggle<DiagramTheme>
                        value={theme}
                        onChange={changeTheme}
                        options={[
                          { value: "light", label: "Light", icon: <Sun {...toggleIcon} /> },
                          { value: "dark", label: "Dark", icon: <Moon {...toggleIcon} /> },
                          { value: "system", label: "System", icon: <Monitor {...toggleIcon} /> },
                        ]}
                      />
                    </MainMenu.Group>
                    <MainMenu.Group title="Grid">
                      <MainMenu.Toggle<"lines" | "dots" | "off">
                        value={gridSelection(editor)}
                        onChange={(next) => applyGridSelection(editor, next)}
                        options={[
                          { value: "lines", label: "Lines", icon: <Grid3x3 {...toggleIcon} /> },
                          { value: "dots", label: "Dots", icon: <Grip {...toggleIcon} /> },
                          { value: "off", label: "Off", icon: <Minus {...toggleIcon} /> },
                        ]}
                      />
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="Help">
                      <MainMenu.Item
                        icon={<HelpCircle {...menuIcon} />}
                        shortcut="?"
                        onClick={() => setHelpOpen(true)}
                      >
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
              </ButtonGroup>
            }
            center={
              !hideToolbar
                ? renderTopBarCenter
                  ? renderTopBarCenter()
                  : <Toolbar items={DEFAULT_TOOLBAR} />
                : renderTopBarCenter?.()
            }
            right={
              <ButtonGroup ariaLabel="Top bar actions">
                {renderTopBarRight ? renderTopBarRight() : null}
                {!hideLibraryButton && (
                  <IconButton
                    label="Library"
                    active={libraryOpen}
                    onClick={() => setLibraryOpen((v) => !v)}
                  >
                    <LibraryIcon {...buttonIcon} />
                  </IconButton>
                )}
              </ButtonGroup>
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

        {/* Overlay copy — rendered only when NOT docked. The
            docked instance is hoisted out of the UI layer above
            so it can split the canvas column. */}
        {!libraryDocked ? (
          <LibraryPanel
            open={libraryOpen}
            docked={false}
            onDockedChange={(d) => setLibraryDocked(d)}
            onClose={() => setLibraryOpen(false)}
            {...(onImportTemplates ? { onImport: onImportTemplates } : {})}
          />
        ) : null}

      </UILayer>

      {/* Floating selection panel — portal to body, positions itself
          above the selection bbox via @floating-ui. Rendered OUTSIDE
          UILayer because it portals to document.body anyway and
          UILayer's pointer-events:none on the wrapper would
          interfere with its children's auto handling. */}
      {!hideSelectionPanel && <SelectionFloatingPanel />}

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
        <Minus {...buttonIcon} />
      </IconButton>
      <button
        type="button"
        className="du-icon-button"
        aria-label="Reset zoom to 100%"
        title="Reset zoom to 100%"
        onClick={() => editor.resetZoom()}
        style={{
          minWidth: 56,
          padding: "0 8px",
          borderRadius: 0,
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in" onClick={() => editor.zoomIn()}>
        <Plus {...buttonIcon} />
      </IconButton>
      <IconButton label="Fit to screen" onClick={() => editor.zoomToFit()}>
        <Maximize {...buttonIcon} />
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
 * "Export as PNG" — renders the **full scene** (not just the visible
 * viewport) into an OffscreenCanvas via the standard `renderScene` +
 * `renderEdges` pipeline and downloads the result. Three variants
 * exposed in the menu:
 *
 *   • transparent      — PNG with alpha channel preserved
 *   • color            — solid background fill (host canvas colour)
 *   • color-and-grid   — solid fill + same grid the user sees
 *
 * Scale fixed at 2× for retina-quality output (matches the standard /
 * standard default). The full-scene contract makes this symmetric with
 * SVG export, which always emits the whole scene.
 *
 * Implementation lives in `./png-export.ts` so this file stays
 * focused on UI wiring.
 */
const PNG_EXPORT_SCALE = 2;

const downloadPng = async (
  editor: Editor,
  background: PngExportBackground,
): Promise<void> => {
  const backgroundColor = readCanvasBackgroundColor();
  const blob = await exportSceneToPng(editor.scene, {
    background,
    scale: PNG_EXPORT_SCALE,
    backgroundColor,
  });
  if (!blob) {
    // Empty scene — convertToBlob unavailable or no shapes to export.
    window.alert("Nothing to export — the canvas is empty.");
    return;
  }
  downloadBlob(blob, "scene.png");
};

/**
 * Read the host's current `--du-canvas-bg` CSS variable. Falls back
 * to white if the variable isn't set (e.g. host hasn't loaded the
 * react-ui stylesheet). Matches what the user sees behind the
 * shapes on the live canvas.
 */
const readCanvasBackgroundColor = (): string => {
  const probe = document.querySelector('canvas[data-layer="main"]') ?? document.body;
  const value = getComputedStyle(probe as Element).getPropertyValue("--du-canvas-bg").trim();
  return value || "#ffffff";
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

// --- Grid toggle helpers ----------------------------------------------------

const DEFAULT_GRID_SIZE = 20;

/**
 * Map the current viewport state to the segmented Grid toggle's
 * value. `"off"` when the user hid the grid (gridSize 0 / unset);
 * otherwise the stored gridStyle (default `"lines"`).
 */
const gridSelection = (editor: Editor | null): "lines" | "dots" | "off" => {
  if (!editor) return "lines";
  const vp = editor.scene.viewport;
  if (!vp.gridSize || vp.gridSize <= 0) return "off";
  return (vp.gridStyle ?? "lines") as "lines" | "dots";
};

/**
 * Inverse — translate the toggle's value back into a `setGrid`
 * call. Switching from "off" to lines/dots restores the default
 * grid size so the user doesn't have to also re-enter it
 * separately.
 */
const applyGridSelection = (
  editor: Editor | null,
  next: "lines" | "dots" | "off",
): void => {
  if (!editor) return;
  if (next === "off") {
    editor.setGrid({ size: 0 });
    return;
  }
  const vp = editor.scene.viewport;
  const size = vp.gridSize && vp.gridSize > 0 ? vp.gridSize : DEFAULT_GRID_SIZE;
  editor.setGrid({ size, style: next as GridStyle });
};
