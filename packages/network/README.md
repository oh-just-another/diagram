# @oh-just-another/network

Backend-neutral binary transport for collaborative editing. Used by `@oh-just-another/collab` to ferry Yjs / awareness messages between peers, but the interface is general enough for any structured-clone payload.

## Install

```bash
pnpm add @oh-just-another/network
```

No runtime dependencies. `BroadcastChannel` and `WebSocket` are read from `globalThis`; tests / Node hosts can inject their own implementations.

## Quick start

```ts
import { BroadcastChannelTransport } from "@oh-just-another/network";

const transport = new BroadcastChannelTransport("editor-room");
const off = transport.onMessage((bytes) => console.log("got", bytes));
transport.send(new Uint8Array([1, 2, 3]));
// …later
off();
transport.close();
```

## API

| Name                                | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `Transport`                         | `send(Uint8Array)` / `onMessage(handler) → unsubscribe` / `close()`.              |
| `BroadcastChannelTransport(name)`   | Same-origin tabs / iframes / workers via the native `BroadcastChannel` API.       |
| `WebSocketTransport(url, options?)` | Wraps a `WebSocket` connection with lazy buffer, auto-reconnect, injectable impl. |

## Design notes

- **Binary-only payload.** No JSON, no envelopes. The collab layer adds a single tag byte to multiplex `doc` / `awareness` / `sync-request` messages; everything else is just bytes.
- **No reconnect logic in the broadcast channel.** Browser keeps the channel alive for the page lifetime; we don't need it.
- **WebSocket auto-reconnect with exponential backoff** capped at 30 s. Buffered sends are flushed on `open`. `close()` is final — no further reconnect attempts.
- **`webSocketImpl` injection.** Lets the package run in Node (e.g. with `ws`) and lets tests use a stub without touching the global `WebSocket`.
