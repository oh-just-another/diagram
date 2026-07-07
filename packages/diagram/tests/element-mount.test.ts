import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "@oh-just-another/scene";
import type { EditorAPI, EditorProps } from "@oh-just-another/editor";

/**
 * Mount-path tests for `<oja-diagram>`: connected/disconnected lifecycle,
 * attribute → EditorProps mapping, event re-dispatch and the imperative
 * API delegation. React itself is mocked out (`createRoot` returns spies),
 * so the React element tree handed to `root.render` is inspected directly
 * and its callbacks are driven by hand — no real editor boots in jsdom.
 */

const renderSpy = vi.fn();
const unmountSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy, unmount: unmountSpy }));

vi.mock("react-dom/client", () => ({
  createRoot: (...args: unknown[]) => createRootSpy(...(args as [])),
}));

const unbindHotkeysSpy = vi.fn();
const bindEditorHotkeysSpy = vi.fn(() => unbindHotkeysSpy);

vi.mock("@oh-just-another/editor", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  bindEditorHotkeys: (...args: unknown[]) => bindEditorHotkeysSpy(...(args as [])),
}));

// jsdom has no constructable-stylesheet support — the element only needs
// `replaceSync` and an assignable `shadowRoot.adoptedStyleSheets`.
class FakeCSSStyleSheet {
  replaceSync = vi.fn();
}

// Side-effect import: registers the <oja-diagram> custom element. Kept
// separate from the type import so a lint autofix can't turn it type-only
// (which would silently skip registration and break every test below).
import "../src/index";
import type { OjaDiagramElement } from "../src/index";

/** Props of the `<EditorComponent>` inside the rendered React element tree. */
type RenderedProps = EditorProps & { ref: (api: EditorAPI | null) => void };

const lastRenderedProps = (): RenderedProps => {
  const tree = renderSpy.mock.lastCall?.[0] as {
    props: { children: { props: RenderedProps } };
  };
  return tree.props.children.props;
};

const connect = (setup?: (el: OjaDiagramElement) => void): OjaDiagramElement => {
  const el = document.createElement("oja-diagram");
  setup?.(el);
  document.body.appendChild(el);
  return el;
};

const makeApi = (over: Partial<EditorAPI> = {}): EditorAPI =>
  ({
    editor: { id: "engine" },
    getScene: vi.fn(),
    loadScene: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomToFit: vi.fn(),
    getMode: vi.fn(() => "select"),
    setMode: vi.fn(),
    getSelection: vi.fn(() => new Set()),
    setSelection: vi.fn(),
    ...over,
  }) as unknown as EditorAPI;

