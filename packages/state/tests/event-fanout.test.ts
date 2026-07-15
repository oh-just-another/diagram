/**
 * Unit tests for the pure event-fanout dispatcher (`editor/event-fanout.ts`):
 * `createEventCache`, `primeEventCache` and `fanOutEvents`. Complements
 * `editor-events.test.ts`, which wire-tests the same logic through a live
 * `Editor` — here each slice-flip decision is pinned in isolation.
 */
import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "@oh-just-another/events";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import type { ElementId } from "@oh-just-another/types";
import {
  createEventCache,
  fanOutEvents,
  primeEventCache,
  type EditorObservableSnapshot,
} from "../src/editor/event-fanout.js";
import type { EditorEvents } from "../src/editor-events.js";
import * as Selection from "../src/selection.js";
import { DEFAULT_MODE, type ActiveTool } from "../src/modes.js";

const TOOL: ActiveTool = { type: DEFAULT_MODE, locked: false, lastActiveTool: null };

const makeSnapshot = (over: Partial<EditorObservableSnapshot> = {}): EditorObservableSnapshot => ({
  activeTool: TOOL,
  selection: Selection.EMPTY,
  scene: emptyScene(),
  canUndo: false,
  canRedo: false,
  ...over,
});

interface Spies {
  change: ReturnType<typeof vi.fn>;
  tool: ReturnType<typeof vi.fn>;
  selection: ReturnType<typeof vi.fn>;
  scene: ReturnType<typeof vi.fn>;
  history: ReturnType<typeof vi.fn>;
  viewport: ReturnType<typeof vi.fn>;
}

const setup = (): { emitter: ReturnType<typeof createEmitter<EditorEvents>>; spies: Spies } => {
  const emitter = createEmitter<EditorEvents>();
  const spies: Spies = {
    change: vi.fn(),
    tool: vi.fn(),
    selection: vi.fn(),
    scene: vi.fn(),
    history: vi.fn(),
    viewport: vi.fn(),
  };
  emitter.on("change", spies.change);
  emitter.on("tool", spies.tool);
  emitter.on("selection", spies.selection);
  emitter.on("scene", spies.scene);
  emitter.on("history", spies.history);
  emitter.on("viewport", spies.viewport);
  return { emitter, spies };
};

describe("createEventCache", () => {
  it("starts empty so the first fan-out fires every slice", () => {
    const cache = createEventCache();
    expect(cache).toEqual({
      activeTool: null,
      selection: null,
      scene: null,
      viewport: null,
      canUndo: false,
      canRedo: false,
    });
  });
});

describe("primeEventCache", () => {
  it("seeds the cache so an identical snapshot fires only change", () => {
    const cache = createEventCache();
    const snapshot = makeSnapshot();
    primeEventCache(cache, snapshot);

    const { emitter, spies } = setup();
    fanOutEvents(cache, emitter, snapshot);

    expect(spies.tool).not.toHaveBeenCalled();
    expect(spies.selection).not.toHaveBeenCalled();
    expect(spies.scene).not.toHaveBeenCalled();
    expect(spies.viewport).not.toHaveBeenCalled();
    expect(spies.history).not.toHaveBeenCalled();
    expect(spies.change).toHaveBeenCalledTimes(1);
  });
});

