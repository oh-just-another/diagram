#!/usr/bin/env node
// Note: `.js` extension is required for Node's ESM resolver (which is what
// runs the built bin). TypeScript with `moduleResolution: bundler` is happy
// with the explicit extension, and source files keep their `.ts` extension
// on disk.
import { run } from "./run.js";

run(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`diagram: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
