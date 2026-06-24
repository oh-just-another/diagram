import { createRoot, type Root } from "react-dom/client";
import {
  Editor as EditorComponent,
  type EditorAPI,
  type EditorProps,
  type ElementId,
  type Mode,
} from "@oh-just-another/editor";
import { PortalContainerProvider } from "@oh-just-another/react-ui";
import type { Scene } from "@oh-just-another/scene";
import { REACT_UI_STYLES } from "./styles.generated.js";

type ThemeSetting = "dark" | "light" | "system";
type RendererSetting = "canvas2d" | "webgl2" | "offscreen";

const THEMES: ReadonlySet<string> = new Set(["dark", "light", "system"]);
const RENDERERS: ReadonlySet<string> = new Set(["canvas2d", "webgl2", "offscreen"]);

/** Lazily built singleton stylesheet shared by every element instance. */
let sharedSheet: CSSStyleSheet | null = null;
const styleSheet = (): CSSStyleSheet => {
  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet();
    // The stylesheet declares its theme variables on `:root`, which selects
    // the document root and so matches nothing inside a shadow tree. Rewrite
    // it to `:host` so the variables land on the shadow host and inherit
    // down to every component (including portaled menus / tooltips).
    sharedSheet.replaceSync(REACT_UI_STYLES.replace(/:root\b/g, ":host"));
  }
  return sharedSheet;
};

/**
 * `<oh-diagram>` — a framework-neutral custom element wrapping the React
 * editor. It mounts the editor into its own shadow root (styles isolated
 * via `adoptedStyleSheets`, floating UI portaled into the same root), and
 * exposes a plain DOM surface: attributes / properties for configuration,
 * methods for imperative control, and `CustomEvent`s for output.
 *
 * Attributes (string): `theme` (`dark` | `light` | `system`), `renderer`
 * (`canvas2d` | `webgl2` | `offscreen`), `grid` / `snap` (boolean — present
 * = on). Properties: `scene` (a `Scene` object). Events: `ready`,
 * `scenechange`, `selectionchange`, `themechange`. Methods: `undo`, `redo`,
 * `zoomToFit`, `getScene`, `loadScene`, `getMode`, `setMode`,
 * `getSelection`, `setSelection`, plus the `editor` escape hatch.
 */
export class OhDiagramElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return ["theme", "renderer", "grid", "snap"];
  }

  #root: Root | null = null;
  #portalLayer: HTMLDivElement | null = null;
  /** Wraps the editor + portals; carries `data-theme` so both pick up the theme. */
  #themeHost: HTMLDivElement | null = null;
  #api: EditorAPI | null = null;
  /** Initial scene captured before mount; live updates go through `loadScene`. */
  #scene: Scene | undefined = undefined;

  connectedCallback(): void {
    if (this.#root) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet()];

    // The host element must establish a sizing context; the editor fills it.
    if (!this.style.display) this.style.display = "block";

    // One container holds both the editor and the portal layer so a forced
    // `data-theme` applies to menus / tooltips (portaled) and chrome alike.
    const container = document.createElement("div");
    container.style.cssText = "width:100%;height:100%;position:relative";
    const mount = document.createElement("div");
    mount.style.cssText = "width:100%;height:100%";
    const portals = document.createElement("div");
    this.#portalLayer = portals;
    container.append(mount, portals);
    shadow.append(container);
    this.#themeHost = container;
    this.#applyTheme();

    this.#root = createRoot(mount);
    this.#render();
  }

  disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = null;
    this.#api = null;
    this.#portalLayer = null;
    this.#themeHost = null;
  }

  attributeChangedCallback(name: string): void {
    if (name === "theme") this.#applyTheme();
    if (this.#root) this.#render();
  }

  /**
   * Mirror the `theme` attribute onto the container as `data-theme` so the
   * `[data-theme]` overrides in the stylesheet take effect. `system` (or
   * absent) leaves it off, falling back to `:host` + `prefers-color-scheme`.
   */
  #applyTheme(): void {
    const host = this.#themeHost;
    if (!host) return;
    const theme = this.getAttribute("theme");
    if (theme === "dark" || theme === "light") host.dataset.theme = theme;
    else delete host.dataset.theme;
  }

  // --- Properties ---

  /** The current scene. Setting it loads the scene once the editor is ready. */
  get scene(): Scene | undefined {
    return this.#api ? this.#api.getScene() : this.#scene;
  }
  set scene(scene: Scene | undefined) {
    this.#scene = scene;
    if (this.#api && scene) this.#api.loadScene(scene);
  }

  get theme(): ThemeSetting | null {
    const v = this.getAttribute("theme");
    return v && THEMES.has(v) ? (v as ThemeSetting) : null;
  }
  set theme(value: ThemeSetting | null) {
    if (value) this.setAttribute("theme", value);
    else this.removeAttribute("theme");
  }

  /** The live editor engine, or `null` until `ready` fires. */
  get editor(): EditorAPI["editor"] {
    return this.#api?.editor ?? null;
  }

  // --- Methods (delegate to the editor API once ready) ---

  getScene(): Scene | undefined {
    return this.#api?.getScene();
  }
  loadScene(scene: Scene): void {
    this.#scene = scene;
    this.#api?.loadScene(scene);
  }
  undo(): void {
    this.#api?.undo();
  }
  redo(): void {
    this.#api?.redo();
  }
  zoomToFit(): void {
    this.#api?.zoomToFit();
  }
  getMode(): Mode | null {
    return this.#api?.getMode() ?? null;
  }
  setMode(mode: Mode): void {
    this.#api?.setMode(mode);
  }
  getSelection(): ReadonlySet<ElementId> {
    return this.#api?.getSelection() ?? new Set();
  }
  setSelection(ids: Iterable<ElementId>): void {
    this.#api?.setSelection(ids);
  }

  // --- Internals ---

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #editorProps(): EditorProps {
    const themeAttr = this.getAttribute("theme");
    const rendererAttr = this.getAttribute("renderer");
    const theme = themeAttr && THEMES.has(themeAttr) ? (themeAttr as ThemeSetting) : undefined;
    const renderer =
      rendererAttr && RENDERERS.has(rendererAttr) ? (rendererAttr as RendererSetting) : undefined;
    return {
      ...(this.#scene ? { initialScene: this.#scene } : {}),
      grid: { enabled: this.hasAttribute("grid") },
      snap: this.hasAttribute("snap"),
      ...(theme ? { theme } : {}),
      ...(renderer ? { capabilities: { renderer } } : {}),
      onReady: (editor) => {
        // `onReady` hands back the live engine; the API ref is captured in
        // `#render` via the imperative handle, so re-emit once both settle.
        this.#emit("ready", { editor });
      },
      onSceneChange: (scene) => {
        this.#emit("scenechange", scene);
      },
      onSelectionChange: (ids) => {
        this.#emit("selectionchange", [...ids]);
      },
      onThemeChange: (next) => {
        this.#emit("themechange", next);
      },
    };
  }

  #render(): void {
    this.#root?.render(
      <PortalContainerProvider container={this.#portalLayer}>
        <EditorComponent
          ref={(api) => {
            this.#api = api;
          }}
          {...this.#editorProps()}
        />
      </PortalContainerProvider>,
    );
  }
}
