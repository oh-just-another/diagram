---
"@oh-just-another/state": patch
---

Multi-element commands treat a selected group as one unit: Arrange as grid, Stack, Align, Distribute, Flip and Rotate move / mirror / turn a group's whole subtree together (its footprint is the union of its members) instead of scattering the children or ignoring them. New `ARRANGE_LAYOUT_GAP` constant.
