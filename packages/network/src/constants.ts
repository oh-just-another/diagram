/**
 * Tunable defaults for the network transports.
 */

/**
 * First reconnect delay after a `WebSocketTransport` drops, in ms. The
 * delay doubles ({@link RECONNECT_BACKOFF_FACTOR}) on each failed retry
 * up to {@link DEFAULT_MAX_RECONNECT_DELAY_MS}. Override per-transport
 * via `WebSocketTransportOptions.initialReconnectDelay`. Range: a few
 * hundred ms (snappy on flaky links) to a couple of seconds (gentler on
 * a struggling server).
 */
export const DEFAULT_INITIAL_RECONNECT_DELAY_MS = 500;

/**
 * Upper bound on the reconnect backoff, in ms. The delay never grows
 * past this so a long outage still retries about twice a minute.
 * Override via `WebSocketTransportOptions.maxReconnectDelay`.
 */
export const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Multiplier applied to the reconnect delay after each failed attempt
 * (exponential backoff). 2 doubles the wait each time; lower values
 * retry more aggressively, higher values back off faster.
 */
export const RECONNECT_BACKOFF_FACTOR = 2;
