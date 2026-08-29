---
"@oh-just-another/importers": minor
"@oh-just-another/editor": minor
---

Spreadsheet export: `exportCsv(scene)` (also the export-only `csv` entry of `DIAGRAM_FORMATS` / `EXPORT_FORMATS`) writes RFC 4180 rows: one per element (text / label, group or frame parent, sticky tags, author and reactions, comment counts, hyperlink, fill / stroke, locked / hidden, world bounds and rotation) and one per link (label, stroke, connected element ids). The editor gains a "Spreadsheet (CSV)" row under Board › Export, `downloadCsv(scene)` and the `export-csv` action.
