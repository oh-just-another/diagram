import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
} from "@oh-just-another/scene";
import { defaultRegistry, type Template } from "@oh-just-another/templates";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { shapeId } from "@oh-just-another/types";
import type { Editor } from "@oh-just-another/state";
import { Diagram, type DiagramAPI } from "./index";
import { setupTemplates } from "./templates";
import { useHotkeys } from "./hotkeys";
import { useCollab } from "./collab";
import { DebugPanel } from "./debug-panel";
import { SessionButton } from "./SessionButton";
import { Peers } from "./Peers";
import { ConnectionBadge } from "./ConnectionBadge";

/**
 * Example app showing how to embed `<Diagram>` into a host
 * project. Everything host-side here (autosave, theme toggle,
 * collab room badge) is wired via `<Diagram>`'s public props —
 * `onSceneChange`, `onReady`, `renderHeaderLeft`, `renderHeaderRight`.
 */

setupTemplates();

const STORAGE_KEY = "oh-just-another-diagram-scene-v2";

const seedScene = (): Scene => {
  let s = emptyScene();
  s = { ...s, viewport: { ...s.viewport, gridSize: DEFAULT_GRID_SIZE } };
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
      console.warn(`[diagram] template ${tmpl.id} factory failed`, err);
    }
  });
  return s;
};

const DEFAULT_GRID_SIZE = 20;

const restoreScene = (): Scene => {
  try {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      const parsed = parseScene(saved);
      // Saves can come back without `gridSize`, which makes the grid
      // invisible after reload. Force the default on restoration so
      // the canvas always has a visible grid unless the user
      // explicitly turned it off.
      if (!parsed.viewport.gridSize) {
        return {
          ...parsed,
          viewport: { ...parsed.viewport, gridSize: DEFAULT_GRID_SIZE },
        };
      }
      return parsed;
    }
  } catch (err) {
    console.warn("[diagram] stored scene unparseable, starting fresh", err);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return seedScene();
};

const readRoomFromHash = (): string | null => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("room");
};

export const App = () => {
  // Read the hash once at mount — decides whether to seed an empty
  // collab scene (room snapshot is authoritative) or restore the
  // local autosave. Ongoing hash changes are handled by `useCollab`.
  const isCollab = useMemo(() => readRoomFromHash() !== null, []);
  const initialScene = useMemo<Scene>(
    () => (isCollab ? seedScene() : restoreScene()),
    [isCollab],
  );
  // Theme is owned by <Diagram> now (Theme submenu in MainMenu);
  // persistence is enabled via `persistTheme` prop below. The host
  // no longer needs its own theme state.
  const [editor, setEditor] = useState<Editor | null>(null);
  const apiRef = useRef<DiagramAPI>(null);
  useHotkeys(editor);
  const collab = useCollab(editor);
  const { awareness, status } = collab;

  // Autosave on every scene mutation, microtask-debounced so a
  // burst of moves doesn't slam localStorage.
  const pendingScene = useRef<Scene | null>(null);
  const handleSceneChange = useCallback(
    (scene: Scene) => {
      if (isCollab || typeof window === "undefined") return;
      pendingScene.current = scene;
      queueMicrotask(() => {
        const s = pendingScene.current;
        if (!s) return;
        pendingScene.current = null;
        try {
          window.localStorage.setItem(STORAGE_KEY, stringifyScene(s));
        } catch {
          /* quota / private mode — ignore */
        }
      });
    },
    [isCollab],
  );

  // Re-render the header chrome when the collab status badge flips.
  useEffect(() => {
    void status;
  }, [status]);

  const renderHeaderLeft = useCallback(
    () => (
      <h1
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--muted)",
          margin: 0,
          letterSpacing: 0.5,
        }}
      >
        Diagram
      </h1>
    ),
    [],
  );

  const renderHeaderRight = useCallback(
    () => (
      <>
        {status ? <ConnectionBadge status={status} /> : null}
        <Peers awareness={awareness} />
        <SessionButton collab={collab} />
      </>
    ),
    [status, awareness, collab],
  );

  return (
    <>
      <Diagram
        ref={apiRef}
        initialScene={initialScene}
        onReady={setEditor}
        onSceneChange={handleSceneChange}
        renderTopBarLeft={renderHeaderLeft}
        renderTopBarRight={renderHeaderRight}
        persistTheme
      />
      <DebugPanel editor={editor} />
    </>
  );
};
