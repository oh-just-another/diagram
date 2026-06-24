---
"@oh-just-another/element": minor
---

Export framework-agnostic binding helpers for `<oh-diagram>`: `applyOhDiagramProps` (map declarative props to attributes / the `scene` property), `bindOhDiagramEvents` (subscribe typed handlers to the four `CustomEvent`s, returns an unbind), and `ohDiagramController` (a curated imperative pass-through). Plus the shared types `OhDiagramProps`, `OhDiagramEventMap`, `OhDiagramEventHandlers`, `OhDiagramController`, `DiagramTheme`, `DiagramRenderer`. These are the single implementation the framework wrappers build on, so prop / event binding isn't reimplemented per framework.
