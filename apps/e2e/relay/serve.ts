import { RELAY_PORT, startMiniRelay } from "./mini-relay.js";

/**
 * Manual runner for the e2e mini-relay: `pnpm --filter @oh-just-another/e2e
 * relay`. Useful for hand-testing collab flows (including killing and
 * restarting the relay) without a `diagram-collab` checkout.
 */
const port = Number(process.env.PORT ?? RELAY_PORT);
await startMiniRelay(port);
// eslint-disable-next-line no-console -- CLI runner: the address line IS the UI.
console.log(`mini-relay listening on ws://127.0.0.1:${String(port)} — Ctrl+C to stop`);
