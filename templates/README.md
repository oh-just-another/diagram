# Starter templates

Copy-out starters that show how to consume the published packages from a fresh
app. They are **standalone projects** — not part of this workspace's pnpm /
nx / lint graph. Copy a folder out of the repo, run `npm install`, and go.

| Template                     | Stack                   | Package used              |
| ---------------------------- | ----------------------- | ------------------------- |
| [`vite-react`](./vite-react) | Vite + React + TS       | `@oh-just-another/editor` |
| [`nextjs`](./nextjs)         | Next.js App Router + TS | `@oh-just-another/editor` |

Both mount the React `<Editor>` component directly. For non-React hosts, use the
framework-neutral [`<oh-diagram>`](../packages/element) custom element, or its
[Vue](../packages/vue) / [Svelte](../packages/svelte) wrappers.
