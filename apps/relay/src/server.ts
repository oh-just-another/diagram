/**
 * Minimal WebSocket relay for the demo. Forwards every binary message
 * to every other socket joined to the same room.
 *
 * Protocol: rooms are addressed by URL pathname. `ws://host:1234/foo`
 * joins room `foo`. All clients on `/foo` see each other's messages;
 * nothing crosses room boundaries.
 *
 * This is intentionally not a full y-websocket implementation — we
 * already do the CRDT handshake in the browser via `TransportProvider`,
 * so the server only has to be a dumb fan-out. Single process, no
 * persistence; rooms exist as long as ≥ 1 client is connected.
 */

import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_PORT, PING_INTERVAL_MS, PORT_ENV_VAR } from "./constants.js";

const rooms = new Map<string, Set<WebSocket>>();

const join = (room: string, socket: WebSocket): void => {
  let set = rooms.get(room);
  if (!set) {
    set = new Set();
    rooms.set(room, set);
  }
  set.add(socket);
};

const leave = (room: string, socket: WebSocket): void => {
  const set = rooms.get(room);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) rooms.delete(room);
};

const broadcast = (room: string, sender: WebSocket, payload: Buffer): void => {
  const set = rooms.get(room);
  if (!set) return;
  for (const peer of set) {
    if (peer === sender) continue;
    if (peer.readyState !== peer.OPEN) continue;
    peer.send(payload);
  }
};

const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "/";
  // Normalise: strip leading slash, drop query, lowercase. Empty path → "default".
  const room = url.split("?", 1)[0]!.replace(/^\//, "").toLowerCase() || "default";

  wss.handleUpgrade(req, socket, head, (ws) => {
    join(room, ws);
    console.warn(`[relay] join "${room}" (size=${rooms.get(room)?.size ?? 0})`);

    ws.on("message", (data, isBinary) => {
      if (!isBinary) return; // ignore text frames — protocol is binary-only
      const buf = Array.isArray(data) ? Buffer.concat(data) : (data as Buffer);
      broadcast(room, ws, buf);
    });

    ws.on("close", () => {
      leave(room, ws);
      console.warn(`[relay] leave "${room}" (size=${rooms.get(room)?.size ?? 0})`);
    });

    ws.on("error", (err) => {
      console.warn(`[relay] socket error in "${room}":`, err.message);
    });
  });
});

// Keep-alive heartbeat: drops zombie connections after one missed pong.
const interval = setInterval(() => {
  for (const room of rooms.values()) {
    for (const ws of room) {
      if (ws.readyState !== ws.OPEN) continue;
      ws.ping();
    }
  }
}, PING_INTERVAL_MS);

const port = Number(process.env[PORT_ENV_VAR] ?? DEFAULT_PORT);
httpServer.listen(port, () => {
  console.warn(`[relay] listening on ws://0.0.0.0:${port}`);
  console.warn(`[relay] healthcheck:  http://0.0.0.0:${port}/healthz`);
});

const shutdown = (): void => {
  console.warn("[relay] shutting down");
  clearInterval(interval);
  for (const room of rooms.values()) {
    for (const ws of room) ws.close();
  }
  wss.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
