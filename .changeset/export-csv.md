---
"@oh-just-another/importers": minor
"@oh-just-another/editor": minor
---

Spreadsheet export: `exportCsv(scene)` (also the export-only `csv` entry of `DIAGRAM_FORMATS` / `EXPORT_FORMATS`) writes one RFC 4180 row per element — id, type, layer, text / label, sticky tags and author, world bounds. The editor gains a "Spreadsheet (CSV)" row under Board › Export, `downloadCsv(scene)` and the `export-csv` action.
