export { SceneDoc } from "./scene-doc.js";
export { bindEditor } from "./bind-editor.js";
export { CollabAwareness, type Peer, type PeerUser } from "./awareness.js";
export { TransportProvider, type TransportProviderOptions } from "./transport-provider.js";
export { bindAwareness, type BindAwarenessOptions } from "./bind-awareness.js";
export { extractMentions, resolveMentions, notifyMention } from "./mentions.js";

// Branch merge.
export type {
  BranchId,
  BranchMergeAPI,
  ConflictChoice,
  ConflictResolution,
  MergeConflict,
  MergeReport,
} from "./merge.js";
export { BranchDoc } from "./branch-doc.js";

// Y.UndoManager-based history backend.
export { YjsHistory, type YjsHistoryOptions } from "./yjs-history.js";

// Client-side AES-GCM for blind-relay collab.
export {
  generateRoomKey,
  importRoomKey,
  EncryptedTransport,
  type RoomCredentials,
} from "./encryption.js";
export {
  ROOM_ID_BYTES,
  ENCRYPTION_KEY_BITS,
  ENCRYPTION_IV_BYTES,
} from "./constants.js";
