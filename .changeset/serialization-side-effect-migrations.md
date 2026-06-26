---
"@oh-just-another/serialization": patch
---

Mark `migrations-builtin` as having side effects so tree-shaking bundlers keep the built-in scene migrations. Previously a `sideEffects: false` package flag let aggressive bundlers drop the migration registration, so an older scene document wouldn't upgrade on load.
