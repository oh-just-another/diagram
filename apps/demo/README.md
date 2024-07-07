# @oh-just-another/demo

Visual sandbox for the diagram library. Not published.

## Run

```bash
pnpm --filter @oh-just-another/demo dev      # http://localhost:5173
pnpm --filter @oh-just-another/demo build    # production bundle into dist/
pnpm --filter @oh-just-another/demo preview  # serve the built bundle
```

The first time, run `pnpm install` at the repo root so workspace packages are linked.

## What's inside

The current sandbox (Phase 3) renders a static scene exercising every built-in shape type — rectangle, ellipse, polygon, path, text, image — with assorted styles, rotations and scales. It's a manual visual check that the renderer engine works in a real browser before higher-level phases (interaction, headless, demo with React) are wired.

Console output reports how many shapes were rendered and how long it took.

