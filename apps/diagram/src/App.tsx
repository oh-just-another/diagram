import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
} from "@oh-just-another/scene";
import { defaultRegistry, type Template } from "@oh-just-another/templates";
import { parseScene, parseFiles, stringifyScene, stringifyFiles } from "@oh-just-another/serialization";
import { elementId } from "@oh-just-another/types";
import type { Editor } from "@oh-just-another/state";
import { Diagram, type CapabilityOverrides, type DiagramAPI } from "./index";
import { setupTemplates } from "./templates";
import { installGifAnimationAdapter } from "./gif-animation";
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
// Register the GIF frame decoder (gifuct-js) so animated GIFs play
// in both Canvas2D and WebGL2 — the kernel's image renderer asks
// this adapter for the current frame.
installGifAnimationAdapter();

const STORAGE_KEY = "oh-just-another-diagram-scene-v2";
// Binary files (image / GIF bytes) live in a separate localStorage
// entry — `stringifyScene` deliberately omits `Scene.files` to keep
// scene.json small, so we persist the sidecar ourselves. Without it
// images (and GIF frames decoded from these bytes) can't be
// rehydrated after reload.
const FILES_KEY = "oh-just-another-diagram-files-v1";

// Autosave debounce. A pan / drag mutates the scene (viewport or shape
// positions) every animation frame; without a real delay the autosave
// would `stringifyScene` + write localStorage on each one. Coalesce to
// one write after the user pauses.
const AUTOSAVE_DEBOUNCE_MS = 600;

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
    const id = elementId(`seed-${tmpl.id}-${i}`);
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
      let parsed = parseScene(saved);
      // Re-attach the binary-file sidecar so image / GIF shapes can
      // resolve their `fileId` again (and the editor can rehydrate
      // animationData for GIFs). Missing / unparseable sidecar just
      // leaves `files` empty — images won't render but nothing crashes.
      const filesRaw =
        typeof window !== "undefined" ? localStorage.getItem(FILES_KEY) : null;
      if (filesRaw) {
        try {
          parsed = { ...parsed, files: parseFiles(filesRaw) };
        } catch (err) {
          console.warn("[diagram] stored files sidecar unparseable", err);
        }
      }
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

/**
 * Read a `renderer` override from the URL — supports both
 * `?renderer=canvas2d` (search) and `#renderer=canvas2d` (hash) so
 * either form works regardless of how the host routes. Forces the
 * backend for debugging / comparison; invalid or absent value falls
 * back to auto-detect.
 */
const readCapabilityOverrides = (): CapabilityOverrides | undefined => {
  if (typeof window === "undefined") return undefined;
  const search = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const renderer = search.get("renderer") ?? hashParams.get("renderer");
  if (renderer === "webgl2" || renderer === "canvas2d" || renderer === "offscreen") {
    return { renderer };
  }
  return undefined;
};

export const App = () => {
  // Read the hash once at mount — decides whether to seed an empty
  // collab scene (room snapshot is authoritative) or restore the
  // local autosave. Ongoing hash changes are handled by `useCollab`.
  const isCollab = useMemo(() => readRoomFromHash() !== null, []);
  // Renderer backend override from the URL (`?renderer=canvas2d`).
  // Read once at mount — switching backend needs a reload anyway.
  const capabilityOverrides = useMemo(() => readCapabilityOverrides(), []);
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

  // Autosave on scene mutation, debounced so a pan / drag (which
  // mutates the scene every frame) doesn't write localStorage on each
  // frame. The binary-file sidecar is re-serialised ONLY when the
  // `files` map actually changes — base64-encoding large GIF / image
  // bytes is expensive, and pan / move / typing never touch `files`,
  // so re-encoding them every save tanked FPS (arrayBufferToBase64 hot
  // path).
  const pendingScene = useRef<Scene | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilesRef = useRef<Scene["files"] | null>(null);
  const lastFilesStr = useRef<string | null>(null);
  const handleSceneChange = useCallback(
    (scene: Scene) => {
      if (isCollab || typeof window === "undefined") return;
      pendingScene.current = scene;
      if (saveTimer.current !== null) return; // a flush is already scheduled
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const s = pendingScene.current;
        if (!s) return;
        pendingScene.current = null;
        try {
          window.localStorage.setItem(STORAGE_KEY, stringifyScene(s));
          if (s.files.size > 0) {
            // Cache the serialised sidecar by `files` identity — only
            // re-encode when the binary map changed (add / remove file),
            // never on a viewport / position change.
            if (s.files !== lastFilesRef.current || lastFilesStr.current === null) {
              lastFilesStr.current = stringifyFiles(s);
              lastFilesRef.current = s.files;
            }
            window.localStorage.setItem(FILES_KEY, lastFilesStr.current);
          } else {
            window.localStorage.removeItem(FILES_KEY);
            lastFilesRef.current = null;
            lastFilesStr.current = null;
          }
        } catch {
          /* quota / private mode — ignore */
        }
      }, AUTOSAVE_DEBOUNCE_MS);
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
        {...(capabilityOverrides ? { capabilities: capabilityOverrides } : {})}
      />
      <DebugPanel editor={editor} />
    </>
  );
};
