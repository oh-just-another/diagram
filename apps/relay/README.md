# @oh-just-another/relay

Minimal WebSocket-relay for collaboration demo. Forwards binary frames between clients in the same room (room = URL pathname).

The demo uses it as an optional transport instead of `BroadcastChannel` to make collaboration work between different machines / browsers / profiles. For same-tab collaboration, BroadcastChannel remains faster and does not require a server.

## Running

```bash
# Development (via tsx, restarts on ctrl+c)
pnpm --filter @oh-just-another/relay dev

# Production
pnpm --filter @oh-just-another/relay build
pnpm --filter @oh-just-another/relay start
```

Listens on `ws://0.0.0.0:1234` by default. Healthcheck — `GET /healthz` → `200 ok`.

Override port:

```bash
RELAY_PORT=8080 pnpm --filter @oh-just-another/relay dev
```

## Usage from demo

In the demo URL:

```
http://localhost:5173/?room=foo&relay=ws://localhost:1234
```

Without the `relay` parameter, the demo falls back to `BroadcastChannel`.

## Protocol

- Binary frames are forwarded to all room participants **except the sender**.
- Text frames are ignored (no use case).
- Room = pathname (`/foo` → room `foo`). Empty → `default`.
- No persistence — rooms live as long as there is ≥ 1 client.

## This is not y-websocket

`apps/relay` intentionally does not implement the sync-protocol of y-websocket. CRDT handshake is already done on the client via `@network.WebSocketTransport` + `@collab.TransportProvider`. The server remains a dumb fan-out.

If you need production-grade y-websocket with persistence / auth — replace `apps/relay` with the standard [`y-websocket`](https://github.com/yjs/y-websocket) server (our `WebSocketTransport` is compatible by wire format).
