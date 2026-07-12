---
"@oh-just-another/scene": patch
"@oh-just-another/state": patch
---

Fix: the caption pill no longer fights the bend/segment handles. The
"add waypoint" and elbow segment handles slide out from under the label pill
along their own span (`getLinkWaypointMidpoints` is label-aware; new shared
`getElbowSegmentHandles` keeps the drawn dot and the grab point identical), so
a click on the pill selects the link and a double-click opens the inline
caption editor. Visible handle dots keep pointer priority — an existing
waypoint dot sitting inside the pill is still grabbable (dots draw above the
pill).
