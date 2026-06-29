# @oh-just-another/collab

[![npm version](https://img.shields.io/npm/v/@oh-just-another/collab.svg)](https://www.npmjs.com/package/@oh-just-another/collab)

CRDT collaboration layer for `@oh-just-another/scene` documents.

Real-time multi-peer editing built on Yjs (L4): a CRDT-backed scene mirror, presence/awareness for cursors and selections, mentions, branch-and-merge, CRDT-aware undo, and client-side encryption. Pair with a `@oh-just-another/network` transport (BroadcastChannel for tabs, WebSocket for cross-machine).

## Install

```bash
pnpm add @oh-just-another/collab
```

Peer deps: `yjs` and `y-protocols`.

## Quick start

```ts
import * as Y from "yjs";
import { Editor } from "@oh-just-another/state";
import { BroadcastChannelTransport } from "@oh-just-another/network";
import {
  SceneDoc,
  CollabAwareness,
  TransportProvider,
  bindEditor,
  bindAwareness,
} from "@oh-just-another/collab";

const doc = new Y.Doc();
const sceneDoc = new SceneDoc(doc);
const awareness = new CollabAwareness(doc);

const transport = new BroadcastChannelTransport("room-foo");
const provider = new TransportProvider({ doc, transport, awareness: awareness.awareness });

const unbindScene = bindEditor(editor, sceneDoc);
const unbindPresence = bindAwareness(editor, awareness, {
  user: { id: "me", name: "Alice", color: "#1a73e8" },
});

// …later
unbindPresence();
unbindScene();
provider.destroy();
awareness.destroy();
transport.close();
doc.destroy();
```

## API

### Document & transport

| Name                                                | Purpose                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SceneDoc(doc?)`                                    | CRDT-backed scene mirror over a `Y.Doc`: `elements` / `links` / `layers` / `annotations` / `viewport` maps. `snapshot()`, `replace(scene)`, `applyDelta(...)`. |
| `bindEditor(editor, sceneDoc)`                      | Wire an `Editor` to a `SceneDoc`. Self-origin filtered. Returns an unbind function.                                                                            |
| `TransportProvider({ doc, transport, awareness? })` | Bridge `Y.Doc` (+ optional awareness) onto a `Transport`. Multiplexes doc / awareness / sync-request over one channel via a 1-byte tag.                        |
| `TransportProviderOptions`                          | Options type for the provider constructor.                                                                                                                     |

### Awareness (presence)

| Name                                     | Purpose                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CollabAwareness(doc)`                   | Typed wrapper over `y-protocols/awareness`: `updateLocal`, `getPeers` / `getOthers` / `onPeers`, `clientId`.                                                  |
| `bindAwareness(editor, awareness, opts)` | Publish local user / cursor / selection into awareness (throttled) and paint peer cursors + selection halos back into the editor. Returns an unbind function. |
| `BindAwarenessOptions`                   | `{ user: PeerUser; cursorThrottleMs?: number }`.                                                                                                              |
| `Peer`, `PeerUser`                       | Presence payload types (clientId, user identity, cursor, selection, free-form `extra`).                                                                       |

### Mentions

| Name                                | Purpose                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `extractMentions(body)`             | Pull `@handle` tokens out of a comment body (lowercased, e-mail-safe).                                      |
| `resolveMentions(mentions, peers)`  | Match tokens against the peer list by display name; deduped `Peer[]`.                                       |
| `notifyMention(Notification, opts)` | Fire a browser `Notification` when the local user is mentioned. No-op outside the browser / unless granted. |

### Branch & merge

| Name                 | Purpose                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BranchDoc(doc?)`    | Named branches as Yjs subdocs of one parent doc. `ensureRoot`, `createBranch`, `sceneDocFor`, `mergeBranch`, `applyConflictResolution`, `commitMerge`. Implements `BranchMergeAPI`. |
| `BranchMergeAPI`     | Editor-facing branch/merge contract (`branchToDoc`, `mergeBranch`, `applyConflictResolution`).                                                                                      |
| `BranchId`           | `{ id, name, parentVersionId }`.                                                                                                                                                    |
| `MergeReport`        | Three-way merge result: `applied`, `conflicts`, `autoMerged` scene.                                                                                                                 |
| `MergeConflict`      | Per-element conflict: `base` / `source` / `target` values.                                                                                                                          |
| `ConflictChoice`     | `"ours" \| "theirs" \| "both"`.                                                                                                                                                     |
| `ConflictResolution` | `{ elementId, choice }` — a user's resolution from the merge UI.                                                                                                                    |

### History

| Name                             | Purpose                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CollabHistory(sceneDoc, opts?)` | CRDT-aware `HistoryProvider` backed by `Y.UndoManager`. Scopes undo/redo to the local client and emits coalesced patches to peers. Pass as `Editor`'s `history`. |
| `CollabHistoryOptions`           | `{ captureLimit?: number; captureTimeout?: number }` (transaction coalescing window).                                                                            |

### Encryption

| Name                                    | Purpose                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `generateRoomKey()`                     | Mint `{ roomId, keyBase64, key }` for a new session via WebCrypto.                                    |
| `importRoomKey(keyBase64)`              | Re-import an AES key parsed from an invite URL fragment. Throws on bad length / base64.               |
| `EncryptedTransport(inner, key, opts?)` | Wrap any `Transport` so payloads are AES-GCM encrypted/decrypted; a blind relay sees only ciphertext. |
| `RoomCredentials`                       | Result type of `generateRoomKey`.                                                                     |

### Constants

| Name                  | Value | Meaning                                         |
| --------------------- | ----- | ----------------------------------------------- |
| `ROOM_ID_BYTES`       | `10`  | Public room id length in bytes (20-hex string). |
| `ENCRYPTION_KEY_BITS` | `128` | AES-GCM session-key length in bits.             |
| `ENCRYPTION_IV_BYTES` | `12`  | AES-GCM initialisation-vector length in bytes.  |

## Design notes

- **CRDT as the source of truth.** `SceneDoc.snapshot()` rebuilds a typed `Scene` from the `Y.Map`s on demand. Rather than incrementally patching the local scene from individual Yjs events, `editor.loadScene(snapshot)` runs after each remote update — simpler and within budget for typical scene sizes.
- **`Y.Map<id, value>` per kind.** Concurrent edits to different ids merge under last-writer-wins. Same-id conflicts are also LWW today — fine for editor UX where one peer's drag stops the moment the other commits.
- **Self-origin filter.** `bindEditor` and `CollabHistory` tag their own writes so the `update` listener doesn't ricochet through `loadScene`.
- **Local-scoped undo.** `CollabHistory` tracks only the local origin in `Y.UndoManager`, so undo affects this client's changes — not a peer's. The rewind diff is emitted to peers as one coalesced patch through the same `applyDelta` path `bindEditor` uses.
- **Branches as subdocs.** Each branch is an independent Yjs subdoc that loads/unloads on demand and replicates over the same provider. Merges are three-way against the source branch's stored ancestor; conflicts wait for host resolution.
- **Blind-relay encryption.** The AES key lives in the URL fragment, which the browser never transmits — including on the WebSocket upgrade — so the relay routes by `roomId` without ever seeing plaintext. Random IV per frame; tampered frames fail the auth tag and are dropped.
- **Single-tag wire format.** `TransportProvider` prepends one byte per message: `0x00` doc / `0x01` awareness / `0x02` sync-request — multiplexing over a single binary channel without a separate signalling layer.

See [ohjustanother.site](https://ohjustanother.site) for the full docs.
