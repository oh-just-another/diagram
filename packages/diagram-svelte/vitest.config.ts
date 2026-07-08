import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// Two suites: `Diagram.test.ts` compiles the `.svelte` source in a plain Node
// environment to prove it is a valid Svelte 5 component, and
// `Diagram.mount.test.ts` (jsdom via `@vitest-environment` pragma) mounts the
// component for real so the wrapper's runtime wiring executes. The svelte
// plugin compiles `.svelte` imports for the mount suite.
export default defineConfig({
  plugins: [svelte()],
  // Resolve svelte's browser (client) build — without this the mount suite
  // gets the server entry, where `mount()` is unavailable.
  resolve: { conditions: ["browser"] },
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
  },
});
