---
"@oh-just-another/diagram": patch
---

Fix: a `scene` assigned to `<oja-diagram>` before the editor finished mounting was silently dropped — the imperative API didn't exist yet, so the scene was only stashed and the editor seeded from an empty state. It's now applied via the live engine in the `ready` handler, so framework wrappers (and any host) restoring a persisted scene on mount actually see it after a reload instead of an empty canvas.
