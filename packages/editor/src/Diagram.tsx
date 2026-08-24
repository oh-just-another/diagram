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
  type RefObject,
} from "react";
import {
  Ban,
  Clipboard,
  Command,
  Copy,
  Delete,
  Download,
  Expand,
  Eye,
  FileDown,
  FileUp,
  Grid3x3,
  Grip,
  ImageDown,
  Keyboard,
  LayoutDashboard,
  Magnet,
  Map as MapIcon,
  Maximize,
  Minus,
  Monitor,
  Moon,
  Mouse,
  MousePointer,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Scissors,
  Search,
  Shrink,
  SlidersHorizontal,
  Sun,
  Undo2,
  ZoomIn,
} from "lucide-react";
import {
  BottomBar,
  BottomSheet,
  ButtonGroup,
  ContextMenu,
  DEFAULT_CONTEXT_MENU,
  DEFAULT_VERTICAL_TOOLBAR,
  type ToolbarItem,
  DiagramRoot,
  CommandPalette,
  DiagramSurface,
  HelpButton,
  HelpDialog,
  IconButton,
  DrawingPanel,
  LibraryPanel,
  MainMenu,
  Minimap,
  ResetToContentButton,
  LinkHoverPopup,
  LinkBadges,
  StickyReactions,
  LinkDropShapeMenu,
  LinkCaptionEditor,
  SelectionFloatingPanel,
  SearchOverlay,
  StatsPanel,
  TextEditorOverlay,
  FrameNameEditorOverlay,
  PortalContainerProvider,
  ToastHost,
  Toolbar,
  TooltipProvider,
  TopBar,
  UILayer,
  ZenModeProvider,
  useDiagramOptional,
  useHelpDialogHotkey,
  useMobileLayout,
  usePalettePlacement,
  useEditorSelector,
  useFullscreen,
  useZenMode,
  CONTROL_ICON,
  ROW_ICON,
} from "@oh-just-another/react-ui";
import { BrandLogo } from "./brand/brand-logo.js";

/**
 * Lucide icon sizing — `MENU_ICON_SIZE` is for in-row icons of
 * `MainMenu.Item`, `BUTTON_ICON_SIZE` is for `IconButton` slot
 * children (library, zoom, fit). All share `BUTTON_ICON_STROKE`
 * for visual consistency with the toolbar.
 */
const menuIcon = ROW_ICON;
const buttonIcon = CONTROL_ICON;

/** Default target for the Help-menu "GitHub" link (overridable / hideable via the `repositoryUrl` prop). */
const DEFAULT_REPOSITORY_URL = "https://github.com/oh-just-another/diagram";
import type { ActiveTool, Editor, FileDropHandler, Mode, WheelMode } from "@oh-just-another/state";
import { defaultActionRegistry } from "@oh-just-another/state";
import {
  DEFAULT_PREFERENCES_STORAGE_KEY,
  bindPreferencesPersistence,
} from "./preferences-storage.js";
import type { ElementId } from "@oh-just-another/types";
import { formatHotkey } from "@oh-just-another/state";
import {
  hydrateScene,
  isText,
  type Scene,
  type SceneSettings,
  type GridStyle,
} from "@oh-just-another/scene";
import type { Rasterizer, TextShaper } from "@oh-just-another/renderer-core";
import { WasmTextShaper } from "@oh-just-another/text-wasm";
import { WasmRasterizer } from "@oh-just-another/raster-wasm";
import { registerBundledFonts } from "@oh-just-another/fonts";
import { createRenderWorker } from "@oh-just-another/renderer-canvas";
import {
  registerAnimationAdapter,
  setActiveRasterizer,
  setActiveTextShaper,
  type AnimatedSourceAdapter,
} from "@oh-just-another/renderer-core";
import { registerLayoutKind, type LayoutKindEntry } from "@oh-just-another/scene";
import { type Template, defaultRegistry } from "@oh-just-another/templates";
import {
  detectCapabilities,
  logCapabilities,
  type CapabilityOverrides,
  type CapabilityProfile,
} from "./capabilities";
import { installGifAnimationAdapter } from "./gif-animation.js";
import { useThemedPortalContainer } from "./themed-portal-container.js";
import {
  downloadScene,
  downloadSvg,
  downloadPng,
  openSceneFile,
  copySceneAsImage,
  registerFileActions,
  setFileActionNotifier,
  type ExportContent,
} from "./file-actions.js";
import { isEditableTarget } from "./dom-focus";

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
 *   │  │ Panel│   <canvas>       │  Element   │  │
 *   │  │      │                  │  Actions │  │
 *   │  └──────┘                  └──────────┘  │
 *   │ [Zoom] [Fit] [Reset]            [Help]   │  ← BottomBar
 *   └──────────────────────────────────────────┘
 *
 * Hosts hide individual bits via boolean props or replace whole
 * slots through `renderTopBar*` / `renderBottomBar*` props.
 */
export interface DiagramAPI {
  /**
   * The live editor engine (`EditorInstance` from `@oh-just-another/state`) —
   * the full power-user escape hatch beyond the curated verbs below. `null`
   * until the editor has mounted (i.e. until `onReady` fires).
   */
  readonly editor: Editor | null;
  /** Resolved renderer / WASM / worker profile, or `null` before detection settles. */
  readonly capabilities: CapabilityProfile | null;
  // --- Scene ---
  readonly getScene: () => Scene;
  readonly loadScene: (scene: Scene) => void;
  // --- Tool ---
  readonly getActiveTool: () => ActiveTool | null;
  readonly setActiveTool: (tool: Mode) => void;
  // --- Selection ---
  readonly getSelection: () => ReadonlySet<ElementId>;
  readonly setSelection: (ids: Iterable<ElementId>) => void;
  // --- History ---
  readonly undo: () => void;
  readonly redo: () => void;
  // --- Viewport ---
  readonly zoomToFit: () => void;
}

export interface DiagramProps {
  // --- Data ---
  readonly initialScene?: Scene;
  readonly initialTool?: Mode;

  // --- Scene settings ---
  // Granular initial scene settings, merged over the defaults. A persisted
  // `initialScene` takes precedence over these (user data wins over config).
  /** Background grid: whether it is shown and how it is painted. */
  readonly grid?: { readonly enabled?: boolean; readonly style?: GridStyle };
  /** Snap-to-grid preference (independent of grid visibility). */
  readonly snap?: boolean;