beforeEach(() => {
  vi.stubGlobal("CSSStyleSheet", FakeCSSStyleSheet);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("<oja-diagram> lifecycle", () => {
  it("mounts a shadow tree with editor mount + portal layer on connect", () => {
    const el = connect();
    expect(el.shadowRoot).not.toBeNull();
    // One container with two children: React mount + portal layer.
    const container = el.shadowRoot!.firstElementChild!;
    expect(container.children.length).toBe(2);
    expect(createRootSpy).toHaveBeenCalledOnce();
    expect(renderSpy).toHaveBeenCalledOnce();
    // The host establishes a sizing context.
    expect(el.style.display).toBe("block");
  });

  it("connect is idempotent — a second connectedCallback does not remount", () => {
    const el = connect();
    el.connectedCallback();
    expect(createRootSpy).toHaveBeenCalledOnce();
  });

  it("unmounts the React root and unbinds hotkeys on disconnect", () => {
    const el = connect();
    lastRenderedProps().onReady?.({ id: "engine" } as never);
    el.remove();
    expect(unmountSpy).toHaveBeenCalledOnce();
    expect(unbindHotkeysSpy).toHaveBeenCalledOnce();
    expect(el.editor).toBeNull();
  });
});

describe("<oja-diagram> attribute → props mapping", () => {
  it("defaults: no theme/renderer, grid and snap off", () => {
    connect();
    const props = lastRenderedProps();
    expect(props.theme).toBeUndefined();
    expect(props.capabilities).toBeUndefined();
    expect(props.grid).toEqual({ enabled: false });
    expect(props.snap).toBe(false);
  });

  it("maps theme/renderer/grid/snap attributes into EditorProps", () => {
    connect((el) => {
      el.setAttribute("theme", "dark");
      el.setAttribute("renderer", "webgl2");
      el.setAttribute("grid", "");
      el.setAttribute("snap", "");
    });
    const props = lastRenderedProps();
    expect(props.theme).toBe("dark");
    expect(props.capabilities).toEqual({ renderer: "webgl2" });
    expect(props.grid).toEqual({ enabled: true });
    expect(props.snap).toBe(true);
  });

  it("ignores unknown theme / renderer attribute values", () => {
    connect((el) => {
      el.setAttribute("theme", "neon");
      el.setAttribute("renderer", "quantum");
    });
    const props = lastRenderedProps();
    expect(props.theme).toBeUndefined();
    expect(props.capabilities).toBeUndefined();
  });

  it("re-renders on an observed attribute change and mirrors data-theme", () => {
    const el = connect();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    el.setAttribute("theme", "dark");
    expect(renderSpy).toHaveBeenCalledTimes(2);
    const container = el.shadowRoot!.firstElementChild as HTMLElement;
    expect(container.dataset.theme).toBe("dark");
    // `system` falls back to prefers-color-scheme — no data-theme.
    el.setAttribute("theme", "system");
    expect(container.dataset.theme).toBeUndefined();
  });

  it("passes a pre-assigned scene as initialScene", () => {
    const scene = { schemaVersion: 1 } as unknown as Scene;
    connect((el) => {
      el.scene = scene;
    });
    expect(lastRenderedProps().initialScene).toBe(scene);
  });
});

describe("<oja-diagram> ready wiring", () => {
  it("binds hotkeys, emits ready and applies a stashed scene", () => {
    const scene = { schemaVersion: 1 } as unknown as Scene;
    const ready = vi.fn();
    connect((e) => {
      e.scene = scene;
      e.addEventListener("ready", ready);
    });
    const engine = { loadScene: vi.fn() };
    lastRenderedProps().onReady?.(engine as never);

    expect(bindEditorHotkeysSpy).toHaveBeenCalledExactlyOnceWith(engine);
    expect(engine.loadScene).toHaveBeenCalledExactlyOnceWith(scene);
    expect(ready).toHaveBeenCalledOnce();
    expect((ready.mock.calls[0]![0] as CustomEvent).detail).toEqual({ editor: engine });
  });

  it("re-dispatches scene / selection / theme changes as CustomEvents", () => {
    const events: Record<string, unknown> = {};
    const el = connect();
    for (const type of ["scenechange", "selectionchange", "themechange"]) {
      el.addEventListener(type, (e) => {
        events[type] = (e as CustomEvent).detail;
      });
    }
    const props = lastRenderedProps();
    const scene = { schemaVersion: 1 } as unknown as Scene;
    props.onSceneChange?.(scene);
    props.onSelectionChange?.(new Set(["a"]) as never);
    props.onThemeChange?.("dark");

    expect(events["scenechange"]).toBe(scene);
    expect(events["selectionchange"]).toEqual(["a"]);
    expect(events["themechange"]).toBe("dark");
  });
});

describe("<oja-diagram> imperative API delegation", () => {
  const mountWithApi = (): { el: OjaDiagramElement; api: EditorAPI } => {
    const el = connect();
    const api = makeApi();
    lastRenderedProps().ref(api);
    return { el, api };
  };

  it("delegates undo/redo/zoomToFit/mode/selection to the editor API", () => {
    const { el, api } = mountWithApi();
    el.undo();
    el.redo();
    el.zoomToFit();
    el.setMode("draw-rect" as never);
    el.setSelection(["a"] as never);
    expect(api.undo).toHaveBeenCalledOnce();
    expect(api.redo).toHaveBeenCalledOnce();
    expect(api.zoomToFit).toHaveBeenCalledOnce();
    expect(api.setMode).toHaveBeenCalledExactlyOnceWith("draw-rect");
    expect(api.setSelection).toHaveBeenCalledExactlyOnceWith(["a"]);
    expect(el.getMode()).toBe("select");
    expect(el.getSelection().size).toBe(0);
  });

  it("scene getter reads from the live API once ready", () => {
    const { el, api } = mountWithApi();
    const scene = { schemaVersion: 1 } as unknown as Scene;
    (api.getScene as ReturnType<typeof vi.fn>).mockReturnValue(scene);
    expect(el.scene).toBe(scene);
    expect(el.getScene()).toBe(scene);
  });

  it("scene setter and loadScene forward to the live API", () => {
    const { el, api } = mountWithApi();
    const scene = { schemaVersion: 1 } as unknown as Scene;
    el.scene = scene;
    expect(api.loadScene).toHaveBeenCalledExactlyOnceWith(scene);
    const scene2 = { schemaVersion: 2 } as unknown as Scene;
    el.loadScene(scene2);
    expect(api.loadScene).toHaveBeenLastCalledWith(scene2);
  });

  it("exposes the live engine through the editor getter", () => {
    const { el, api } = mountWithApi();
    expect(el.editor).toBe(api.editor);
  });
});
