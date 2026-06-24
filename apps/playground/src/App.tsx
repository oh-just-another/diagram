import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Scene, type BinaryFile } from "@oh-just-another/scene";
import { type FileId } from "@oh-just-another/types";
import { createSceneAutosave } from "./autosave";
import { parseScene, parseFiles, stringifyScene } from "@oh-just-another/serialization";
import { loadAllFiles, saveFiles, pruneFilesExcept } from "./idb-files";
import type { Editor } from "@oh-just-another/state";
import { Diagram, type CapabilityOverrides, type DiagramAPI } from "@oh-just-another/editor";
import { setupTemplates } from "./templates";
import { installConfettiRenderer } from "./confetti";
import { useHotkeys } from "./hotkeys";
import { useCollab } from "./collab";
import { DebugPanel } from "./debug-panel";
import { SessionButton } from "./SessionButton";
import { Peers } from "./Peers";
import { ConnectionBadge } from "./ConnectionBadge";
import { readUrlParam } from "./url-params";

/**
 * Example app showing how to embed `<Diagram>` into a host
 * project. Everything host-side here (autosave, theme toggle,
 * collab room badge) is wired via `<Diagram>`'s public props —
 * `onSceneChange`, `onReady`, `renderHeaderLeft`, `renderHeaderRight`.
 */

setupTemplates();
// The GIF frame decoder is registered by default inside `<Diagram>`
// (built-in `installGifAnimationAdapter`), so animated GIFs play out of the box.

const STORAGE_KEY = "oh-just-another-diagram-scene-v2";
// Binary files (image / GIF bytes) live in IndexedDB (see `idb-files`):
// `stringifyScene` omits `Scene.files` to keep scene.json small, and the
// bytes can outgrow the localStorage quota, so they get their own store.
// This key is only read once to migrate a sidecar written by an earlier
// build into IndexedDB.
const FILES_KEY = "oh-just-another-diagram-files-v1";

// Autosave debounce. A pan / drag mutates the scene (viewport or shape
// positions) every animation frame; without a real delay the autosave
// would `stringifyScene` + write localStorage on each one. Coalesce to
// one write after the user pauses.
const AUTOSAVE_DEBOUNCE_MS = 600;

// One-time migration: pull a binary-file sidecar written by an earlier
// build out of localStorage and into IndexedDB, then clear the old key.
// Returns the parsed files (empty map on absence / parse failure).
const migrateLegacyFiles = async (): Promise<void> => {
  if (typeof window === "undefined") return;
  let filesRaw: string | null = null;
  try {
    filesRaw = localStorage.getItem(FILES_KEY);
  } catch {
    return;
  }
  if (!filesRaw) return;
  try {
    await saveFiles(parseFiles(filesRaw));
    localStorage.removeItem(FILES_KEY);
  } catch (err) {
    console.warn("[diagram] could not migrate stored files sidecar", err);
  }
};

// Restore the autosaved scene, or `undefined` for a fresh start. On a fresh
// start the editor seeds the default scene and the host's `grid` prop fills in
// the grid, so the demo opens with a visible grid without seeding it here.
const restoreScene = async (): Promise<Scene | undefined> => {
  if (typeof window === "undefined") return undefined;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[diagram] localStorage unavailable", err);
    return undefined;
  }
  if (!saved) return undefined;
  let parsed: Scene;
  try {
    parsed = parseScene(saved);
  } catch (err) {
    console.warn("[diagram] stored scene unparseable, starting fresh", err);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return undefined;
  }
  // Re-attach the binary bytes from IndexedDB so image / GIF shapes can
  // resolve their `fileId` again (and the editor can rehydrate
  // animationData for GIFs). A first run after an upgrade migrates the
  // old localStorage sidecar across before the read.
  let files = new Map<FileId, BinaryFile>();
  try {
    files = await loadAllFiles();
    if (files.size === 0) {
      await migrateLegacyFiles();
      files = await loadAllFiles();
    }
  } catch (err) {
    console.warn("[diagram] could not load stored files", err);
  }
  return files.size > 0 ? { ...parsed, files } : parsed;
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
  const renderer = readUrlParam("renderer");
  if (renderer === "webgl2" || renderer === "canvas2d" || renderer === "offscreen") {
    return { renderer };
  }
  return undefined;
};

/**
 * Read the `hitzones` debug switch from the URL — supports both
 * `?hitzones=1` (search) and `#hitzones=1` (hash), like `renderer`
 * above. When truthy, the editor paints the mouse hit-zones overlay
 * (resize-handle slop, link handles, anchor-dot grab/click radii) so
 * the tuned thresholds can be eyeballed in the browser. Same toggle as
 * the debug panel's "Show hit-zones", but enabled from a shareable URL.
 * Accepts `1` / `true` / `on` (case-insensitive); anything else = off.
 */
