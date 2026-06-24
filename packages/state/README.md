# @oh-just-another/state

Interactive editor engine: tools, modes, selection, history, and hit-testing over a Scene.

The L2 interaction layer. It wires a Scene together with render targets and high-level operations into an `Editor` controller — framework-agnostic, with no React dependency. Depends on `@oh-just-another/types`, `@oh-just-another/math`, `@oh-just-another/scene`, `@oh-just-another/renderer-core`, `@oh-just-another/history`, `@oh-just-another/events`, `@oh-just-another/tokens`, and `xstate` (v5). Hosts feed it normalized pointer/keyboard/wheel events; it never imports the DOM directly.

## Quick start

```ts
import { LayeredCanvas, installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { Editor } from "@oh-just-another/state";
import { emptyScene } from "@oh-just-another/scene";

installBuiltinRenderers();

const host = document.getElementById("stage")!;
const layered = new LayeredCanvas(host, 1000, 600);

const editor = new Editor({
  host,
  mainTarget: layered.get("main"),
  overlayTarget: layered.get("overlay"),
  initialScene: emptyScene(),
  initialMode: "select",
});

editor.subscribe(() => render());
editor.setMode("draw-rect");
```

## Concepts

### `Editor`

The centerpiece controller (`Editor`, `EditorOptions`, `LoadSceneOptions`). It owns the scene, selection, and viewport, and exposes a high-level API spanning:

- **Tools / modes** — `mode`, `setMode`, `toolLocked` / `setToolLocked` (sticky tool).
- **Selection** — `selection`, `selectAll`, `deleteSelected`, `moveSelectionBy`, `focusCycle`, plus link selection (`selectedLinks`, `selectedLink`).
- **History** — `undo`, `redo`, `canUndo`, `canRedo`, `history` (backed by `@oh-just-another/history`).
- **Hit-testing** — `hitTest(worldPoint)` returns a `PressTarget`; `hitAnnotation`.
- **Viewport / camera** — `panBy`, `zoomIn`, `zoomOut`, `zoomAt`, `zoomToFit`, `zoomToSelection`, `setViewportSize`, `screenToWorld`; grid via `gridEnabled`, `setGridVisible`, `toggleGrid`.
- **Z-order** — `bringToFront`, `sendToBack`.
- **Grouping / arrange** — `groupSelected`, `ungroup`, `expandSelectionWithDescendants`, `arrangeAsGrid`, `arrangeAsStack`.
- **Containers / frames** — frame membership reconciliation; `beginFrameNameEdit`, `commitFrameNameEdit`, `cancelFrameNameEdit`.
- **Link / edge editing** — link routing, endpoint anchors, `linkPreviewPath`, `linkAttachTarget`, `beginLinkCaptionEdit`, `commitLinkCaptionEdit`, `cancelLinkCaptionEdit`, `linkLabelWorld`.
- **Text editing** — inline caret/selection model: `beginTextEdit`, `commitTextEdit`, `cancelTextEdit`, `setEditingText`, `setTextCaretFromPoint`, `extendTextSelectionToPoint`, `caretIndexAtWorldPoint`, `editingTextOverlay`, plus `createTextAt`.
- **Image / file insert** — `insertImage`, `addElement`, `beginPlacement`, and a `FileDropRegistry` (see below).
- **GIF / animation playback** — `togglePlayback`, `hoverAnimatedElement`, `isPlaybackPaused`.
- **Brush strokes** — `beginBrushStroke`, `extendBrushStroke`, `commitBrushStroke`, `cancelBrushStroke`, `pendingBrushStroke`.
- **Annotations / comments** — `addAnnotation`, `removeAnnotation`, `toggleAnnotationResolved`, `addComment`, `removeComment`, `setSelectedAnnotation`, `setCommentAuthor`.
- **Scene lifecycle** — `scene`, `loadScene`.

Subscribe via `editor.subscribe(fn)` (coarse-grained) or the typed `EditorEvents` surface (`change`, `mode`, `selection`, `scene`, `history`, `viewport`).

### Modes

`Mode` and `DEFAULT_MODE` (`select`). The active mode dictates how a pointer-down is interpreted:

`select` · `hand` (pan) · `draw-rect` · `draw-ellipse` · `draw-text` · `draw-edge` · `draw-frame` · `brush`.

Pan and zoom remain available as gestures (middle-mouse / Space+drag / wheel) regardless of mode.

