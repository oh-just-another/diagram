# Changelog

## 0.1.1
- init

## 0.2.0
- chore: initial setup and changesets config

## 0.3.0
- feat: types math

## 0.4.0
- feat: scene

## 0.5.0
- feat: renderer canvas

## 0.6.0
- feat: state

## 0.7.0
- feat: history

## 0.8.0
- feat: serialization templates

## 0.9.0
- feat: b.

## 0.10.0
- feat: headless

## 0.11.0
- feat: misc

## 0.12.0
- feat: react ui

## 0.13.0
- feat: react-ui split (DiagramRoot + DiagramSurface), playground ghost shapes

## 0.14.0
- feat: react demo

## 0.14.1
- feat: register rich template renderer + hit-tester in demo

## 0.15.0
- feat: importers

## 0.16.0
- feat: collab

## 0.16.1
- feat: collab sync handshake + skip localStorage in room

## 0.16.2
- feat: cross-realm typed-array detect in BroadcastChannelTransport

## 0.16.3
- feat: release prep

## 0.16.4
- feat: anchors

## 0.17.0
- feat: (MVP)

## 0.17.1
- feat: follow-up: port overlay, snap, edge selection + endpoint editing

## 0.18.0
- feat: snap outline

## 0.18.1
- feat: grid context menu

## 0.18.2
- feat: template spot ports

## 0.18.3
- feat: multi select lasso

## 0.19.0
- feat: layers group resize

## 0.20.0
- feat: perf scale up

## 0.21.0
- feat: collab follow ups

## 0.21.1
- feat: mobile touch

## 0.21.2
- feat: a11y

## 0.22.0
- feat: comments

## 0.23.0
- feat: versioning

## 0.23.1
- Fix viewport culling: sync size from DiagramRoot ResizeObserver

## 0.23.2
- feat: viewport controls + horizontal scroll fix + zoom hotkeys/toolbar/menu

## 0.23.3
- feat: moveSelectionToLayer menu + removeComment UI + Save/Load/Export hotkeys

## 0.23.4
- feat: layer.locked enforcement (hit-test/lasso/focus/nudge skip locked)

## 0.23.5
- feat: inline text edit (Editor.beginTextEdit + TextEditorOverlay)

## 0.23.6
- feat: annotation drag (press pin Right move Right release commits)

## 0.23.7
- feat: HistoryProvider interface + @mentions helpers + persistence demo SnapshotStore

## 0.23.8
- feat: layout helpers + grouping/perf design specs + diff stats UI

## 0.23.9
- feat: design specs (CRDT merge, OffscreenCanvas, mobile, a11y CI, e2e)

## 0.23.10
- feat: hit-test SpatialGrid, edge AABB cache, constants audit

## 0.23.11
- feat: parent-child grouping

## 0.23.12
- feat: branch merge (three-way diff + MergeDialog)

## 0.23.13
- feat: OffscreenCanvas + WorkerPool primitives

## 0.23.14
- feat: brush strokes (Apple Pencil pressure) + bottom-sheet

## 0.23.15
- feat: accessibility audit + keyboard-only creation

## 0.23.16
- feat: Playwright E2E suite

## 0.23.17
- e2e: rename `test` Right `e2e` so workspace-wide pnpm -r test skips it

## 0.23.18
- state: paste lands at cursor instead of original-position+10

## 0.23.19
- react-ui: standalone zoom components + toolbar item kinds

## 0.23.20
- state: live selection preview during lasso drag

## 0.23.21
- state: grid layout — arrangeAsGrid / arrangeAsStack commands

## 0.23.22
- state: coverage-based lasso + auto-select on press

## 0.23.23
- state: hide per-shape resize handles when multi-selected

## 0.23.24
- state: bigger, rounded, easier-to-grab resize handles

## 0.23.25
- state: group resize writes width/height, not scale (fix border + jump)

## 0.23.26
- state: container / drop-zone protocol — swim-lane as parent

## 0.23.27
- state: live drop-zone resolver + z-order fix + grid seed scene

## 0.23.28
- templates: drop-zone resolver injects shape size into root layout

## 0.23.29
- state: auto-grow container when child moves past its drop-zone edge

## 0.23.30
- demo: wire Task-card button Right toast so taps are visible

## 0.23.31
- react-ui: stacked palette sections, no tab switching

## 0.23.32
- state: container resize floors at children's union AABB

## 0.23.33
- state+react-ui: drag-from-palette spawns live preview centred at cursor

## 0.23.34
- react-ui: hide HTML5 drag ghost during palette drag

## 0.23.35
- react-ui: 1×1 canvas as drag-image ghost (was broken-img globe)

## 0.23.36
- react-ui: drag ghost = transparent div in DOM (was detached canvas)

## 0.23.37
- react-ui: drag ghost must have non-zero area + visible bg

## 0.23.38
- state: compactLayerZOrder — rebalance fractional indices on demand

## 0.23.39
- state: wire brush mode into pointer flow + live preview overlay

## 0.23.40
- react-ui: wire MergeDialog into VersionPanel

## 0.23.41
- state+renderer-core: dirty-rect rendering for main canvas
