import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { shapeId } from "@oh-just-another/types";
import { defaultRegistry, type Template } from "@oh-just-another/templates";
import type { Editor } from "@oh-just-another/state";
import {
  CommentsPanel,
  CommentsPopover,
  ContextMenu,
  DEFAULT_CONTEXT_MENU,
  DiagramRoot,
  DiagramSurface,
  LayerPanel,
  Palette,
  EdgeStylePanel,
  PropertyPanel,
  TextEditorOverlay,
  HelpDialog,
  MainMenu,
  ToastHost,
  Toolbar,
  WelcomeScreen,
  useHelpDialogHotkey,
  useDiagramOptional,
  usePalettePlacement,
  VersionPanel,
  type ToolbarItem,
} from "@oh-just-another/react-ui";
import { importIntoStore, serializeStore, SnapshotStore } from "@oh-just-another/versioning";
import { setupTemplates } from "./templates";
import { useTheme } from "./theme";
import { useHotkeys } from "./hotkeys";
import { HistoryPanel } from "./HistoryPanel";
import { useCollab } from "./collab";
import { Peers } from "./Peers";
import { ConnectionBadge } from "./ConnectionBadge";

setupTemplates();

const STORAGE_KEY = "oh-just-another-demo-scene-v2";
const SNAPSHOT_STORAGE_KEY = "oh-just-another-demo-snapshots-v1";

const seedScene = (): Scene => {
  let s = emptyScene();
  // Do not pin size — `<DiagramRoot>` synchronises it with the actual
  // canvas size via ResizeObserver. A stale size caused under-coverage
  // of the viewport-culling rect.
  s = {
    ...s,
    viewport: { ...s.viewport, gridSize: 20 },
  };
  // Fill the scene with a grid of all registered templates —
  // convenient for manual testing. Walk by categories, so that
  // same-type shapes are adjacent. Templates without `factory` are skipped.
  const templates: readonly Template[] = defaultRegistry.list();
  if (templates.length === 0) return s;

  const cols = 4;
  const cellW = 260;
  const cellH = 220;
  const margin = 40;
  let prevOrder = orderBetween(null, null);
  templates.forEach((tmpl, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const id = shapeId(`seed-${tmpl.id}-${i}`);
    const ctx = {
      id,
      layerId: DEFAULT_LAYER_ID,
      position: { x: margin + col * cellW, y: margin + row * cellH },
      order: prevOrder,
    };
    try {
      const shape = tmpl.factory(ctx);
      const next = { ...shape, order: prevOrder };
      ({ scene: s } = addShape(s, next));
      prevOrder = orderBetween(prevOrder, null);
    } catch (err) {
      console.warn(`[demo] template ${tmpl.id} factory failed`, err);
    }
  });
  return s;
};

const restoreScene = (): Scene => {
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) return parseScene(saved);
  } catch (err) {
    console.warn("[demo] stored scene unparseable, starting fresh", err);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return seedScene();
};

const readRoomFromUrlBeforeMount = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("room");
};

