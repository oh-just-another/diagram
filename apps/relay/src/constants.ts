/**
 * Tunable constants for the WebSocket relay server.
 */

/** Default TCP port. Overridable via `RELAY_PORT` env. */
export const DEFAULT_PORT = 1234;

/** Name of the env var read at boot to override the port. */
export const PORT_ENV_VAR = "RELAY_PORT";

/**
 * Heartbeat interval in ms. Server sends a `ping` to every connected
 * socket on this cadence so reverse proxies / load balancers don't
 * idle-drop the connection. 30 s is the standard ALB / nginx default.
 */
export const PING_INTERVAL_MS = 30_000;