  // --- Plugins ---
  readonly templates?: readonly Template[];
  readonly fileDropHandlers?: readonly FileDropHandler[];
  readonly layoutKinds?: readonly LayoutKindEntry[];
  readonly animationAdapters?: readonly AnimatedSourceAdapter[];

  // --- Callbacks ---
  readonly onReady?: (editor: Editor) => void;
  readonly onSceneChange?: (scene: Scene) => void;
  readonly onSelectionChange?: (ids: ReadonlySet<ElementId>) => void;

  // --- Capabilities ---
  readonly capabilities?: CapabilityOverrides;
  /**
   * Override how the offscreen-canvas render worker is constructed.
   * Only used when the resolved renderer backend is `"offscreen"`.
   * Defaults to the worker shipped with `@oh-just-another/renderer-canvas`.
   * Supply your own when a non-Vite bundler needs a custom worker URL.
   */
  readonly workerFactory?: () => Worker;

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
  /**
   * Hide the drawing / eraser tool-options panel (line colour, fill, opacity,
   * width) that otherwise floats top-right while the brush or eraser is active.
   */
  readonly hideDrawingPanel?: boolean;
  /**
   * Show the built-in minimap at startup: a scene overview + viewport rect, docked
   * bottom-right above the zoom controls. Click / drag it to pan. Hidden in
   * zen mode along with the rest of the chrome. Off by default.
   */
  readonly minimap?: boolean;

  // --- Slots ---
  /**
   * Brand cell at the start of the top bar. Defaults to the built-in
   * `BrandLogo` (light / dark artwork from `assets/logo*.svg`); pass a node
   * to replace it, or `null` to drop the cell.
   */
  readonly logo?: ReactNode;
  readonly renderTopBarLeft?: () => ReactNode;
  readonly renderTopBarCenter?: () => ReactNode;
  readonly renderTopBarRight?: () => ReactNode;
  readonly renderBottomBarLeft?: () => ReactNode;
  readonly renderBottomBarCenter?: () => ReactNode;
  readonly renderBottomBarRight?: () => ReactNode;
  /** Extra rows appended to the main menu's top level (after a separator). */
  readonly renderMainMenuExtras?: () => ReactNode;
  /** Extra rows inside the main menu's Board › submenu, right after Export (e.g. import / export formats). */
  readonly renderBoardMenuExtras?: () => ReactNode;
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
  /**
   * Persist the per-user editor preferences (`EditorPreferences`: object
   * snapping, size readouts, wheel mode — the canvas menu's check rows) in
   * `localStorage`. Pass `true` for the default key `"diagram-preferences"`,
   * or a custom key string. Omit to keep them in memory for the session.
   */
  readonly persistPreferences?: boolean | string;

  // --- Branding ---
  /**
   * URL for the "GitHub" link in the Help menu. Omit to use the
   * project's repository; pass your own, or `null` to hide the link
   * entirely (e.g. when embedding the editor in another product).
   */
  readonly repositoryUrl?: string | null;

  // --- Dialogs ---
  /**
   * Confirm a destructive action (the "Reset canvas" menu item). Return
   * `true` to proceed. Defaults to `window.confirm`; override to route
   * through your own dialog when embedding.
   */
  readonly onConfirm?: (message: string) => boolean;
  /**
   * Surface a notification — a file that failed to parse, or an empty
   * scene on export. Defaults to `window.alert`; override to route through
   * your own toast / dialog.
   */
  readonly onNotify?: (message: string) => void;

  // --- Layout ---
  readonly className?: string;
  readonly style?: CSSProperties;
}

export type DiagramTheme = "dark" | "light" | "system";

