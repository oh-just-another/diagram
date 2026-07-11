---
"@oh-just-another/react-ui": patch
---

Fix the search bar (⌘F) jumping to a match the moment it opens, before the user types anything. The query was retained across close/open, so reopening re-ran the reveal effect against the stale query and framed the previous match. The query and active index are now reset on close, so the bar always opens empty and only navigates once the user types.