const readDebugHitZones = (): boolean => {
  const v = (readUrlParam("hitzones") ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
};

export const App = () => {
  // Read the hash once at mount — decides whether to seed an empty
  // collab scene (room snapshot is authoritative) or restore the
  // local autosave. Ongoing hash changes are handled by `useCollab`.
  const isCollab = useMemo(() => readRoomFromHash() !== null, []);
  // Renderer backend override from the URL (`?renderer=canvas2d`).
  // Read once at mount — switching backend needs a reload anyway.
  const capabilityOverrides = useMemo(() => readCapabilityOverrides(), []);
  // Loading the binary assets from IndexedDB is async, so the autosaved
  // scene is restored after mount and the editor surface waits for it —
  // a brief gate that avoids mounting with images missing, then
  // re-attaching them on a second pass. Collab seeds an empty scene (the
  // room snapshot is authoritative) and never waits.
  const [initialScene, setInitialScene] = useState<Scene | undefined>(undefined);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (isCollab || typeof window === "undefined") {
      setRestored(true);
      return;
    }
    let cancelled = false;
    void restoreScene()
      .then((scene) => {
        if (cancelled) return;
        setInitialScene(scene);
        setRestored(true);
      })
      .catch(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isCollab]);
  // Theme is owned by <Diagram> now (Theme submenu in MainMenu);
  // persistence is enabled via `persistTheme` prop below. The host
  // no longer needs its own theme state.
  const [editor, setEditor] = useState<Editor | null>(null);
  // Wrap the rectangle renderer for the confetti template AFTER the
  // surface mounted (`installBuiltinRenderers()` runs on mount and resets
  // the rectangle renderer to the plain built-in). `installConfettiRenderer`
  // is idempotent, so re-running it on a remount is safe.
  const handleReady = useCallback((ed: Editor) => {
    installConfettiRenderer();
    // Debug hit-zone overlay from the URL (`?hitzones=1`) — read once at
    // ready, same as the renderer override. The debug panel can still
    // toggle it afterwards.
    if (readDebugHitZones()) ed.setDebugHitZones(true);
    setEditor(ed);
  }, []);
  const apiRef = useRef<DiagramAPI>(null);
  useHotkeys(editor);
  const collab = useCollab(editor);
  const { awareness, status } = collab;

  // Autosave on scene mutation, debounced so a pan / drag (which
  // mutates the scene every frame) doesn't write on each frame. The
  // binary store is touched ONLY when the `files` map identity changes
  // (add / remove image) — pan / move / typing never touch `files`, so
  // a viewport change never rewrites multi-megabyte bytes.
  const lastFilesRef = useRef<Scene["files"] | null>(null);
  // Persist `s`: the scene JSON goes to localStorage (small — bytes are
  // stripped), the binary assets go to IndexedDB. Safe to call from both
  // the debounce timer and an unload flush.
  const writeScene = useCallback((s: Scene) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, stringifyScene(s));
    } catch (err) {
      console.warn("[diagram] could not persist scene", err);
    }
    if (s.files === lastFilesRef.current) return;
    lastFilesRef.current = s.files;
    // Fire-and-forget — the bytes are already in memory, so a write that
    // lands a tick later still survives the next reload.
    void saveFiles(s.files).catch((err: unknown) => {
      console.warn("[diagram] could not persist files", err);
    });
    void pruneFilesExcept(new Set(s.files.keys())).catch(() => {
      /* best-effort cleanup */
    });
  }, []);
  // Debounced autosave controller. `flush()` is wired to tab-hide /
  // unload below so an edit made in the last `AUTOSAVE_DEBOUNCE_MS`
  // isn't lost when the user reloads or closes the tab before the timer
  // fires.
  const autosave = useMemo(
    () => createSceneAutosave<Scene>(writeScene, AUTOSAVE_DEBOUNCE_MS),
    [writeScene],
  );
  const handleSceneChange = useCallback(
    (scene: Scene) => {
      if (isCollab || typeof window === "undefined") return;
      autosave.schedule(scene);
    },
    [isCollab, autosave],
  );

  // Flush the pending autosave when the tab is hidden or unloading.
  // `visibilitychange→hidden` is the reliable signal on mobile (where
  // `beforeunload` often never fires); `pagehide` covers bfcache /
  // desktop reload. On unmount, drop the timer without writing.
  useEffect(() => {
    if (isCollab || typeof window === "undefined") return;
    const onHide = () => {
      if (document.visibilityState === "hidden") autosave.flush();
    };
    const onPageHide = () => {
      autosave.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      autosave.cancel();
    };
  }, [isCollab, autosave]);

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

  // Hold the surface until the autosaved scene (with its IndexedDB-backed
  // assets) is ready, so it mounts once with images already attached.
  if (!restored) return null;

  return (
    <>
      <Diagram
        ref={apiRef}
        grid={{ enabled: true }}
        onReady={handleReady}
        onSceneChange={handleSceneChange}
        renderTopBarLeft={renderHeaderLeft}
        renderTopBarRight={renderHeaderRight}
        persistTheme
        {...(initialScene ? { initialScene } : {})}
        {...(capabilityOverrides ? { capabilities: capabilityOverrides } : {})}
      />
      <DebugPanel editor={editor} />
    </>
  );
};
