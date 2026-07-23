---
"@oh-just-another/react-ui": minor
---

Selection toolbar and right-click context menu restructured to the target design. Toolbar branches now lead with their type cluster (shape: convert type → border → fill → link; text: font family → size → style → align → link → color) separated by dividers, and every branch shares the tail "z-order → align → actions → comment → lock → ⋯". New Comment button starts an annotation thread on the selected element. The context menu is regrouped into clipboard → styles → comments → z-order/layers (now with Bring forward / Send backward) → selection & arrange → lock → delete → viewport sections.
