---
"@oh-just-another/state": patch
---

`normalizeHref` no longer backtracks polynomially on a crafted email-like input:
the bare-email check matches domain labels linearly. As a side effect it is
stricter about what counts as an email — a domain with empty labels (consecutive
dots, e.g. `a@b..c`) is treated as a URL and gets `https://`, not `mailto:`.
