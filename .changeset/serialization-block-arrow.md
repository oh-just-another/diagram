---
"@oh-just-another/serialization": patch
---

Accept `lineKind` / `blockArrow` link fields in the wire schema. Scenes saved with a block-arrow connector previously failed strict validation on load and were dropped by hosts as unparseable.
