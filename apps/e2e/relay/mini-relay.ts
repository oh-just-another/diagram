import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * Minimal in-process relay for e2e tests — the same wire contract the
 * production `diagram-collab` server implements: a room is the WS
 * pathname, and every binary frame is broadcast verbatim to the other
 * sockets of that room. No protocol awareness — payloads are encrypted
 * Yjs updates the relay cannot (and must not) read.
 *
 * Collab specs point the playground at it directly via `VITE_RELAY_URL`
 * (see `playwright.config.ts`), bypassing Vite's dev proxy.
 */
export const RELAY_PORT = 1234;

export interface MiniRelay {
  /** Closes the listener AND terminates every client socket. */
  readonly close: () => Promise<void>;
}

export const startMiniRelay = async (port: number = RELAY_PORT): Promise<MiniRelay> => {
  const server: Server = createServer();
  const wss = new WebSocketServer({ server });
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on("connection", (socket, request) => {
    const room = request.url ?? "/";
    let members = rooms.get(room);
    if (!members) {
      members = new Set();
      rooms.set(room, members);
    }
    members.add(socket);

    socket.on("message", (data, isBinary) => {
      if (!isBinary) return;
      for (const peer of members) {
        if (peer !== socket && peer.readyState === peer.OPEN) peer.send(data);
      }
    });
    socket.on("close", () => {
      members.delete(socket);
      if (members.size === 0) rooms.delete(room);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    close: async () => {
      // `server.close()` alone waits for clients to hang up — terminate
      // them so a "relay died" scenario is abrupt, like a real outage.
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          server.close((serverErr) => {
            if (serverErr) reject(serverErr);
            else resolve();
          });
        });
      });
    },
  };
};
