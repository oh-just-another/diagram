export { SceneDoc } from "./scene-doc.js";
export { bindEditor } from "./bind-editor.js";
export { CollabAwareness, type Peer, type PeerUser } from "./awareness.js";
export { TransportProvider, type TransportProviderOptions } from "./transport-provider.js";
export { bindAwareness, type BindAwarenessOptions } from "./bind-awareness.js";
export { extractMentions, resolveMentions, notifyMention } from "./mentions.js";

// branch merge scaffold (interfaces only; Yjs subdoc
// implementation lands in a follow-up).
export type {
 BranchId,
 BranchMergeAPI,
 ConflictChoice,
 ConflictResolution,
 MergeConflict,
 MergeReport,
} from "./merge.js";
