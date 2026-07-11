---
"@oh-just-another/state": patch
---

Hide the link-creation overlay entirely in read-only mode. Hovering an element no longer shows connection anchor dots, and hovering a dot no longer previews a ghost element/connector — read-only never creates links, so the whole port/ghost overlay is now gated off. Editable behaviour is unchanged.
