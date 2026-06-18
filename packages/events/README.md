# @oh-just-another/events

L0 typed event emitter. Pure TS — no DOM, no React, no Node API. Underpins the pub/sub in `Editor` / `History` / `Collab`.

No runtime dependencies.

## Install

```bash
pnpm add @oh-just-another/events
```

## Usage

```ts
import { createEmitter, type Emitter } from "@oh-just-another/events";

interface EditorEvents {
  mode: (mode: "select" | "draw") => void;
  change: () => void;
}

const emitter: Emitter<EditorEvents> = createEmitter<EditorEvents>();

const off = emitter.on("mode", (m) => console.log(m)); // m inferred as "select" | "draw"
emitter.emit("mode", "select"); // payload is typechecked, returns listener count
off(); // unsubscribe
```

## Behaviour

- `on(event, fn)` returns an idempotent unsubscribe function.
- `emit(event, ...args)` calls every listener synchronously and returns how many ran. Listeners are snapshotted first, so `on` / `off` from inside a listener take effect on the next emit.
- A listener exception does not abort the loop: remaining listeners still run, and the first error is re-thrown afterwards (mirrors DOM `EventTarget`).
- `off`, `clear(event?)`, `listenerCount(event)` round out the surface.

## Exports

| Name            | Kind     | Notes                                                                        |
| --------------- | -------- | ---------------------------------------------------------------------------- |
| `createEmitter` | function | `<E>() => Emitter<E>`. Creates a fresh typed emitter.                        |
| `Emitter`       | type     | The pub/sub interface: `on` / `off` / `emit` / `clear` / `listenerCount`.    |
| `EventMap`      | type     | Conventional event-map shape (`Record<string, listener>`). Not a constraint. |
