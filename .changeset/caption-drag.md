---
"@oh-just-another/state": minor
"@oh-just-another/scene": patch
---

Drag the caption pill along its link. With the link selected, dragging the
pill slides the label along the drawn path (the cursor is projected back onto
the polyline — new `projectPointToPathT` in scene); within a few pixels of
the arc-length middle it snaps back to the default placement
(`label.position` removed, so elbow links regain longest-segment
auto-placement). One undo step, Escape reverts, double-click still opens the
inline text editor, and handle dots keep pointer priority over the pill.
Tunable snap radius: `LINK_LABEL_DRAG_SNAP_PX`.
