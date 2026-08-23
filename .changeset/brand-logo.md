---
"@oh-just-another/editor": minor
"@oh-just-another/react-ui": patch
---

Brand cell of the top bar shows the product logo. New `logo` prop on `Diagram` (default: the built-in `BrandLogo`, also exported; `null` drops the cell). The light / dark artwork lives in `packages/editor/assets/logo.svg` and `logo-dark.svg`, inlined by `scripts/gen-logo.mjs` (`pnpm gen:logo`, part of `build`); CSS (`.du-brand-logo-light/-dark`, `--du-brand-h`) shows the variant matching the theme. The `⌗` glyph and the playground's "Diagram" heading are gone.