export const Diagram = forwardRef<DiagramAPI, DiagramProps>(function Diagram(props, ref) {
  const {
    initialScene,
    initialTool = "select",
    grid,
    snap,
    templates,
    fileDropHandlers,
    layoutKinds,
    animationAdapters,
    onReady,
    onSceneChange,
    onSelectionChange,
    capabilities: capabilityOverrides,
    workerFactory,
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
    hideDrawingPanel,
    minimap,
    logo = <BrandLogo />,
    renderTopBarLeft,
    renderTopBarCenter,
    renderTopBarRight,
    renderBottomBarLeft,
    renderBottomBarCenter,
    renderBottomBarRight,
    renderMainMenuExtras,
    renderBoardMenuExtras,
    onImportTemplates,
    theme: themeProp,
    defaultTheme = "system",
    onThemeChange,
    persistTheme,
    persistPreferences,
    repositoryUrl,
    onConfirm,
    onNotify,
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
  // Floating UI portals here (a body-level wrapper that mirrors `theme`) so it
  // inherits the app theme instead of the OS `prefers-color-scheme` fallback.
  const portalContainer = useThemedPortalContainer(theme);
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

  // Seed scene: host grid/snap props are merged over the defaults; a persisted
  // `initialScene` (user data) wins over them. Depend on primitives so an
  // inline `grid` object prop doesn't re-seed the editor every render.
  const gridEnabled = grid?.enabled;
  const gridStyle = grid?.style;
  const seed = useMemo<Scene>(
    () =>
      hydrateScene({
        ...(initialScene ? { saved: initialScene } : {}),
        hostSettings: buildHostSettings(gridEnabled, gridStyle, snap),
      }),
    [initialScene, gridEnabled, gridStyle, snap],
  );
  // Does the initial scene contain any text? Drives whether first paint
  // waits for the MSDF shaper (see the mount gate below).
  const sceneHasText = useMemo(() => {
    for (const s of seed.elements.values()) if (isText(s)) return true;
    return false;
  }, [seed]);

  // --- Plugin registration ---
  useEffect(() => {
    // Built-in GIF decoder, registered by default so dropped / pasted GIFs play
    // out of the box. Idempotent + lazy (gifuct-js loads on first decode). A
    // host `animationAdapters` entry with kind "gif" overrides it (those are
    // registered after).
    installGifAnimationAdapter();
    if (templates) for (const t of templates) defaultRegistry.register(t);
    if (layoutKinds) for (const k of layoutKinds) registerLayoutKind(k);
    if (animationAdapters) for (const a of animationAdapters) registerAnimationAdapter(a);
  }, [templates, layoutKinds, animationAdapters]);

  // --- Capabilities + WASM async load ---
  const [profile, setProfile] = useState<CapabilityProfile | null>(null);
  const [wasmShaper, setWasmShaper] = useState<TextShaper | null>(null);
  const [wasmRaster, setWasmRaster] = useState<Rasterizer | null>(null);
  // True once the MSDF text-shaper load has SETTLED (loaded or failed).
  // Used to hold the first paint of a text-bearing scene until the real
  // font is ready, so text doesn't render in a fallback font and then
  // snap to the WASM font ("jump" on load — a FOUT).
  const [wasmTextSettled, setWasmTextSettled] = useState(false);
  // Flipped once the bundled web fonts finish loading, so the canvas can
  // redraw text in them (the browser doesn't auto-repaint canvas text).
  const [fontsReady, setFontsReady] = useState(false);
  const detectionRef = useRef<Promise<CapabilityProfile> | null>(null);
  const loggedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      detectionRef.current ??= detectCapabilities(capabilityOverrides);
      const detected = await detectionRef.current;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `cancelled` is mutated by the cleanup closure; CFA inside the IIFE can't see it
      if (cancelled) return;
      if (!loggedRef.current) {
        loggedRef.current = true;
        logCapabilities(detected);
      }
      setProfile(detected);
      const loads: Promise<unknown>[] = [];
      // Load the bundled fonts so every backend draws the same faces; redraw
      // once they settle.
      loads.push(
        registerBundledFonts(document).then(
          () => {
            if (!cancelled) setFontsReady(true);
          },
          (err: unknown) => {
            // Settle even on failure so a text scene still mounts (in the
            // fallback font) instead of hanging on the first-paint gate.
            if (!cancelled) setFontsReady(true);
            console.warn("[diagram] bundled fonts load failed", err);
          },
        ),
      );
      if (detected.wasmText) {
        loads.push(
          WasmTextShaper.loadBundled().then(
            (shaper) => {
              if (cancelled) return;
              setActiveTextShaper(shaper);
              setWasmShaper(shaper);
              setWasmTextSettled(true);
            },
            (err: unknown) => {
              if (cancelled) return;
              // Settle even on failure so a text-bearing scene still
              // mounts (with the fallback font) instead of hanging.
              setWasmTextSettled(true);

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
            (err: unknown) => {
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

  // Minimap visibility: the `minimap` prop seeds it; the zoom menu's
  // "Hide / Show minimap" row and the `M` key toggle it at runtime.
  const [minimapVisible, setMinimapVisible] = useState(minimap === true);
  useEffect(() => {
    setMinimapVisible(minimap === true);
  }, [minimap]);
  const toggleMinimap = useCallback(() => {
    setMinimapVisible((v) => !v);
  }, []);
  // Fullscreen target: the editor root (chrome + canvas), see the zoom menu.
  const rootRef = useRef<HTMLDivElement>(null);

  // Per-user preferences: load once the editor exists, then mirror changes.
  const preferencesKey = useMemo(() => {
    if (persistPreferences === true) return DEFAULT_PREFERENCES_STORAGE_KEY;
    if (typeof persistPreferences === "string") return persistPreferences;
    return null;
  }, [persistPreferences]);
  useEffect(() => {
    if (!editor || !preferencesKey) return undefined;
    return bindPreferencesPersistence(editor, preferencesKey);
  }, [editor, preferencesKey]);

  useEffect(() => {
    if (!editor) return undefined;
    if (!wasmShaper && !wasmRaster) return undefined;
    editor.setActiveTool(editor.activeTool.type);
    return undefined;
  }, [editor, wasmShaper, wasmRaster]);

  // Animation adapters (GIF decoder) are registered in the plugin effect above,
  // which runs AFTER the editor's first paint (child effects fire before parent
  // ones). Force one render once the editor is ready so each animated shape's
  // first `getFrameAt` runs — that kicks off the async decode, after which the
  // decode→re-render nudge (`onAnimationContentReady`) paints the frame. The
  // built-in GIF adapter is always registered, so this nudge is unconditional
  // (also re-runs if a host swaps `animationAdapters`). Without it, a paused GIF
  // restored from storage never even starts decoding and stays blank.
  useEffect(() => {
    if (editor) editor.forceRender();
  }, [editor, animationAdapters]);

  // Redraw once the bundled fonts load so canvas text switches from the
  // fallback face to the bundled one.
  useEffect(() => {
    if (editor && fontsReady) editor.forceRender();
  }, [editor, fontsReady]);

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

  // Track transform modifiers off every key event (and reset on blur) so a
  // missed keyup can't leave a flag stuck: Cmd/Ctrl pulls a shape off the grid
  // for one drag; Alt resizes about the centre; Shift locks the resize aspect
  // ratio or constrains a move to one axis.
  useEffect(() => {
    if (!editor) return undefined;
    const ed = editor;
    const sync = (e: KeyboardEvent) => {
      // Don't track modifiers (or touch snap state) while typing in a field —
      // keep the editor's transform flags inert there.
      if (isEditableTarget(e.target)) return;
      ed.setSnapSuppressed(e.metaKey || e.ctrlKey);
      ed.setTransformModifiers({ alt: e.altKey, shift: e.shiftKey });
    };
    // Flowchart CREATE lifecycle: Cmd/Ctrl+Arrow grows a pending preview; the
    // session commits when Cmd/Ctrl is released and cancels on Escape. Keydown
    // handles the cancel; keyup the commit.
    const onKeyDown = (e: KeyboardEvent) => {
      sync(e);
      if (isEditableTarget(e.target)) return;
      if (e.key === "Escape" && ed.flowchartPreview !== null) {
        ed.cancelFlowchart();
        e.preventDefault();
      }
      // `M` — toggle the minimap (zoom menu parity).
      if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        toggleMinimap();
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      sync(e);
      // Cmd/Ctrl released while a session is open → commit the preview.
      if (!e.metaKey && !e.ctrlKey && ed.flowchartPreview !== null) {
        ed.commitFlowchart();
      }
    };
    const reset = () => {
      ed.setSnapSuppressed(false);
      ed.setTransformModifiers({ alt: false, shift: false });
      // A window blur can swallow the Cmd/Ctrl keyup — commit any live session
      // so a missed keyup can't strand the preview.
      if (ed.flowchartPreview !== null) ed.commitFlowchart();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", reset);
      ed.setSnapSuppressed(false);
      ed.setTransformModifiers({ alt: false, shift: false });
    };
  }, [editor, toggleMinimap]);

  useImperativeHandle<DiagramAPI, DiagramAPI>(
    ref,
    () => ({
      editor,
      capabilities: profile,
      getScene: () => editor?.scene ?? seed,
      loadScene: (scene) => editor?.loadScene(scene),
      getActiveTool: () => editor?.activeTool ?? null,
      setActiveTool: (tool) => editor?.setActiveTool(tool),
      getSelection: () => editor?.selection ?? new Set<ElementId>(),
      setSelection: (ids) => editor?.setSelection(ids),
      undo: () => {
        editor?.undo();
      },
      redo: () => {
        editor?.redo();
      },
      zoomToFit: () => {
        editor?.zoomToFit();
      },
    }),
    [editor, seed, profile],
  );

  if (!profile) {
    return <div className={className} style={style} />;
  }
  // Hold the first paint of a text-bearing scene until its font is ready, so
  // text renders in its final face from frame one (no fallback-font jump).
  // Every backend now draws the bundled fonts, so all wait on `fontsReady`;
  // the WebGL2 MSDF path also waits on the shaper. Text-free scenes mount
  // immediately and don't pay the load latency.
  if (sceneHasText && !fontsReady) {
    return <div className={className} style={style} />;
  }
  if (profile.renderer === "webgl2" && profile.wasmText && !wasmTextSettled && sceneHasText) {
    return <div className={className} style={style} />;
  }

  return (
    <PortalContainerProvider container={portalContainer}>
      <ToastHost>
        <TooltipProvider>
          <div
            ref={rootRef}
            className={className}
            data-diagram-root
            // Theme is scoped to this editor root (not the global <html>), so
            // multiple editors can theme independently and the host document is
            // left untouched. "system" omits the attribute, falling through to
            // the stylesheet's `prefers-color-scheme` / `:root` defaults.
            {...(theme === "system" ? {} : { "data-theme": theme })}
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
              initialTool={initialTool}
              onReady={handleReady}
              renderer={profile.renderer}
              {...(profile.renderer === "offscreen"
                ? { workerFactory: workerFactory ?? createRenderWorker }
                : {})}
              {...(wasmShaper ? { textShaper: wasmShaper } : {})}
              {...(wasmRaster ? { rasterizer: wasmRaster } : {})}
            >
              <ZenModeProvider>
                <EditorShell
                  hideTopBar={hideTopBar}
                  hideBottomBar={hideBottomBar}
                  hideToolbar={hideToolbar}
                  hideLibraryButton={hideLibraryButton}
                  hideMainMenu={hideMainMenu}
                  logo={logo}
                  hideZoomControls={hideZoomControls}
                  hideResetToContent={hideResetToContent}
                  hideHelpButton={hideHelpButton}
                  hideContextMenu={hideContextMenu}
                  hideSelectionPanel={hideSelectionPanel}
                  hideDrawingPanel={hideDrawingPanel}
                  minimapVisible={minimapVisible}
                  onToggleMinimap={toggleMinimap}
                  rootRef={rootRef}
                  renderTopBarLeft={renderTopBarLeft}
                  renderTopBarCenter={renderTopBarCenter}
                  renderTopBarRight={renderTopBarRight}
                  renderBottomBarLeft={renderBottomBarLeft}
                  renderBottomBarCenter={renderBottomBarCenter}
                  renderBottomBarRight={renderBottomBarRight}
                  renderMainMenuExtras={renderMainMenuExtras}
                  renderBoardMenuExtras={renderBoardMenuExtras}
                  onImportTemplates={onImportTemplates}
                  repositoryUrl={repositoryUrl}
                  onConfirm={onConfirm}
                  onNotify={onNotify}
                  theme={theme}
                  changeTheme={changeTheme}
                />
              </ZenModeProvider>
            </DiagramRoot>
          </div>
        </TooltipProvider>
      </ToastHost>
    </PortalContainerProvider>
  );
});

// Match the primary public name (`<Editor>`) in DevTools / stack traces,
// even though the internal forwardRef function is named `Diagram`.
Diagram.displayName = "Editor";

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
  logo,
  hideZoomControls,
  hideResetToContent,
  hideHelpButton,
  hideContextMenu,
  hideSelectionPanel,
  hideDrawingPanel,
  minimapVisible,
  onToggleMinimap,
  rootRef,
  renderTopBarLeft,
  renderTopBarCenter,
  renderTopBarRight,
  renderBottomBarLeft,
  renderBottomBarCenter,
  renderBottomBarRight,
  renderMainMenuExtras,
  renderBoardMenuExtras,
  onImportTemplates,
  repositoryUrl,
  onConfirm,
  onNotify,
  theme,
  changeTheme,
}: {
  readonly hideTopBar: boolean | undefined;
  readonly hideBottomBar: boolean | undefined;
  readonly hideToolbar: boolean | undefined;
  readonly hideLibraryButton: boolean | undefined;
  readonly hideMainMenu: boolean | undefined;
  readonly logo: ReactNode;
  readonly hideZoomControls: boolean | undefined;
  readonly hideResetToContent: boolean | undefined;
  readonly hideHelpButton: boolean | undefined;
  readonly hideContextMenu: boolean | undefined;
  readonly hideSelectionPanel: boolean | undefined;
  readonly hideDrawingPanel: boolean | undefined;
  readonly minimapVisible: boolean;
  readonly onToggleMinimap: () => void;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly renderTopBarLeft: (() => ReactNode) | undefined;
  readonly renderTopBarCenter: (() => ReactNode) | undefined;
  readonly renderTopBarRight: (() => ReactNode) | undefined;
  readonly renderBottomBarLeft: (() => ReactNode) | undefined;
  readonly renderBottomBarCenter: (() => ReactNode) | undefined;
  readonly renderBottomBarRight: (() => ReactNode) | undefined;
  readonly renderMainMenuExtras: (() => ReactNode) | undefined;
  readonly renderBoardMenuExtras: (() => ReactNode) | undefined;
  readonly onImportTemplates: (() => void) | undefined;
  readonly repositoryUrl: string | null | undefined;
  readonly onConfirm: ((message: string) => boolean) | undefined;
  readonly onNotify: ((message: string) => void) | undefined;
  readonly theme: DiagramTheme;
  readonly changeTheme: (next: DiagramTheme) => void;
}) => {
  const editor = useDiagramOptional();
  // Zen mode (⌥Z): hide every chrome surface for focused work, leaving the
  // canvas + the observational overlays (search, stats, command palette).
  const { zen } = useZenMode();
  const fullscreen = useFullscreen(rootRef);
  // Omitted → project repo; explicit string → that URL; null → no link.
  const repositoryHref = repositoryUrl === undefined ? DEFAULT_REPOSITORY_URL : repositoryUrl;
  // Native dialogs by default; hosts can route through their own UI.
  const confirmDialog = onConfirm ?? ((message: string) => window.confirm(message));
  const notify =
    onNotify ??
    ((message: string) => {
      window.alert(message);
    });
  // Register the file-ops actions (Save / Open / Export / Copy-as-image)
  // on the shared registry so hosts binding hotkeys / the command palette
  // pick them up, and route their error messages through this shell's
  // notifier (host toast or the alert fallback above).
  useEffect(() => {
    registerFileActions();
    setFileActionNotifier(notify);
  }, [notify]);
  // Subscribe ONLY to the Grid / Snap toggle VALUES, not the scene
  // identity: the scene reference flips on every frame of a drag, and a
  // whole-shell re-render (menus, toolbars, HelpDialog) per frame makes
  // moving elements visibly sluggish. The selectors return primitives,
  // so `Object.is` skips re-renders until a toggle actually changes.
  useEditorSelector((e) => gridSelection(e), "lines", "scene");
  useEditorSelector((e) => snapSelection(e), "on");
  // Preference switches in the View / Preferences submenus.
  const showObjectSize = useEditorSelector((e) => e.preferences.showObjectSize, true);
  const snapObjects = useEditorSelector((e) => e.preferences.snapObjects, true);
  const suggestObjectSize = useEditorSelector((e) => e.preferences.suggestObjectSize, true);
  const wheelMode = useEditorSelector((e) => e.preferences.wheelMode, "auto");
  const paletteDropHandlers = usePalettePlacement();
  // Touch / narrow screens: the library opens as a bottom sheet instead of
  // a left overlay (which would cover the whole small canvas).
  const mobile = useMobileLayout();
  // The templates library is a floating overlay opened via the toolbar
  // toggle and closed via its ✕. Starts closed; no dock / pin.
  const [libraryOpen, setLibraryOpen] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Export content switches (sticky reactions / tags / author) — session
  // state seeded by EXPORT_CONTENT_DEFAULTS inside the export helpers;
  // the Export… submenu checkboxes flip them per run.
  const [exportContent, setExportContent] = useState<ExportContent>({});
  const toggleExportContent = (key: "stickyReactions" | "stickyTags" | "stickyAuthor"): void => {
    setExportContent((cur) => ({ ...cur, [key]: !(cur?.[key] ?? true) }));
  };
  useHelpDialogHotkey(() => {
    setHelpOpen((v) => !v);
  });

  // Layout (left → right): templates library overlay at the window
  // edge, then the floating vertical creation toolbar, then the canvas.
  // The library overlays the canvas (no reflow); the toolbar floats just
  // to its right when open, else near the edge. On mobile the library is a
  // bottom sheet, so the toolbar never shifts.
  // Dock inset from the edge, or past the open library (its inset + width)
  // with a flyout gap — all CSS tokens so hosts retune them in one place.
  const toolbarLeft =
    !mobile && libraryOpen
      ? "var(--du-bar-inset) + var(--du-side-panel-w) + var(--du-flyout-gap)"
      : "var(--du-dock-inset)";

  // Items for the vertical creation dock: an optional templates-library
  // toggle on top (hidden with `hideLibraryButton`), then the standard
  // creation tools.
  // The template library's only toolbar entry point is the "More shapes"
  // row inside the Shapes and lines flyout (`hideLibraryButton` removes
  // it). No standalone library toggle in the dock.
  const toolbarItems = useMemo<ToolbarItem[]>(
    () =>
      DEFAULT_VERTICAL_TOOLBAR.map<ToolbarItem>((item) =>
        item.kind === "shapes-flyout" && !hideLibraryButton
          ? {
              ...item,
              onMoreShapes: () => {
                setLibraryOpen(true);
              },
            }
          : item,
      ),
    [hideLibraryButton],
  );

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onDragEnter={paletteDropHandlers.onDragEnter}
      onDragOver={paletteDropHandlers.onDragOver}
      onDragLeave={paletteDropHandlers.onDragLeave}
      onDrop={paletteDropHandlers.onDrop}
    >
      {/* Canvas area — full width; the library is a floating overlay
          that doesn't reflow the canvas. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        }}
      >
        <DiagramSurface style={{ position: "absolute", inset: 0 }} />
        <TextEditorOverlay />
        <FrameNameEditorOverlay />
        <LinkHoverPopup />
        <LinkBadges />
        <StickyReactions />
        <LinkDropShapeMenu />
        <LinkCaptionEditor />
        {!hideContextMenu && <ContextMenu items={DEFAULT_CONTEXT_MENU} />}
      </div>

      {/* Floating vertical creation toolbar — pinned to the far left,
          over the canvas. Rendered outside UILayer
          (whose wrapper is pointer-events:none) so its buttons stay
          interactive. */}
      {!hideToolbar && !zen ? (
        <div
          className="du-dock"
          style={{
            // Floats just to the right of the library when it's open (else
            // near the edge). `env(safe-area-inset-left)` is 0 on desktop,
            // clears the notch in mobile landscape.
            left: `calc(env(safe-area-inset-left, 0px) + ${toolbarLeft})`,
          }}
        >
          <Toolbar orientation="vertical" items={toolbarItems} />
        </div>
      ) : null}

      {/* UI layer — top/bottom bars + overlay panels (full width; the
          library overlays rather than reflows). */}
      <UILayer>
        {!hideTopBar && !zen && (
          <TopBar
            left={
              <ButtonGroup ariaLabel="Logo and main menu">
                {logo !== null && <span className="du-icon-button du-brand">{logo}</span>}
                {!hideMainMenu && (
                  <MainMenu>
                    {/* Board — the document: file in / out, export, start view. */}
                    <MainMenu.Submenu icon={<LayoutDashboard {...menuIcon} />} label="Board">
                      <MainMenu.Item
                        icon={<FileUp {...menuIcon} />}
                        onClick={() => {
                          if (editor) openSceneFile(editor);
                        }}
                        shortcut={formatHotkey({ key: "O", meta: true })}
                      >
                        Open…
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<FileDown {...menuIcon} />}
                        onClick={() => {
                          if (editor) downloadScene(editor.scene);
                        }}
                        disabled={!editor}
                        shortcut={formatHotkey({ key: "S", meta: true })}
                      >
                        Save as JSON
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Copy {...menuIcon} />}
                        onClick={() => {
                          if (editor) void copySceneAsImage(editor);
                        }}
                        disabled={!editor}
                        shortcut={formatHotkey({ key: "C", shift: true, alt: true })}
                      >
                        Copy as image
                      </MainMenu.Item>
                      <MainMenu.Submenu
                        icon={<Download {...menuIcon} />}
                        label="Export"
                        disabled={!editor}
                      >
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() =>
                            editor && void downloadPng(editor, "transparent", exportContent)
                          }
                          disabled={!editor}
                        >
                          PNG (transparent)
                        </MainMenu.Item>
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() => editor && void downloadPng(editor, "color", exportContent)}
                          disabled={!editor}
                          shortcut={formatHotkey({ key: "E", meta: true, shift: true })}
                        >
                          PNG (with background)
                        </MainMenu.Item>
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() =>
                            editor && void downloadPng(editor, "color-and-grid", exportContent)
                          }
                          disabled={!editor}
                        >
                          PNG (with background + grid)
                        </MainMenu.Item>
                        <MainMenu.Separator />
                        <MainMenu.Item
                          icon={<Download {...menuIcon} />}
                          onClick={() => {
                            if (editor) downloadSvg(editor.scene, exportContent);
                          }}
                          disabled={!editor}
                        >
                          SVG
                        </MainMenu.Item>
                        <MainMenu.Separator />
                        <MainMenu.Group title="Include in export">
                          <MainMenu.Item
                            keepOpen
                            onClick={() => {
                              toggleExportContent("stickyReactions");
                            }}
                            checked={exportContent?.stickyReactions !== false}
                          >
                            Sticky reactions
                          </MainMenu.Item>
                          <MainMenu.Item
                            keepOpen
                            onClick={() => {
                              toggleExportContent("stickyTags");
                            }}
                            checked={exportContent?.stickyTags !== false}
                          >
                            Sticky tags
                          </MainMenu.Item>
                          <MainMenu.Item
                            keepOpen
                            onClick={() => {
                              toggleExportContent("stickyAuthor");
                            }}
                            checked={exportContent?.stickyAuthor !== false}
                          >
                            Sticky author
                          </MainMenu.Item>
                        </MainMenu.Group>
                      </MainMenu.Submenu>
                      {renderBoardMenuExtras?.()}
                      <MainMenu.Separator />
                      <MainMenu.Item
                        icon={<MapIcon {...menuIcon} />}
                        onClick={() => editor?.goToStartView()}
                        disabled={(editor?.startView ?? null) === null}
                      >
                        Start view
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<MapIcon {...menuIcon} />}
                        onClick={() => editor?.setCurrentViewAsStart()}
                        disabled={!editor}
                      >
                        Set current view as start
                      </MainMenu.Item>
                      <MainMenu.Separator />
                      <MainMenu.Item
                        icon={<RotateCcw {...menuIcon} />}
                        onClick={() => {
                          if (!editor) return;
                          if (confirmDialog("Reset canvas? This clears all shapes.")) {
                            // editor.clear() keeps viewport (zoom /
                            // pan / gridEnabled) and layers — only
                            // shapes / edges go. loadScene(emptyScene())
                            // would also reset the grid because
                            // DEFAULT_VIEWPORT has it disabled.
                            editor.clear();
                          }
                        }}
                        disabled={!editor}
                      >
                        Reset canvas
                      </MainMenu.Item>
                    </MainMenu.Submenu>
                    {/* Edit — history, clipboard, selection, palettes. */}
                    <MainMenu.Submenu icon={<Pencil {...menuIcon} />} label="Edit">
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
                      <MainMenu.Separator />
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
                      <MainMenu.Separator />
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
                      <MainMenu.Separator />
                      <MainMenu.Item
                        icon={<Command {...menuIcon} />}
                        shortcut="⌘K"
                        onClick={() => {
                          if (editor) {
                            defaultActionRegistry.dispatch("open-command-palette", { editor });
                          }
                        }}
                        disabled={!editor}
                      >
                        Commands
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Search {...menuIcon} />}
                        shortcut="⌘F"
                        onClick={() => {
                          if (editor) defaultActionRegistry.dispatch("open-search", { editor });
                        }}
                        disabled={!editor}
                      >
                        Find
                      </MainMenu.Item>
                    </MainMenu.Submenu>
                    {/* View — what the canvas shows (grid, chrome, theme, fullscreen).
                        Zoom lives in the bottom-bar zoom menu, not here. */}
                    <MainMenu.Submenu icon={<Eye {...menuIcon} />} label="View">
                      <MainMenu.Submenu icon={<Grid3x3 {...menuIcon} />} label="Grid">
                        {GRID_OPTIONS.map((opt) => (
                          <MainMenu.Item
                            key={opt.value}
                            icon={opt.icon}
                            active={gridSelection(editor) === opt.value}
                            onClick={() => {
                              applyGridSelection(editor, opt.value);
                            }}
                          >
                            {opt.label}
                          </MainMenu.Item>
                        ))}
                        <MainMenu.Separator />
                        <MainMenu.Item
                          icon={<Magnet {...menuIcon} />}
                          keepOpen
                          onClick={() => editor?.setSnapToGrid(!editor.snapToGridEnabled)}
                          checked={snapSelection(editor) === "on"}
                        >
                          Snap to grid
                        </MainMenu.Item>
                      </MainMenu.Submenu>
                      <MainMenu.Item
                        icon={<Ruler {...menuIcon} />}
                        keepOpen
                        onClick={() => editor?.setPreferences({ showObjectSize: !showObjectSize })}
                        checked={showObjectSize}
                      >
                        Object dimensions
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<MapIcon {...menuIcon} />}
                        keepOpen
                        onClick={onToggleMinimap}
                        checked={minimapVisible}
                      >
                        Minimap
                      </MainMenu.Item>
                      <MainMenu.Separator />
                      <MainMenu.Submenu icon={<Sun {...menuIcon} />} label="Theme">
                        {THEME_OPTIONS.map((opt) => (
                          <MainMenu.Item
                            key={opt.value}
                            icon={opt.icon}
                            active={theme === opt.value}
                            onClick={() => {
                              changeTheme(opt.value);
                            }}
                          >
                            {opt.label}
                          </MainMenu.Item>
                        ))}
                      </MainMenu.Submenu>
                      {fullscreen.supported ? (
                        <>
                          <MainMenu.Separator />
                          <MainMenu.Item
                            icon={
                              fullscreen.active ? (
                                <Shrink {...menuIcon} />
                              ) : (
                                <Expand {...menuIcon} />
                              )
                            }
                            onClick={fullscreen.toggle}
                          >
                            {fullscreen.active ? "Exit full screen" : "Enter full screen"}
                          </MainMenu.Item>
                        </>
                      ) : null}
                    </MainMenu.Submenu>
                    {/* Preferences — per-user editor settings (persisted per browser). */}
                    <MainMenu.Submenu
                      icon={<SlidersHorizontal {...menuIcon} />}
                      label="Preferences"
                    >
                      <MainMenu.Submenu icon={<Mouse {...menuIcon} />} label="Mouse or trackpad">
                        {WHEEL_MODE_OPTIONS.map((opt) => (
                          <MainMenu.Item
                            key={opt.value}
                            active={wheelMode === opt.value}
                            onClick={() => editor?.setPreferences({ wheelMode: opt.value })}
                          >
                            {opt.label}
                          </MainMenu.Item>
                        ))}
                      </MainMenu.Submenu>
                      <MainMenu.Item
                        icon={<Magnet {...menuIcon} />}
                        keepOpen
                        onClick={() => editor?.setPreferences({ snapObjects: !snapObjects })}
                        checked={snapObjects}
                      >
                        Snap objects
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<Ruler {...menuIcon} />}
                        keepOpen
                        onClick={() =>
                          editor?.setPreferences({ suggestObjectSize: !suggestObjectSize })
                        }
                        checked={suggestObjectSize}
                      >
                        Suggest object size
                      </MainMenu.Item>
                    </MainMenu.Submenu>
                    {/* Help — top-level rows, not a submenu. */}
                    <MainMenu.Separator />
                    <MainMenu.Item
                      icon={<Keyboard {...menuIcon} />}
                      shortcut="?"
                      onClick={() => {
                        setHelpOpen(true);
                      }}
                    >
                      Hotkeys
                    </MainMenu.Item>
                    {repositoryHref ? (
                      <MainMenu.ItemLink href={repositoryHref} external>
                        GitHub
                      </MainMenu.ItemLink>
                    ) : null}
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
            center={renderTopBarCenter?.()}
            right={
              <ButtonGroup ariaLabel="Top bar actions">
                {renderTopBarRight ? renderTopBarRight() : null}
              </ButtonGroup>
            }
          />
        )}

        {!hideBottomBar && !zen && (
          <BottomBar
            left={renderBottomBarLeft ? renderBottomBarLeft() : null}
            center={
              renderBottomBarCenter ? (
                renderBottomBarCenter()
              ) : !hideResetToContent ? (
                <ResetToContentButton />
              ) : null
            }
            right={
              renderBottomBarRight ? (
                renderBottomBarRight()
              ) : !hideZoomControls ? (
                // Help sits inside the zoom pill group, right next to it.
                <ZoomControls
                  trailing={!hideHelpButton ? <HelpButton /> : undefined}
                  fullscreen={fullscreen}
                  minimapVisible={minimapVisible}
                  onToggleMinimap={onToggleMinimap}
                />
              ) : !hideHelpButton ? (
                <HelpButton />
              ) : null
            }
          />
        )}

        {/* Templates library. Desktop: floating overlay flush at the left
            edge. Mobile: a bottom sheet (swipe-down / ✕ to close) so it
            doesn't cover the whole small canvas. Both open from the toolbar
            toggle. Hidden in zen mode. */}
        {zen ? null : mobile ? (
          libraryOpen ? (
            <BottomSheet
              snapPoints={[0, 60, 92]}
              defaultValue={60}
              style={{ pointerEvents: "auto" }}
              onChange={(vh) => {
                if (vh <= 0) setLibraryOpen(false);
              }}
            >
              <LibraryPanel
                open
                sheet
                onClose={() => {
                  setLibraryOpen(false);
                }}
                {...(onImportTemplates ? { onImport: onImportTemplates } : {})}
              />
            </BottomSheet>
          ) : null
        ) : (
          <LibraryPanel
            open={libraryOpen}
            side="left"
            onClose={() => {
              setLibraryOpen(false);
            }}
            {...(onImportTemplates ? { onImport: onImportTemplates } : {})}
          />
        )}
      </UILayer>

      {/* Minimap — docked bottom-right ABOVE the zoom controls, hidden in
          zen mode with the rest of the chrome. Reads the editor from context.
          The bottom offset clears the bottom bar (inset + bar height + gap). */}
      {minimapVisible && !zen && (
        <div className="du-minimap-dock">
          <Minimap />
        </div>
      )}

      {/* Drawing / eraser tool-options panel — floats top-right below the top
          bar while the brush or eraser is active (DrawingPanel self-gates on
          mode). Hidden in zen mode with the rest of the chrome. */}
      {!hideDrawingPanel && !zen && (
        <div className="du-tool-options-dock">
          <DrawingPanel />
        </div>
      )}

      {/* Floating selection panel — portal to body, positions itself
          above the selection bbox via @floating-ui. Rendered OUTSIDE
          UILayer because it portals to document.body anyway and
          UILayer's pointer-events:none on the wrapper would
          interfere with its children's auto handling. */}
      {!hideSelectionPanel && !zen && <SelectionFloatingPanel />}

      {/* Standalone HelpDialog for hotkey activation — only renders
          when the `?` hotkey opens it without going through the
          button. HelpButton manages its own copy when clicked. */}
      <HelpDialog
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
        }}
      />

      {/* Command palette (⌘K) — self-contained: manages its own open state and
          registers the open action. */}
      <CommandPalette />

      {/* Observational overlays — search (⌘F) and stats (⌥/). Self-contained
          (own state + registered actions); stay live in zen mode. */}
      <SearchOverlay />
      <StatsPanel />

      {void editor}
    </div>
  );
};