export const App = () => {
  // Decide *before* the editor is created whether we're in collab mode.
  // In collab mode we start the editor empty and let `bindEditor` adopt
  // the room's CRDT state; loading from localStorage would race with
  // peers and clobber the shared scene.
  const isCollab = useMemo(() => readRoomFromUrlBeforeMount() !== null, []);
  const initialScene = useMemo(() => (isCollab ? seedScene() : restoreScene()), [isCollab]);
  const { theme, toggle } = useTheme();
  const [editor, setEditor] = useState<Editor | null>(null);
  useHotkeys(editor);
  const { room, awareness, status } = useCollab(editor);
  // Snapshot store with localStorage persistence. Loaded once on
  // mount; every capture / branch / restore re-serialises through a
  // subscribe (debounced via microtask).
  const snapshotStore = useMemo(() => {
    const s = new SnapshotStore();
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
        if (raw) importIntoStore(s, JSON.parse(raw) as ReturnType<typeof serializeStore>);
      } catch (err) {
        console.warn("[demo] stored snapshots unparseable, starting fresh", err);
      }
    }
    return s;
  }, []);
  useEffect(() => {
    let scheduled = false;
    const unsub = snapshotStore.subscribe(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (typeof window === "undefined") return;
        try {
          window.localStorage.setItem(
            SNAPSHOT_STORAGE_KEY,
            JSON.stringify(serializeStore(snapshotStore)),
          );
        } catch {
          /* quota / private mode — ignore */
        }
      });
    });
    return unsub;
  }, [snapshotStore]);
  const snapshotAuthor = useMemo(() => ({ id: "local", name: "You" }), []);

  return (
    <ToastHost>
    <div className="root" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
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
          <MainMenu>
            <MainMenu.Item onClick={toggle} shortcut={theme === "dark" ? "☀" : "🌙"}>
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.ItemLink href="https://github.com/standard/standard" external>
              standard source ↗
            </MainMenu.ItemLink>
          </MainMenu>
          <h1
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--muted)",
              margin: 0,
              letterSpacing: 0.5,
            }}
          >
            Diagram demo
          </h1>
          {room ? (
            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                padding: "2px 8px",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
              title="Open this URL in another tab to test real-time collaboration"
            >
              room: <code>{room}</code>
            </span>
          ) : (
            <a
              href="?room=demo"
              style={{ fontSize: 11, color: "var(--muted)", textDecoration: "none" }}
              title="Join the demo collab room"
            >
              + join collab room
            </a>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {status ? <ConnectionBadge status={status} /> : null}
          <Peers awareness={awareness} />
          <button
            type="button"
            onClick={toggle}
            style={{
              background: "var(--button-bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      <DiagramRoot initialScene={initialScene} initialMode="select" onReady={setEditor}>
        {isCollab ? null : <PersistSubscriber />}
        <TemplateActionListener />
        <main
          data-panel-stack="main"
          style={{ display: "flex", flex: 1, minHeight: 0, background: "var(--bg)" }}
        >
          <div data-panel="palette" style={panelWrapperStyle}>
            <Palette style={paletteStyle} />
          </div>
          <div data-panel="canvas" style={canvasWrapperStyle}>
            <CanvasArea />
          </div>
          <div data-panel="property" style={panelWrapperStyle}>
            <PropertyPanel style={panelStyle} />
            <EdgeStylePanel style={panelStyle} />
          </div>
          <div data-panel="layers" style={panelWrapperStyle}>
            <LayerPanel />
          </div>
          <div data-panel="comments" style={panelWrapperStyle}>
            <CommentsPanel />
          </div>
          <div data-panel="versions" style={panelWrapperStyle}>
            <VersionPanel store={snapshotStore} author={snapshotAuthor} />
          </div>
          <div data-panel="history" style={panelWrapperStyle}>
            <HistoryPanel />
          </div>
        </main>
      </DiagramRoot>
    </div>
    </ToastHost>
  );
};

const paletteStyle: React.CSSProperties = {
  flex: "0 0 200px",
  background: "var(--panel)",
  color: "var(--text)",
  borderRight: "1px solid var(--border)",
};

const panelStyle: React.CSSProperties = {
  flex: "0 0 240px",
  background: "var(--panel)",
  color: "var(--text)",
  borderLeft: "1px solid var(--border)",
};

// Pass-through wrapper so panels can be targeted by CSS data-attribute
// selectors. Empty `display: contents` is intentionally avoided — the
// mobile media query needs to apply width/max-height to the wrapper
// directly. `display: flex` keeps the panel inside laid out normally.
const panelWrapperStyle: React.CSSProperties = { display: "flex", minHeight: 0 };
const canvasWrapperStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
};

const CanvasArea = () => {
  const placement = usePalettePlacement();
  const [helpOpen, setHelpOpen] = useState(false);
  useHelpDialogHotkey(() => setHelpOpen(true));
  return (
    <section
      {...placement}
      style={{
        flex: 1,
        position: "relative",
        background: "var(--surface)",
        minHeight: 0,
      }}
    >
      <DiagramSurface />
      <FloatingToolbar />
      <ContextMenu items={DEFAULT_CONTEXT_MENU} />
      <CommentsPopover />
      <TextEditorOverlay />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <WelcomeScreen />
    </section>
  );
};

const FloatingToolbar = () => {
  const editor = useDiagramOptional();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const onImageFile: React.ChangeEventHandler<HTMLInputElement> = (ev) => {
    const file = ev.target.files?.[0];
    if (!file || !editor) return;
    // Drop centered on the viewport — host uses viewportWorld() via
    // editor.computeViewportWorld but that's private; instead grab
    // the scene's current pan + half its viewport size.
    const v = editor.scene.viewport;
    const center = {
      x: v.pan.x + v.size.width / (2 * v.zoom),
      y: v.pan.y + v.size.height / (2 * v.zoom),
    };
    void editor.dispatchFileDrop(file, center);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const onSave = useCallback(() => {
    if (!editor) return;
    download(stringifyScene(editor.scene, 2), `scene-${stamp()}.json`, "application/json");
  }, [editor]);

  const onLoadClick = useCallback(() => fileInputRef.current?.click(), []);
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (ev) => {
    const file = ev.target.files?.[0];
    if (!file || !editor) return;
    void file
      .text()
      .then((text) => {
        try {
          editor.loadScene(parseScene(text));
        } catch (err) {
          window.alert(`Failed to load scene: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
      .finally(() => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
  };

  const onExportSvg = useCallback(() => {
    if (!editor) return;
    const rect = editor.scene.viewport.size;
    const svg = renderSceneToSvg(editor.scene, { width: rect.width, height: rect.height });
    download(svg, `scene-${stamp()}.svg`, "image/svg+xml;charset=utf-8");
  }, [editor]);

  const onExportPng = useCallback(() => {
    if (!editor) return;
    const rect = editor.scene.viewport.size;
    const svg = renderSceneToSvg(editor.scene, { width: rect.width, height: rect.height });
    svgToPng(svg, rect.width, rect.height, 2)
      .then((blob) => downloadBlob(blob, `scene-${stamp()}.png`))
      .catch((err) =>
        window.alert(`PNG export failed: ${err instanceof Error ? err.message : String(err)}`),
      );
  }, [editor]);

  const onClear = useCallback(() => {
    if (!editor) return;
    // Reset to the demo's default seed scene (same content the user
    // sees on a fresh visit), AND wipe the autosave key so a reload
    // doesn't restore a stale post-clear state. Snapshot store
    // (separate key) is preserved — those are explicit versions.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    editor.loadScene(seedScene());
  }, [editor]);

  const items: ToolbarItem[] = useMemo(
    () => [
      { kind: "mode", mode: "select", label: "Select", title: "Select (V)" },
      { kind: "mode", mode: "hand", label: "Hand", title: "Pan (H)" },
      { kind: "mode", mode: "draw-rect", label: "Rectangle", title: "Rectangle (R)" },
      { kind: "mode", mode: "draw-ellipse", label: "Ellipse", title: "Ellipse (E)" },
      { kind: "mode", mode: "draw-edge", label: "Edge", title: "Edge (L)" },
      { kind: "mode", mode: "draw-frame", label: "Frame", title: "Frame (F)" },
      {
        kind: "action",
        id: "insert-image",
        label: "Image",
        title: "Insert image — open file picker",
        onClick: () => imageInputRef.current?.click(),
      },
      {
        kind: "tool-lock",
        label: "🔒",
        title: "Lock active tool — keep drawing the same shape after each create",
      },
      { kind: "divider" },
      { kind: "undo" },
      { kind: "redo" },
      { kind: "divider" },
      { kind: "zoom" },
      { kind: "divider" },
      { kind: "action", id: "save", label: "Save", onClick: onSave },
      { kind: "action", id: "load", label: "Load…", onClick: onLoadClick },
      { kind: "action", id: "svg", label: "Export SVG", onClick: onExportSvg },
      { kind: "action", id: "png", label: "Export PNG", onClick: onExportPng },
      { kind: "action", id: "clear", label: "Clear", onClick: onClear },
    ],
    [onSave, onLoadClick, onExportSvg, onExportPng, onClear],
  );

  // Save / Load / Export hotkeys — Cmd+S / Cmd+O / Cmd+E.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      const t = ev.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const meta = ev.metaKey || ev.ctrlKey;
      if (!meta) return;
      if (ev.key === "s" || ev.key === "S") {
        ev.preventDefault();
        onSave();
      } else if (ev.key === "o" || ev.key === "O") {
        ev.preventDefault();
        onLoadClick();
      } else if (ev.key === "e" || ev.key === "E") {
        ev.preventDefault();
        onExportSvg();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave, onLoadClick, onExportSvg]);

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--toolbar-bg)",
        padding: "4px 6px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
      }}
    >
      <Toolbar items={items} />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={onFileChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onImageFile}
      />
    </div>
  );
};

/**
 * Autosaves scene changes to `localStorage`. Kept separate to prevent re-renders.
 */
const PersistSubscriber = () => {
  const editor = useDiagramOptional();
  useEffect(() => {
    if (!editor) return undefined;
    const persist = (): void => {
      try {
        localStorage.setItem(STORAGE_KEY, stringifyScene(editor.scene));
      } catch {
        /* quota or storage-disabled — silently drop */
      }
    };
    persist();
    return editor.subscribe(persist);
  }, [editor]);
  return null;
};

/**
 * Subscribe to template button taps so the user sees something happen
 * when they click the Action button inside Task Card — both standalone
 * and nested inside Swim-lane. Without a subscriber the button click
 * fires but no host action runs, which appears as "not working".
 */
const TemplateActionListener = () => {
  const editor = useDiagramOptional();
  useEffect(() => {
    if (!editor) return undefined;
    return editor.onTemplateTap((emit) => {
      const shape = editor.scene.shapes.get(emit.shapeId);
      const parent = shape?.parentId ? editor.scene.shapes.get(shape.parentId) : null;
      const where = parent ? `nested in ${parent.id}` : "standalone";
      console.info(`[demo] template tap → ${emit.action} on ${emit.shapeId} (${where})`);
      // Tiny ephemeral toast so the user has visual confirmation.
      const toast = document.createElement("div");
      toast.textContent = `▶ ${emit.action}`;
      Object.assign(toast.style, {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1a73e8",
        color: "#fff",
        padding: "8px 14px",
        borderRadius: "6px",
        fontSize: "13px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        zIndex: "9999",
        pointerEvents: "none",
        transition: "opacity 250ms ease",
      } as CSSStyleDeclaration);
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
      }, 1200);
      setTimeout(() => toast.remove(), 1500);
    });
  }, [editor]);
  return null;
};

// --- helpers ---

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const download = (text: string, name: string, mime: string): void => {
  downloadBlob(new Blob([text], { type: mime }), name);
};

const downloadBlob = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Browser-side SVG to PNG conversion via an offscreen `<canvas>`.
 */
const svgToPng = (svg: string, width: number, height: number, scale = 1): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to get 2D canvas context"));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        if (b) resolve(b);
        else reject(new Error("canvas.toBlob returned null"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG into image"));
    };
    img.src = url;
  });
