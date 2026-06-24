import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The editor loads its WASM / worker assets via `new URL(..., import.meta.url)`,
// which Vite resolves and serves out of the box — no extra config needed.
export default defineConfig({
  plugins: [react()],
});