/**
 * Platform-correct hotkey labels for the zoom-control tooltips — ⌘
 * glyphs on macOS, "Ctrl+…" elsewhere, mirroring the top toolbar's
 * tool tooltips. Mirror the bound zoom hotkeys (display uses the
 * minus/plus glyphs).
 */
const ZOOM_OUT_HOTKEY = formatHotkey({ meta: true, key: "−" });
const ZOOM_IN_HOTKEY = formatHotkey({ meta: true, key: "+" });
const ZOOM_RESET_HOTKEY = formatHotkey({ meta: true, key: "0" });
const ZOOM_FIT_HOTKEY = formatHotkey({ alt: true, key: "1" });

/**
 * Bottom-right zoom controls — three pills (zoom-out / zoom level / zoom-in)
 * + a fit-to-screen button. Wraps the editor's zoom API in the
 * unified IconButton chrome so the visual style matches the rest of
 * the bar.
 *
 * `trailing` lets the host append extra controls inside the same pill
 * group (e.g. the Help button, so it sits right next to zoom).
 */
/** Zoom presets of the zoom menu (fractions of 100 %). */
const ZOOM_PRESETS: readonly number[] = [0.5, 0.7, 1, 4, 12, 20];

const ZoomControls = ({
  trailing,
  fullscreen,
  minimapVisible,
  onToggleMinimap,
}: {
  readonly trailing?: ReactNode;
  readonly fullscreen: ReturnType<typeof useFullscreen>;
  readonly minimapVisible: boolean;
  readonly onToggleMinimap: () => void;
}) => {
  const editor = useDiagramOptional();
  // Subscribe to the zoom VALUE only — a whole-editor subscription would
  // re-render these buttons on every frame of an element drag.
  const zoom = useEditorSelector((e) => e.scene.viewport.zoom, 1);
  const showObjectSize = useEditorSelector((e) => e.preferences.showObjectSize, true);
  if (!editor) return null;
  const setShowObjectSize = (next: boolean) => {
    editor.setPreferences({ showObjectSize: next });
  };
  return (
    <ButtonGroup ariaLabel="Zoom">
      <IconButton
        label={`Zoom out (${ZOOM_OUT_HOTKEY})`}
        onClick={() => {
          editor.zoomOut();
        }}
      >
        <Minus {...buttonIcon} />
      </IconButton>
      {/* The zoom percentage opens the view menu: fullscreen, minimap, grid,
          object dimensions, then Fit + zoom presets (reference parity). */}
      <MainMenu
        ariaLabel="Zoom menu"
        placement="top-end"
        triggerClassName="du-icon-button du-icon-button-flat du-zoom-trigger"
        trigger={<>{Math.round(zoom * 100)}%</>}
      >
        {fullscreen.supported ? (
          <MainMenu.Item
            icon={fullscreen.active ? <Shrink {...menuIcon} /> : <Expand {...menuIcon} />}
            onClick={fullscreen.toggle}
          >
            {fullscreen.active ? "Exit full screen" : "Enter full screen"}
          </MainMenu.Item>
        ) : null}
        <MainMenu.Item icon={<MapIcon {...menuIcon} />} shortcut="M" onClick={onToggleMinimap}>
          {minimapVisible ? "Hide minimap" : "Show minimap"}
        </MainMenu.Item>
        <MainMenu.Submenu icon={<Grid3x3 {...menuIcon} />} label="Grid">
          {GRID_OPTIONS.map((opt) => (
            <MainMenu.Item
              key={opt.value}
              icon={opt.icon}
              active={gridSelection(editor) === opt.value}
              onClick={() => {
                applyGridSelection(editor, opt.value);
              }}
            >
              {opt.label}
            </MainMenu.Item>
          ))}
        </MainMenu.Submenu>
        <MainMenu.Item
          icon={<Ruler {...menuIcon} />}
          keepOpen
          onClick={() => {
            setShowObjectSize(!showObjectSize);
          }}
          checked={showObjectSize}
        >
          Object dimensions
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.Item
          icon={<Maximize {...menuIcon} />}
          shortcut={ZOOM_FIT_HOTKEY}
          onClick={() => {
            editor.zoomToFit();
          }}
        >
          Fit to screen
        </MainMenu.Item>
        {ZOOM_PRESETS.map((level) => (
          <MainMenu.Item
            key={level}
            icon={<ZoomIn {...menuIcon} />}
            {...(level === 1 ? { shortcut: ZOOM_RESET_HOTKEY } : {})}
            onClick={() => {
              editor.setZoom(level);
            }}
          >
            {`${String(Math.round(level * 100))}%`}
          </MainMenu.Item>
        ))}
      </MainMenu>
      <IconButton
        label={`Zoom in (${ZOOM_IN_HOTKEY})`}
        onClick={() => {
          editor.zoomIn();
        }}
      >
        <Plus {...buttonIcon} />
      </IconButton>
      <IconButton
        label={`Fit to screen (${ZOOM_FIT_HOTKEY})`}
        onClick={() => {
          editor.zoomToFit();
        }}
      >
        <Maximize {...buttonIcon} />
      </IconButton>
      {trailing}
    </ButtonGroup>
  );
};

