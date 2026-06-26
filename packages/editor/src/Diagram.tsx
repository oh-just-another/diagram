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
  Magnet,
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
  LibraryPanel,
  MainMenu,
  ResetToContentButton,
  LinkHoverPopup,
  LinkDropShapeMenu,
  LinkCaptionEditor,
  SelectionFloatingPanel,
  TextEditorOverlay,
  FrameNameEditorOverlay,
  PortalContainerProvider,
  ToastHost,
  Toolbar,
  Tooltip,
  TooltipProvider,
  TopBar,
  UILayer,
  useDiagramOptional,
  useHelpDialogHotkey,
  useMobileLayout,
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

/** Default target for the Help-menu "GitHub" link (overridable / hideable via the `repositoryUrl` prop). */
const DEFAULT_REPOSITORY_URL = "https://github.com/oh-just-another/diagram";
import type { Editor, FileDropHandler, Mode } from "@oh-just-another/state";
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
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
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
import { exportSceneToPng, type PngExportBackground } from "./png-export";
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
  // --- Mode ---
  readonly getMode: () => Mode | null;
  readonly setMode: (mode: Mode) => void;
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
  readonly initialMode?: Mode;

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
    initialMode = "select",
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

  useEffect(() => {
    if (!editor) return undefined;
    if (!wasmShaper && !wasmRaster) return undefined;
    editor.setMode(editor.mode);
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
    const sync = (e: KeyboardEvent) => {
      // Don't track modifiers (or touch snap state) while typing in a field —
      // keep the editor's transform flags inert there.
      if (isEditableTarget(e.target)) return;
      editor.setSnapSuppressed(e.metaKey || e.ctrlKey);
      editor.setTransformModifiers({ alt: e.altKey, shift: e.shiftKey });
    };
    const reset = () => {
      editor.setSnapSuppressed(false);
      editor.setTransformModifiers({ alt: false, shift: false });
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", reset);
      editor.setSnapSuppressed(false);
      editor.setTransformModifiers({ alt: false, shift: false });
    };
  }, [editor]);

  useImperativeHandle<DiagramAPI, DiagramAPI>(
    ref,
    () => ({
      editor,
      capabilities: profile,
      getScene: () => editor?.scene ?? seed,
      loadScene: (scene) => editor?.loadScene(scene),
      getMode: () => editor?.mode ?? null,
      setMode: (mode) => editor?.setMode(mode),
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
              initialMode={initialMode}
              onReady={handleReady}
              renderer={profile.renderer}
              {...(profile.renderer === "offscreen"
                ? { workerFactory: workerFactory ?? createRenderWorker }
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
                repositoryUrl={repositoryUrl}
                onConfirm={onConfirm}
                onNotify={onNotify}
                theme={theme}
                changeTheme={changeTheme}
              />
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
  readonly repositoryUrl: string | null | undefined;
  readonly onConfirm: ((message: string) => boolean) | undefined;
  readonly onNotify: ((message: string) => void) | undefined;
  readonly theme: DiagramTheme;
  readonly changeTheme: (next: DiagramTheme) => void;
}) => {
  const editor = useDiagramOptional();
  // Omitted → project repo; explicit string → that URL; null → no link.
  const repositoryHref = repositoryUrl === undefined ? DEFAULT_REPOSITORY_URL : repositoryUrl;
  // Native dialogs by default; hosts can route through their own UI.
  const confirmDialog = onConfirm ?? ((message: string) => window.confirm(message));
  const notify =
    onNotify ??
    ((message: string) => {
      window.alert(message);
    });
  // Subscribe to scene changes so the Grid toggle in MainMenu reads
  // the latest viewport.gridEnabled / gridStyle. `useScene` is a thin
  // selector hook — re-renders only on scene identity flips.
  void useScene();
  const paletteDropHandlers = usePalettePlacement();
  // Touch / narrow screens: the library opens as a bottom sheet instead of
  // a left overlay (which would cover the whole small canvas).
  const mobile = useMobileLayout();
  // The templates library is a floating overlay opened via the toolbar
  // toggle and closed via its ✕. Starts closed; no dock / pin.
  const [libraryOpen, setLibraryOpen] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useHelpDialogHotkey(() => {
    setHelpOpen((v) => !v);
  });

  // Layout (left → right): templates library overlay at the window
  // edge, then the floating vertical creation toolbar, then the canvas.
  // The library overlays the canvas (no reflow); the toolbar floats just
  // to its right when open, else near the edge. On mobile the library is a
  // bottom sheet, so the toolbar never shifts.
  const LIBRARY_PANEL_WIDTH = 240;
  const BAR_INSET = 12;
  const toolbarLeft = !mobile && libraryOpen ? LIBRARY_PANEL_WIDTH + BAR_INSET : BAR_INSET;

  // Items for the vertical creation dock: an optional templates-library
  // toggle on top (hidden with `hideLibraryButton`), then the standard
  // creation tools.
  const toolbarItems = useMemo<ToolbarItem[]>(
    () =>
      hideLibraryButton
        ? [...DEFAULT_VERTICAL_TOOLBAR]
        : [
            {
              kind: "action",
              id: "toggle-library",
              label: <LibraryIcon {...buttonIcon} />,
              title: "Templates library",
              active: libraryOpen,
              onClick: () => {
                setLibraryOpen((v) => !v);
              },
            },
            { kind: "divider" },
            ...DEFAULT_VERTICAL_TOOLBAR,
          ],
    [hideLibraryButton, libraryOpen],
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
        <LinkDropShapeMenu />
        <LinkCaptionEditor />
        {!hideContextMenu && <ContextMenu items={DEFAULT_CONTEXT_MENU} />}
      </div>

      {/* Floating vertical creation toolbar — pinned to the far left,
          over the canvas. Rendered outside UILayer
          (whose wrapper is pointer-events:none) so its buttons stay
          interactive. */}
      {!hideToolbar ? (
        <Toolbar
          orientation="vertical"
          items={toolbarItems}
          style={{
            position: "absolute",
            // Vertically centred on the left; floats just to the right of
            // the library when it's open (else flush near the edge).
            // `env(safe-area-inset-left)` is 0 on desktop, clears the notch
            // in mobile landscape.
            top: "50%",
            left: `calc(env(safe-area-inset-left, 0px) + ${toolbarLeft}px)`,
            transform: "translateY(-50%)",
            zIndex: 60,
          }}
        />
      ) : null}

      {/* UI layer — top/bottom bars + overlay panels (full width; the
          library overlays rather than reflows). */}
      <UILayer>
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
                        onClick={() => {
                          openSceneFile(editor, notify);
                        }}
                      >
                        Open…
                      </MainMenu.Item>
                      <MainMenu.Item
                        icon={<FileDown {...menuIcon} />}
                        onClick={() => {
                          if (editor) downloadScene(editor.scene);
                        }}
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
                          onClick={() => editor && void downloadPng(editor, "transparent", notify)}
                          disabled={!editor}
                        >
                          PNG (transparent)
                        </MainMenu.Item>
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() => editor && void downloadPng(editor, "color", notify)}
                          disabled={!editor}
                        >
                          PNG (with background)
                        </MainMenu.Item>
                        <MainMenu.Item
                          icon={<ImageDown {...menuIcon} />}
                          onClick={() =>
                            editor && void downloadPng(editor, "color-and-grid", notify)
                          }
                          disabled={!editor}
                        >
                          PNG (with background + grid)
                        </MainMenu.Item>
                        <MainMenu.Separator />
                        <MainMenu.Item
                          icon={<Download {...menuIcon} />}
                          onClick={() => {
                            if (editor) downloadSvg(editor.scene);
                          }}
                          disabled={!editor}
                        >
                          SVG
                        </MainMenu.Item>
                      </MainMenu.Submenu>
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
                        onChange={(next) => {
                          applyGridSelection(editor, next);
                        }}
                        options={[
                          { value: "lines", label: "Lines", icon: <Grid3x3 {...toggleIcon} /> },
                          { value: "dots", label: "Dots", icon: <Grip {...toggleIcon} /> },
                          { value: "off", label: "Off", icon: <Minus {...toggleIcon} /> },
                        ]}
                      />
                    </MainMenu.Group>
                    <MainMenu.Group title="Snap to grid">
                      <MainMenu.Toggle<"on" | "off">
                        value={snapSelection(editor)}
                        onChange={(next) => {
                          editor?.setSnapToGrid(next === "on");
                        }}
                        options={[
                          { value: "on", label: "On", icon: <Magnet {...toggleIcon} /> },
                          { value: "off", label: "Off", icon: <Minus {...toggleIcon} /> },
                        ]}
                      />
                    </MainMenu.Group>
                    <MainMenu.Separator />
                    <MainMenu.Group title="Help">
                      <MainMenu.Item
                        icon={<HelpCircle {...menuIcon} />}
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
            center={renderTopBarCenter?.()}
            right={
              <ButtonGroup ariaLabel="Top bar actions">
                {renderTopBarRight ? renderTopBarRight() : null}
              </ButtonGroup>
            }
          />
        )}

        {!hideBottomBar && (
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
                <ZoomControls trailing={!hideHelpButton ? <HelpButton /> : undefined} />
              ) : !hideHelpButton ? (
                <HelpButton />
              ) : null
            }
          />
        )}

        {/* Templates library. Desktop: floating overlay flush at the left
            edge. Mobile: a bottom sheet (swipe-down / ✕ to close) so it
            doesn't cover the whole small canvas. Both open from the toolbar
            toggle. */}
        {mobile ? (
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
            style={{ left: 0 }}
            onClose={() => {
              setLibraryOpen(false);
            }}
            {...(onImportTemplates ? { onImport: onImportTemplates } : {})}
          />
        )}
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
      <HelpDialog
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
        }}
      />

      {/* Command palette (⌘K) — self-contained: manages its own open state and
          registers the open action. */}
      <CommandPalette />

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
const ZoomControls = ({ trailing }: { readonly trailing?: ReactNode }) => {
  const editor = useDiagramOptional();
  // Force re-render on viewport change.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    return editor.subscribe(() => {
      force((n) => n + 1);
    });
  }, [editor]);
  if (!editor) return null;
  const zoom = editor.scene.viewport.zoom;
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
      <Tooltip content={`Reset zoom to 100% (${ZOOM_RESET_HOTKEY})`}>
        <button
          type="button"
          className="du-icon-button"
          aria-label="Reset zoom to 100%"
          onClick={() => {
            editor.resetZoom();
          }}
          style={{
            minWidth: 56,
            padding: "0 8px",
            borderRadius: 0,
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
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
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });
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
const openSceneFile = (editor: Editor | null, notify: (message: string) => void): void => {
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
        console.error("[diagram] failed to parse scene file:", err);
        notify("Failed to parse the file — make sure it was saved through this app's Save action.");
      }
    });
  };
  input.click();
};

