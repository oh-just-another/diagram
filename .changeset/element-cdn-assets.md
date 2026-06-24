---
"@oh-just-another/element": minor
---

The `./global` CDN bundle now ships full-quality rendering instead of the JS / main-thread fallback. `build:cdn` emits the offscreen render worker as its own bundle (`dist/render-worker.js`) and copies the WASM (`wasm/`) and font (`fonts/`) assets to the package root, where the editor's `new URL("../wasm/…" | "../fonts/…", import.meta.url)` and `new Worker(new URL("./render-worker.js", import.meta.url))` references resolve at runtime. Serving the whole published package from a CDN (unpkg / jsDelivr) gives `<script type="module">` users WASM text-shaping, the bundled fonts and worker offloading. The assets are listed in `files` so they publish; missing assets still degrade gracefully.
