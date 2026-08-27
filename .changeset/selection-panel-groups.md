---
"@oh-just-another/react-ui": patch
---

The selection toolbar groups its controls (`.du-sel-group`) and draws separators in CSS only between non-empty groups — no more doubled or stray dividers when an optional cluster (label text, crop, …) renders nothing for the selection. The `.du-sel-divider` element is gone.
