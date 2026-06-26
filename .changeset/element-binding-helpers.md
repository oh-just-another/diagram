---
"@oh-just-another/diagram": minor
---

Export framework-agnostic binding helpers for `<oja-diagram>`: `applyOjaDiagramProps` (map declarative props to attributes / the `scene` property), `bindOjaDiagramEvents` (subscribe typed handlers to the four `CustomEvent`s, returns an unbind), and `ojaDiagramController` (a curated imperative pass-through). Plus the shared types `OjaDiagramProps`, `OjaDiagramEventMap`, `OjaDiagramEventHandlers`, `OjaDiagramController`, `DiagramTheme`, `DiagramRenderer`. These are the single implementation the framework wrappers build on, so prop / event binding isn't reimplemented per framework.
