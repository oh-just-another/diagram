# diagram

Monorepo library for drawing diagrams: browser editor + headless-render for servers, split into independent npm packages.

## Quick start (for contributors)

```bash
pnpm install     # installing dependencies
pnpm build       # building all packages
pnpm test        # tests
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm format      # prettier --write .
```

Run the demo in the browser:

```bash
pnpm --filter @oh-just-another/demo dev   # http://localhost:5174
```

Create a new package:

```bash
pnpm new-package <name>          # → packages/<name>
pnpm new-package <name> --app    # → apps/<name>
```

## Structure

```
packages/   — publishable npm packages (L0–L5)
apps/       — applications: demo, cli (L6)
scripts/    — utility scripts (package generator)
```

## Documentation

## License

MIT (TBD).
