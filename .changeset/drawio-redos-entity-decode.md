---
"@oh-just-another/importers": patch
---

Harden the drawio importer against two issues flagged by static analysis. The
attribute parser no longer backtracks polynomially on a long run of name
characters with no `=` (the name is matched atomically), and entity decoding no
longer double-unescapes: `&amp;lt;` now decodes once to the literal `&lt;`
instead of `<`, via a single left-to-right pass.