/** Grid submenu rows (reference labels), mapped onto the grid toggle values. */
const GRID_OPTIONS: readonly {
  readonly value: "off" | "dots" | "lines";
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { value: "off", label: "None", icon: <Ban {...menuIcon} /> },
  { value: "lines", label: "Line grid", icon: <Grid3x3 {...menuIcon} /> },
  { value: "dots", label: "Dot grid", icon: <Grip {...menuIcon} /> },
];

const THEME_OPTIONS: readonly {
  readonly value: DiagramTheme;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { value: "light", label: "Light", icon: <Sun {...menuIcon} /> },
  { value: "dark", label: "Dark", icon: <Moon {...menuIcon} /> },
  { value: "system", label: "System", icon: <Monitor {...menuIcon} /> },
];

const WHEEL_MODE_OPTIONS: readonly { readonly value: WheelMode; readonly label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "mouse", label: "Mouse" },
  { value: "trackpad", label: "Trackpad" },
];

// --- Grid toggle helpers ----------------------------------------------------

/** Translate the `grid` / `snap` props into a partial settings override. */
const buildHostSettings = (
  gridEnabled: boolean | undefined,
  gridStyle: GridStyle | undefined,
  snap: boolean | undefined,
): SceneSettings => ({
  viewport: {
    ...(gridEnabled !== undefined ? { gridEnabled } : {}),
    ...(gridStyle !== undefined ? { gridStyle } : {}),
    ...(snap !== undefined ? { snapToGrid: snap } : {}),
  },
});

/**
 * Map the current viewport state to the segmented Grid toggle's value.
 * `"off"` when the grid is disabled; otherwise the stored gridStyle
 * (default `"lines"`).
 */
const gridSelection = (editor: Editor | null): "lines" | "dots" | "off" => {
  if (!editor) return "lines";
  const vp = editor.scene.viewport;
  if (!vp.gridEnabled) return "off";
  return vp.gridStyle ?? "lines";
};

/**
 * Map the editor's snap-to-grid state to the Snap toggle. Defaults to
 * "on" (matches the editor default; snapping is independent of grid
 * visibility).
 */
const snapSelection = (editor: Editor | null): "on" | "off" =>
  (editor?.snapToGridEnabled ?? true) ? "on" : "off";

/** Inverse — translate the toggle's value back into a `setGrid` call. */
const applyGridSelection = (editor: Editor | null, next: "lines" | "dots" | "off"): void => {
  if (!editor) return;
  if (next === "off") {
    editor.setGrid({ enabled: false });
    return;
  }
  editor.setGrid({ enabled: true, style: next });
};
