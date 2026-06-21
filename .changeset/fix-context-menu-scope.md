---
"@oh-just-another/react-ui": patch
---

Open the context menu solely from the editor's gesture channel
(`editor.onLongPress`, fired by a clean right-click or touch long-press and
scoped to the editor host) instead of a separate `contextmenu` DOM listener.
The old listener defaulted to `window`, so a right-click anywhere on the page
opened the diagram menu (and suppressed the native one) when the editor was
embedded in a larger document. The redundant `<ContextMenu target>` prop is
removed.
