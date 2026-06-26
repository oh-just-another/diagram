import { defineConfig } from "vitest/config";

// The wrapper's runtime behaviour lives in `@oh-just-another/diagram` (tested
// there). This package's test compiles the `.svelte` source to prove it is a
// valid Svelte 5 component, so a plain Node environment is enough.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
  },
});