describe("fanOutEvents — per-slice dispatch", () => {
  it("fires every typed event on an unprimed cache, then change once", () => {
    const cache = createEventCache();
    const { emitter, spies } = setup();
    const snapshot = makeSnapshot();

    fanOutEvents(cache, emitter, snapshot);

    expect(spies.tool).toHaveBeenCalledExactlyOnceWith(snapshot.activeTool);
    expect(spies.selection).toHaveBeenCalledExactlyOnceWith(snapshot.selection);
    expect(spies.scene).toHaveBeenCalledExactlyOnceWith(snapshot.scene);
    expect(spies.viewport).toHaveBeenCalledExactlyOnceWith(snapshot.scene);
    // canUndo/canRedo match the cache default (false/false) → no flip.
    expect(spies.history).not.toHaveBeenCalled();
    expect(spies.change).toHaveBeenCalledTimes(1);
  });

  it("fires tool only when the activeTool reference changes", () => {
    const cache = createEventCache();
    const base = makeSnapshot();
    primeEventCache(cache, base);
    const { emitter, spies } = setup();

    const hand: ActiveTool = { type: "hand", locked: false, lastActiveTool: "select" };
    fanOutEvents(cache, emitter, makeSnapshot({ activeTool: hand }));
    expect(spies.tool).toHaveBeenCalledExactlyOnceWith(hand);

    // Same object again → no second emit (identity compare).
    fanOutEvents(cache, emitter, makeSnapshot({ activeTool: hand }));
    expect(spies.tool).toHaveBeenCalledTimes(1);
    expect(spies.change).toHaveBeenCalledTimes(2);
  });

  it("fires tool on a lock flip (type unchanged, new object)", () => {
    const cache = createEventCache();
    primeEventCache(cache, makeSnapshot());
    const { emitter, spies } = setup();

    const locked: ActiveTool = { ...TOOL, locked: true };
    fanOutEvents(cache, emitter, makeSnapshot({ activeTool: locked }));
    expect(spies.tool).toHaveBeenCalledExactlyOnceWith(locked);
  });

  it("fires selection only on a new selection reference", () => {
    const cache = createEventCache();
    const base = makeSnapshot();
    primeEventCache(cache, base);
    const { emitter, spies } = setup();

    const sel = Selection.single("el-1" as ElementId);
    fanOutEvents(cache, emitter, makeSnapshot({ selection: sel }));
    expect(spies.selection).toHaveBeenCalledExactlyOnceWith(sel);

    fanOutEvents(cache, emitter, makeSnapshot({ selection: sel }));
    expect(spies.selection).toHaveBeenCalledTimes(1);
  });

  it("fires scene (and viewport) by identity when the scene reference changes", () => {
    const cache = createEventCache();
    const sceneA = emptyScene();
    primeEventCache(cache, makeSnapshot({ scene: sceneA }));
    const { emitter, spies } = setup();

    const sceneB: Scene = { ...sceneA, viewport: { ...sceneA.viewport } };
    fanOutEvents(cache, emitter, makeSnapshot({ scene: sceneB }));
    expect(spies.scene).toHaveBeenCalledExactlyOnceWith(sceneB);
    expect(spies.viewport).toHaveBeenCalledExactlyOnceWith(sceneB);
  });

  it("does not fire viewport when the new scene shares the viewport reference", () => {
    const cache = createEventCache();
    const sceneA = emptyScene();
    primeEventCache(cache, makeSnapshot({ scene: sceneA }));
    const { emitter, spies } = setup();

    // Structural sharing: new scene identity, same viewport object.
    const sceneB: Scene = { ...sceneA };
    fanOutEvents(cache, emitter, makeSnapshot({ scene: sceneB }));
    expect(spies.scene).toHaveBeenCalledTimes(1);
    expect(spies.viewport).not.toHaveBeenCalled();
  });

  it("fires viewport when only the viewport object is replaced", () => {
    const cache = createEventCache();
    const sceneA = emptyScene();
    primeEventCache(cache, makeSnapshot({ scene: sceneA }));
    const { emitter, spies } = setup();

    const sceneB: Scene = { ...sceneA, viewport: { ...sceneA.viewport, zoom: 2 } };
    fanOutEvents(cache, emitter, makeSnapshot({ scene: sceneB }));
    expect(spies.viewport).toHaveBeenCalledExactlyOnceWith(sceneB);
  });

  it("fires history when canUndo flips", () => {
    const cache = createEventCache();
    primeEventCache(cache, makeSnapshot());
    const { emitter, spies } = setup();

    fanOutEvents(cache, emitter, makeSnapshot({ canUndo: true }));
    expect(spies.history).toHaveBeenCalledExactlyOnceWith({ canUndo: true, canRedo: false });
  });

  it("fires history when canRedo flips", () => {
    const cache = createEventCache();
    primeEventCache(cache, makeSnapshot());
    const { emitter, spies } = setup();

    fanOutEvents(cache, emitter, makeSnapshot({ canRedo: true }));
    expect(spies.history).toHaveBeenCalledExactlyOnceWith({ canUndo: false, canRedo: true });
  });

  it("fires history once when both flags flip together", () => {
    const cache = createEventCache();
    primeEventCache(cache, makeSnapshot());
    const { emitter, spies } = setup();

    fanOutEvents(cache, emitter, makeSnapshot({ canUndo: true, canRedo: true }));
    expect(spies.history).toHaveBeenCalledExactlyOnceWith({ canUndo: true, canRedo: true });
  });

  it("mutates the cache in place so consecutive calls are stable", () => {
    const cache = createEventCache();
    const { emitter, spies } = setup();
    const snapshot = makeSnapshot({ canUndo: true });

    fanOutEvents(cache, emitter, snapshot);
    fanOutEvents(cache, emitter, snapshot);

    // Every typed event fires once (first call); second call only fires change.
    expect(spies.tool).toHaveBeenCalledTimes(1);
    expect(spies.selection).toHaveBeenCalledTimes(1);
    expect(spies.scene).toHaveBeenCalledTimes(1);
    expect(spies.viewport).toHaveBeenCalledTimes(1);
    expect(spies.history).toHaveBeenCalledTimes(1);
    expect(spies.change).toHaveBeenCalledTimes(2);
  });

  it("always fires the umbrella change even when nothing flipped", () => {
    const cache = createEventCache();
    const snapshot = makeSnapshot();
    primeEventCache(cache, snapshot);
    const { emitter, spies } = setup();

    fanOutEvents(cache, emitter, snapshot);
    fanOutEvents(cache, emitter, snapshot);
    expect(spies.change).toHaveBeenCalledTimes(2);
  });
});
