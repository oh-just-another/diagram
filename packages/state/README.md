# @oh-just-another/state

Level 2 interaction layer. Owns the xstate interaction machine, normalizes DOM events, draws selection/handles on the overlay layer, and ships a high-level `Editor` class that wires a scene + main/overlay render targets + DOM events together.

Browser-only — relies on the DOM `PointerEvent` API. Depends on `@types`, `@math`, `@scene`, `@renderer-core`, and `xstate` (v5).

## Quick start

```ts
import { LayeredCanvas, installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { Editor, type Mode } from "@oh-just-another/state";
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

document.querySelector("#rect-button")!.addEventListener("click", () => {
  editor.setMode("draw-rect");
});
```

## Architecture

The interaction layer is divided into:

- **A pure xstate machine** (`interactionMachine`) that manages the _gesture_ state — what is the user doing right now? It has 5 states: `idle`, `pressing`, `draggingShape`, `draggingHandle`, `drawing`. It never modifies a scene.
- **Emit events** (`InteractionEmit`) describe what the host should do: `SELECT_REPLACE`, `SELECT_CLEAR`, `MOVE_SHAPE`, `RESIZE_SHAPE`, `CREATE_SHAPE`.
- **`Editor`** acts as the glue: it manages the scene + selection, listens for DOM pointer events, performs hit-tests, sends machine events, applies emit events to the scene using `@scene` operations, and re-renders.

This division keeps the state machine completely pure and easy to test, and allows advanced hosts to replace `Editor` if they need more control.

## API

| Name                                                                                                                                    | Purpose                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Editor` / `EditorOptions`                                                                                                              | Top-level controller. Attaches to a host element with two render targets and an initial scene. |
| `Mode` (`select` / `draw-rect` / `draw-ellipse`), `DEFAULT_MODE`                                                                        | Modes of the editor.                                                                         |
| `Selection`, `selection.*`                                                                                                              | Immutable `ReadonlySet<ShapeId>` + helpers (`single`, `add`, `remove`, `toggle`, `equals`).  |
| `HandleId`, `handlePosition`, `hitHandle`, `resizeBounds`, `HANDLE_SIZE`                                                                | Geometry of resize-handles (8 corner/edge handles, zoom-aware hit-test).                         |
| `interactionMachine`, `InteractionContext`, `InteractionEvent`, `InteractionEmit`, `PressTarget`, `DRAG_THRESHOLD`, `interpretPressEnd` | Pure xstate machine + types + helpers.                                                       |
| `renderOverlay(scene, selection, target, options?)`, `OverlayStyle`                                                                     | Draws selection outlines, handles, and drawing previews on the overlay layer.                |
| `fromPointerEvent` / `fromKeyboardEvent` / `fromWheelEvent`                                                                             | Normalizers from DOM to domain events (CSS-pixel coordinates relative to host element).        |

## Design notes

- **The machine manages gesture state, not scene state.** Selection and shapes reside in `Editor` (or your equivalent). Emit events describe intent; the host applies it. This makes the machine snapshot-testable and replayable.
- **Clicks vs drags via threshold.** A press turns into a drag once the pointer moves `DRAG_THRESHOLD` (4 px) from the press origin. Below the threshold, `POINTER_UP` results in a click effect determined by `interpretPressEnd` (SELECT_REPLACE / SELECT_CLEAR).
- **Hit-test order:** handles of currently-selected shapes take precedence over shape body hits. This aligns with how every editor behaves — once a shape is selected, clicking its handle resizes rather than re-selects.
- **Handles are screen-sized.** `hitHandle` divides the tolerance by viewport zoom so handles remain 8 × 8 CSS px regardless of zoom level.
- **DOM listeners are pointer-events** (`pointerdown` / `move` / `up` / `cancel`) with `setPointerCapture`. Touch and mouse use a single path; no separate touch handlers.

