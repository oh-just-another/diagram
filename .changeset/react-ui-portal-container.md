---
"@oh-just-another/react-ui": minor
---

Add `PortalContainerProvider` / `usePortalContainer` — floating UI (tooltips, popovers, context menus, hover chips) now portals into a configurable container instead of always `document.body`. Defaults to `document.body`, so existing usage is unchanged; a host mounting the editor in a shadow root points it at a node inside the root so portaled content stays styled.
