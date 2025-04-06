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

Run the editor in the browser:

```bash
pnpm --filter @oh-just-another/diagram dev   # http://localhost:5174
```

Use as a component in your project:

```tsx
import { Diagram } from "@oh-just-another/diagram";

function App() {
  return <Diagram />;
}
```

`<Diagram>` automatically selects the best renderer (WebGL2 / OffscreenCanvas / Canvas2D), loads WASM-shaper for text where supported, and logs the actual profile to console.log on mount.

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
