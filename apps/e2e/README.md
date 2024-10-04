# @oh-just-another/e2e

Playwright suite that drives the demo (`apps/demo`) end-to-end:

- `tests/smoke.spec.ts` — boot, palette renders, keyboard-only shape creation, undo.
- `tests/hotkeys.spec.ts` — clipboard / select-all / zoom hotkeys don't throw.
- `tests/touch.spec.ts` — mobile-chromium project; tap + synthetic pinch event stream.
- `tests/a11y.spec.ts` — axe-core sweep, fails on critical / serious WCAG hits.

## Local

```bash
pnpm --filter @oh-just-another/e2e install-browsers   # one-off — pulls chromium
pnpm --filter @oh-just-another/e2e test               # boots demo + relay, runs suite
```

The Playwright config auto-spawns the demo via `pnpm --filter demo dev`
on port 5173. If you already have a dev server up locally it'll reuse
it (only when `CI=` is unset).

## CI

GitHub Actions matrix flips on firefox / webkit via `--project=`. The
relay isn't yet spawned automatically — collab tests are scoped out
until the suite gets a dedicated multi-page driver.
