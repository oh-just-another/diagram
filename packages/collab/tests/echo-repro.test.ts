import { afterEach, describe, expect, it } from "vitest";
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
import type { Transport } from "@oh-just-another/network";
import { SceneDoc } from "../src/scene-doc";
import { bindEditor } from "../src/bind-editor";
import { TransportProvider } from "../src/transport-provider";

/**
 * Repro harness for the collab "my drags snap back" report: two full
 * editor↔doc↔provider stacks joined by a transport pair with MANUALLY
 * pumped delivery, so frames can interleave the way real networks do
 * (peer B echoes A's state while A has already moved further).
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

/** Transport with a manual outbox: nothing reaches the peer until pumped. */
class PumpTransport implements Transport {
  peer: PumpTransport | null = null;
  readonly outbox: Uint8Array[] = [];
  private readonly handlers = new Set<(p: Uint8Array) => void>();

  send(payload: Uint8Array): void {
    this.outbox.push(payload);
  }

  /** Deliver every queued frame to the peer (draining first). */
  pump(): number {
    let delivered = 0;
    while (this.outbox.length) {
      const frame = this.outbox.shift();
      if (!frame || !this.peer) continue;
      delivered += 1;
      for (const h of this.peer.handlers) h(frame);
    }
    return delivered;
  }

  onMessage(handler: (payload: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.handlers.clear();
  }
}

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()?.();
});

const makeStack = (scene: Scene, clientID: number) => {
  const sceneDoc = new SceneDoc();
  sceneDoc.doc.clientID = clientID;
  const editor = makeEditor(scene);
  const transport = new PumpTransport();
  const provider = new TransportProvider({ doc: sceneDoc.doc, transport });
  const unbind = bindEditor(editor, sceneDoc);
  cleanup.push(() => {
    unbind();
    provider.destroy();
    editor.dispose();
  });
  return { sceneDoc, editor, transport, provider };
};

const posOf = (editor: Editor, id: string) => editor.scene.elements.get(elementId(id))?.position;

describe("provider-only pipe sanity", () => {
  it("map set on A reaches B through the pump pipe", () => {
    const da = new SceneDoc();
    const db = new SceneDoc();
    const ta = new PumpTransport();
    const tb = new PumpTransport();
    ta.peer = tb;
    tb.peer = ta;
    const pa = new TransportProvider({ doc: da.doc, transport: ta });
    const pb = new TransportProvider({ doc: db.doc, transport: tb });
    cleanup.push(() => {
      pa.destroy();
      pb.destroy();
    });
    tb.pump();
    ta.pump();
    tb.pump();

    da.elements.set("box", rect("box", 7, 7));
    ta.pump();
    expect(db.elements.get("box")?.position).toEqual({ x: 7, y: 7 });

    da.elements.set("box", rect("box", 42, 42));
    ta.pump();
    expect(db.elements.get("box")?.position).toEqual({ x: 42, y: 42 });
  });
});

describe("collab echo: peers must not re-emit remote updates as their own", () => {
  it("a peer that merely applies a remote update sends nothing back", () => {
    const a = makeStack(sceneWith(rect("box", 0, 0)), 1);
    const b = makeStack(emptyScene(), 2 ** 30);
    a.transport.peer = b.transport;
    b.transport.peer = a.transport;

    // Join handshake: B's sync request reaches A, A answers with state.
    b.transport.pump();
    a.transport.pump();
    b.transport.outbox.length = 0; // drop B's own join traffic
    expect(posOf(b.editor, "box")).toEqual({ x: 0, y: 0 });

    // A moves the box; the update reaches B.
    a.editor.setSelection([elementId("box")]);
    a.editor.moveSelectionBy({ x: 100, y: 100 });
    expect(posOf(a.editor, "box")).toEqual({ x: 100, y: 100 }); // local move landed
    a.transport.pump();
    expect(posOf(b.editor, "box")).toEqual({ x: 100, y: 100 });

    // B did nothing of its own — it must stay silent. Any frame here is
    // an echo: B re-writing A's items under B's clientID, which (higher
    // clientID) would later beat A's own concurrent writes and make A's
    // drags "snap back".
    expect(b.transport.outbox.length).toBe(0);
  });

  it("concurrent local move on A survives B's traffic (no snap-back)", () => {
    const a = makeStack(sceneWith(rect("box", 0, 0)), 1);
    const b = makeStack(emptyScene(), 2 ** 30);
    a.transport.peer = b.transport;
    b.transport.peer = a.transport;
    b.transport.pump();
    a.transport.pump();
    b.transport.pump();

    // Frame 1 of A's drag reaches B.
    a.editor.setSelection([elementId("box")]);
    a.editor.moveSelectionBy({ x: 50, y: 50 });
    a.transport.pump();

    // A keeps dragging before anything comes back...
    a.editor.moveSelectionBy({ x: 150, y: 150 });

    // ...then whatever B queued (echoes included) lands on A.
    b.transport.pump();
    a.transport.pump();
    b.transport.pump();

    expect(posOf(a.editor, "box")).toEqual({ x: 200, y: 200 });
  });
});