### Actions

A command registry for editor operations and their hotkeys:

- `ActionRegistry`, `defaultActionRegistry`, `registerBuiltinActions`, and types `Action`, `ActionCategory`, `ActionContext`, `HotkeyMatcher`.
- Predicates `hasSelection`, `hasSelectionOrLink`.
- Built-ins are exported both as bundles and individually so hosts can replace or compose them: history (`actionUndo`, `actionRedo`, `historyActions`), selection (`actionSelectAll`, `actionDeleteSelection`, `actionDuplicateSelection`, `selectionActions`), clipboard (`actionCopy`, `actionCut`, `actionPaste`, `clipboardActions`), z-order (`actionBringToFront`, `actionSendToBack`, `zOrderActions`), grouping (`actionGroupSelection`, `actionUngroupSelection`, `groupingActions`), zoom (`actionZoomIn`, `actionZoomOut`, `actionZoomReset`, `actionZoomToFit`, `zoomActions`), and modes (`actionModeSelect` … `actionModeFrame`, `actionToggleToolLock`, `actionCancel`, `modeActions`).

### Interaction machine

A pure xstate machine (`interactionMachine`) tracks gesture state and emits intent: `InteractionContext`, `InteractionEvent`, `InteractionEmit`, `PressTarget`, the pointer/mode event types, `interpretPressEnd`, `boundsFromPoints`, and `DRAG_THRESHOLD`. It never mutates a scene — emit events describe what the host should apply.

### Selection & handles

- `Selection` type plus the `selection.*` namespace of immutable-set helpers.
- Resize handles: `HandleId`, `ALL_HANDLES`, `HANDLE_SIZE`, `handlePosition`, `hitHandle`, `resizeBounds` (8 zoom-aware corner/edge handles).

### Overlay & peers

`renderOverlay`, `OverlayStyle`, `DEFAULT_OVERLAY_STYLE` draw selection outlines, handles, and drawing previews. Collaborative cursors/selections via `PeerCursor`, `PeerSelection`, `Editor.setPeerCursors` / `setPeerSelections`, and `PEER_CURSOR_BROADCAST_INTERVAL_MS`.

### Interactive hit-test registry

`registerInteractiveHitTester` / `getInteractiveHitTester` (`InteractiveHitTester`) — an extension point for hit-testing interactive element kinds without the engine knowing their internals.

### File-drop registry

`FileDropRegistry` with `FileDropHandler`, `FileDropContext`, `WalkOptions`, plus helpers: `IMAGE_MIME_TYPES`, `VIDEO_MIME_TYPES`, `isImageFile`, `isVideoFile`, `isSceneJsonFile`, `readFileAsDataURL`, `readFileAsText`, `walkDataTransfer`. Hosts register handlers for images, scene JSON, or custom payloads.

### DOM event normalizers

`fromPointerEvent`, `fromKeyboardEvent`, `fromWheelEvent`, `isEditableTarget` — translate raw DOM events into host-side CSS-pixel domain events. Optional: the engine accepts the normalized shapes regardless of source.

### Platform detection

`isMac`, `isWindows`, `isAndroid`, `isIOS`, `isLinux`, `isFirefox`, `isSafari`, `CTRL_OR_CMD_KEY`, `getDevicePixelRatio`, and the hotkey pretty-printers `formatHotkey`, `formatHotkeyParts` (`PrettyHotkeyDesc`).

### Annotation re-exports

`Annotation` and `Comment` types are re-exported from `@oh-just-another/scene` so hosts wiring `addAnnotation` / `addComment` don't need a direct scene dependency for the data shapes. `normalizeHref` / `safeHref` sanitize link hrefs.

## Design notes

- **The machine owns gesture state, not scene state.** Selection and elements live in `Editor`; emit events describe intent and the host applies it, keeping the machine snapshot-testable.
- **Clicks vs drags via threshold.** A press becomes a drag once the pointer travels `DRAG_THRESHOLD` from the press origin; below it, the press resolves to a click effect via `interpretPressEnd`.
- **Handles are screen-sized.** `hitHandle` divides tolerance by viewport zoom so handles stay a fixed CSS size at any zoom.
- **Framework-agnostic.** No React, and no direct DOM access in the engine — hosts feed normalized events and own mounting. See [ohjustanother.site](https://ohjustanother.site).
