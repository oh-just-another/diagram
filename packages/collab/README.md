# @oh-just-another/collab

Real-time collaboration on `@oh-just-another/scene` documents — Yjs CRDT binding for the scene + awareness (presence) for cursors and peer lists. Pair with a `@oh-just-another/network` transport (BroadcastChannel for tabs, WebSocket for cross-machine).

## Install

```bash
pnpm add @oh-just-another/collab
```

Direct deps: `yjs` and `y-protocols`.

## Quick start

Same-tab demo (e.g. for testing):

```ts
import * as Y from "yjs";
import { Editor } from "@oh-just-another/state";
import { BroadcastChannelTransport } from "@oh-just-another/network";
import { SceneDoc, CollabAwareness, TransportProvider, bindEditor } from "@oh-just-another/collab";

const doc = new Y.Doc();
const sceneDoc = new SceneDoc(doc);
const awareness = new CollabAwareness(doc);
awareness.updateLocal({ user: { id: "me", name: "Alice", color: "#1a73e8" } });

const transport = new BroadcastChannelTransport("room-foo");
const provider = new TransportProvider({ doc, transport, awareness: awareness.awareness });

const unbind = bindEditor(editor, sceneDoc);
// …later
unbind();
provider.destroy();
awareness.destroy();
transport.close();
doc.destroy();
```

## API

| Name                                                | Purpose                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SceneDoc(doc?)`                                    | Wraps `Y.Doc` exposing `shapes` / `edges` / `layers` / `viewport` maps. `snapshot()`, `replace(scene)`, `applyDelta(...)`. |
| `bindEditor(editor, sceneDoc)`                      | Wire an `Editor` to a `SceneDoc`. Returns unbind.                                                                          |
| `CollabAwareness(doc)`                              | Typed wrapper over `y-protocols/awareness`: `updateLocal`, `getPeers` / `getOthers` / `onPeers`.                           |
| `Peer`, `PeerUser`                                  | Public types for presence payload.                                                                                         |
| `TransportProvider({ doc, transport, awareness? })` | Bridge `Y.Doc` (+ awareness) onto a `Transport`. Multiplexes doc / awareness / sync-request over one channel.              |

## Design notes

- **CRDT as the source of truth.** `SceneDoc.snapshot()` rebuilds a typed `Scene` from `Y.Map`s on demand. We don't try to incrementally patch the local scene from individual Yjs events — `editor.loadScene(snapshot)` after every remote update is simpler and within budget for typical scene sizes.
- **`Y.Map<id, Shape>` per kind**, not nested `Y.Map`s. Concurrent edits to different ids merge under classic CRDT last-writer-wins semantics. Per-shape conflict resolution (two peers editing the same shape) is also LWW today — fine for editor UX where one peer's drag obviously stops the moment the other commits.
- **Undo history dropped on remote updates (MVP).** `editor.history` is a linear local stack; CRDT-style multi-author undo needs a `Y.UndoManager`-backed history. Promoted to a follow-up phase.
- **Self-origin filter on Yjs transactions.** `bindEditor` tags its own writes so the `update` listener doesn't ricochet — without it every keystroke would flicker through `loadScene`.
- **Transport-agnostic.** The same `SceneDoc` works behind BroadcastChannel (same-origin tabs) or WebSocket (any server speaking y-protocols). Sharded WebRTC / WebTransport implementations slot in without touching the binding.
- **Single-tag wire format.** `TransportProvider` prepends one byte to every message: `0x00` doc / `0x01` awareness / `0x02` sync-request. Lets us multiplex over a single binary channel without a separate signalling layer.

