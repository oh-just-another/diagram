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
import type { Editor } from "@oh-just-another/state";
import {
  ContextMenu,
  DEFAULT_CONTEXT_MENU,
  DiagramRoot,
  DiagramSurface,
  LayerPanel,
  Palette,
  PropertyPanel,
  Toolbar,
  useDiagramOptional,
  usePaletteDropHandler,
  type ToolbarItem,
} from "@oh-just-another/react-ui";
import { setupTemplates } from "./templates";
import { useTheme } from "./theme";
import { useHotkeys } from "./hotkeys";
import { HistoryPanel } from "./HistoryPanel";
import { useCollab } from "./collab";
import { Peers } from "./Peers";

setupTemplates();

const STORAGE_KEY = "oh-just-another-demo-scene-v2";

const seedScene = (): Scene => {
  let s = emptyScene();
  s = {
    ...s,
    viewport: { ...s.viewport, size: { width: 800, height: 600 }, gridSize: 20 },
  };
  const rect: Shape = {
    id: shapeId("seed-rect"),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 80, y: 80 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#cfe1ff", stroke: "#1a40b0", strokeWidth: 2 },
    width: 200,
    height: 120,
  };
  const ellipse: Shape = {
    id: shapeId("seed-ellipse"),
    layerId: DEFAULT_LAYER_ID,
    type: "ellipse",
    position: { x: 360, y: 220 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(rect.order, null),
    style: { fill: "#fff2a8", stroke: "#b18a00", strokeWidth: 2 },
    width: 200,
    height: 140,
  };
  ({ scene: s } = addShape(s, rect));
  ({ scene: s } = addShape(s, ellipse));
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
  const { room, awareness } = useCollab(editor);

  return (
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
        <main style={{ display: "flex", flex: 1, minHeight: 0, background: "var(--bg)" }}>
          <Palette style={paletteStyle} />
          <CanvasArea />
          <PropertyPanel style={panelStyle} />
          <LayerPanel />
          <HistoryPanel />
        </main>
      </DiagramRoot>
    </div>
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

const CanvasArea = () => {
  const onDrop = usePaletteDropHandler();
  return (
    <section
      onDragEnter={(ev) => {
        if (ev.dataTransfer.types.includes("application/x-template-id")) ev.preventDefault();
      }}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes("application/x-template-id")) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
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
    </section>
  );
};

const FloatingToolbar = () => {
  const editor = useDiagramOptional();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (editor.scene.shapes.size === 0 && editor.scene.edges.size === 0) return;
    if (!window.confirm("Clear the whole scene? This also resets undo history.")) return;
    editor.loadScene({
      shapes: new Map(),
      edges: new Map(),
      layers: editor.scene.layers,
      viewport: editor.scene.viewport,
    });
  }, [editor]);

  const items: ToolbarItem[] = useMemo(
    () => [
      { kind: "mode", mode: "select", label: "Select" },
      { kind: "mode", mode: "draw-rect", label: "Rectangle" },
      { kind: "mode", mode: "draw-ellipse", label: "Ellipse" },
      { kind: "mode", mode: "draw-edge", label: "Edge" },
      { kind: "divider" },
      { kind: "undo" },
      { kind: "redo" },
      { kind: "divider" },
      { kind: "action", id: "save", label: "Save", onClick: onSave },
      { kind: "action", id: "load", label: "Load…", onClick: onLoadClick },
      { kind: "action", id: "svg", label: "Export SVG", onClick: onExportSvg },
      { kind: "action", id: "png", label: "Export PNG", onClick: onExportPng },
      { kind: "action", id: "clear", label: "Clear", onClick: onClear },
    ],
    [onSave, onLoadClick, onExportSvg, onExportPng, onClear],
  );

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