/**
 * "Export as PNG" — renders the **full scene** (not just the visible
 * viewport) into an OffscreenCanvas via the standard `renderScene` +
 * `renderLinks` pipeline and downloads the result. Three variants
 * exposed in the menu:
 *
 *   • transparent      — PNG with alpha channel preserved
 *   • color            — solid background fill (host canvas colour)
 *   • color-and-grid   — solid fill + same grid the user sees
 *
 * Scale fixed at 2× for retina-quality output. The full-scene
 * contract makes this symmetric with SVG export, which always emits
 * the whole scene.
 */
const PNG_EXPORT_SCALE = 2;

const downloadPng = async (
  editor: Editor,
  background: PngExportBackground,
  notify: (message: string) => void,
): Promise<void> => {
  const backgroundColor = readCanvasBackgroundColor();
  const blob = await exportSceneToPng(editor.scene, {
    background,
    scale: PNG_EXPORT_SCALE,
    backgroundColor,
  });
  if (!blob) {
    // Empty scene — convertToBlob unavailable or no shapes to export.
    notify("Nothing to export — the canvas is empty.");
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
  const value = getComputedStyle(probe).getPropertyValue("--du-canvas-bg").trim();
  return value || "#ffffff";
};

/**
 * "Export as SVG" — renders the scene to vector SVG (no bitmap
 * fall-back, works in any browser). One file per scene.
 */
const downloadSvg = (scene: Scene): void => {
  const svg = renderSceneToSvg(scene);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "scene.svg");
};

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
