import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { SceneDoc } from "../src/scene-doc";
import { bindEditor } from "../src/bind-editor";

/**
 * `bindEditor` wires a real `Editor` to a `SceneDoc`. The Editor kernel is
 * DOM-free at this layer: it only needs a host element stub and no-op render
 * targets, so the whole binding (seed/adopt handshake, scene→doc and
 * doc→scene sync, self-origin filtering, dispose) is exercisable in `node`
 * without a browser. The harness below mirrors `packages/state` tests.
 */

const noop = (): undefined => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const makeHost = (): HTMLElement =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 40,
  height: 30,
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const el of elements) s = addElement(s, el).scene;
  return s;
};

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const cleanup: (() => void)[] = [];
const track = <T extends { dispose?: () => void; destroy?: () => void }>(x: T): T => {
  cleanup.push(() => {
    x.dispose?.();
    x.destroy?.();
  });
  return x;
};

afterEach(() => {
  while (cleanup.length) cleanup.pop()?.();
  vi.useRealTimers();
});

describe("bindEditor — initial handshake", () => {
  it("seeds the empty CRDT from the editor scene (waitMs = 0)", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc);

    expect(doc.elements.size).toBe(1);
    expect(doc.snapshot().elements.has(elementId("a"))).toBe(true);
    unbind();
  });

  it("adopts the CRDT scene when the doc is already populated", () => {
    // Doc already carries shape "remote"; editor starts with shape "local".
    const doc = new SceneDoc();
    doc.replace(sceneWith(rect("remote")));

    const editor = track(makeEditor(sceneWith(rect("local"))));
    const unbind = bindEditor(editor, doc);

    // Editor adopts the room state, dropping its own seed shape.
    expect(editor.scene.elements.has(elementId("remote"))).toBe(true);
    expect(editor.scene.elements.has(elementId("local"))).toBe(false);
    // Adopt path (no waitMs) clears history — fresh loadScene.
    unbind();
  });

  it("wraps a raw Y.Doc when given one instead of a SceneDoc", () => {
    const ydoc = new Y.Doc();
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const unbind = bindEditor(editor, ydoc);

    // The wrapping SceneDoc seeded the raw doc.
    expect(ydoc.getMap("elements").size).toBe(1);
    unbind();
    ydoc.destroy();
  });
});

describe("bindEditor — scene → doc", () => {
  it("ships local editor mutations into the CRDT", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc);
    expect(doc.elements.size).toBe(1);

    editor.addElement(rect("b", 50, 50));

    expect(doc.elements.size).toBe(2);
    expect(doc.snapshot().elements.has(elementId("b"))).toBe(true);
    unbind();
  });

  it("does not re-sync when the scene identity is unchanged", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc);

    let updates = 0;
    doc.doc.on("update", () => {
      updates += 1;
    });
    // Notify without changing the scene object identity (selectAll only
    // touches selection, leaving `editor.scene` the same reference).
    editor.selectAll();

    expect(updates).toBe(0);
    unbind();
  });
});

describe("bindEditor — doc → scene", () => {
  it("feeds remote CRDT updates back into the editor", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const local = new SceneDoc();
    const unbind = bindEditor(editor, local);

    // A peer doc connected to the same room delivers an update.
    const remote = new SceneDoc();
    Y.applyUpdate(remote.doc, Y.encodeStateAsUpdate(local.doc));
    remote.doc.on("update", (u) => {
      Y.applyUpdate(local.doc, u);
    });

    remote.applyDelta(remote.snapshot(), sceneWith(rect("a"), rect("c", 80, 80)));

    expect(editor.scene.elements.has(elementId("c"))).toBe(true);
    unbind();
  });

  it("ignores self-origin updates (no double-apply / feedback loop)", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc);

    const loadSpy = vi.spyOn(editor, "loadScene");
    // A local mutation produces a self-origin doc update; onUpdate must skip it.
    editor.addElement(rect("b"));

    expect(loadSpy).not.toHaveBeenCalled();
    // And the editor still holds exactly its own edit.
    expect(editor.scene.elements.has(elementId("b"))).toBe(true);
    loadSpy.mockRestore();
    unbind();
  });
});

describe("bindEditor — dispose", () => {
  it("stops scene → doc propagation after unbind", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc);
    expect(doc.elements.size).toBe(1);

    unbind();
    editor.addElement(rect("b"));

    expect(doc.elements.size).toBe(1); // "b" never reached the doc.
  });

  it("stops doc → scene propagation after unbind", () => {
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const local = new SceneDoc();
    const unbind = bindEditor(editor, local);

    unbind();
    const loadSpy = vi.spyOn(editor, "loadScene");

    // External update lands after dispose — must be ignored.
    const foreign = new Y.Doc();
    const foreignScene = new SceneDoc(foreign);
    foreignScene.replace(sceneWith(rect("z")));
    Y.applyUpdate(local.doc, Y.encodeStateAsUpdate(foreign));

    expect(loadSpy).not.toHaveBeenCalled();
    expect(editor.scene.elements.has(elementId("z"))).toBe(false);
    loadSpy.mockRestore();
    foreign.destroy();
  });
});

describe("bindEditor — waitForSyncMs handshake", () => {
  it("seeds from the editor when the wait window elapses with no peer answer", () => {
    vi.useFakeTimers();
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc, { waitForSyncMs: 200 });

    // Nothing seeded yet — we are waiting for a peer.
    expect(doc.elements.size).toBe(0);

    vi.advanceTimersByTime(200);

    // Timeout fired, doc still empty → seed from editor.
    expect(doc.elements.size).toBe(1);
    expect(doc.snapshot().elements.has(elementId("a"))).toBe(true);
    unbind();
  });

  it("adopts a peer update that arrives inside the wait window (no seed)", () => {
    vi.useFakeTimers();
    const editor = track(makeEditor(sceneWith(rect("local"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc, { waitForSyncMs: 200 });

    // A peer answers before the timeout: deliver remote state into the doc.
    const remote = new SceneDoc();
    remote.replace(sceneWith(rect("remote")));
    Y.applyUpdate(doc.doc, Y.encodeStateAsUpdate(remote.doc));

    // onUpdate adopted the room scene already.
    expect(editor.scene.elements.has(elementId("remote"))).toBe(true);
    expect(editor.scene.elements.has(elementId("local"))).toBe(false);

    // When the timer fires the doc is no longer empty → no clobbering seed.
    vi.advanceTimersByTime(200);
    expect(editor.scene.elements.has(elementId("remote"))).toBe(true);
    expect(editor.scene.elements.has(elementId("local"))).toBe(false);
    unbind();
  });

  it("clears the pending timer on dispose so no late seed fires", () => {
    vi.useFakeTimers();
    const editor = track(makeEditor(sceneWith(rect("a"))));
    const doc = new SceneDoc();
    const unbind = bindEditor(editor, doc, { waitForSyncMs: 200 });

    expect(doc.elements.size).toBe(0);
    unbind();
    vi.advanceTimersByTime(200);

    // Disposed before the timer → never seeded.
    expect(doc.elements.size).toBe(0);
  });
});
