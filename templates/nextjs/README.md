# oh-diagram · Next.js template

A minimal [Next.js](https://nextjs.org) (App Router) starter that mounts the
diagram editor from
[`@oh-just-another/editor`](https://www.npmjs.com/package/@oh-just-another/editor).

## Use it

```bash
# copy this folder out of the repo, then:
npm install
npm run dev
```

Open http://localhost:3000 — a full-screen editor following your OS colour
scheme.

## The SSR catch

The editor uses canvas, WASM text-shaping and Web Workers — none of which exist
on the server. So it must render **client-side only**:

- `components/Diagram.tsx` is a Client Component (`"use client"`) holding the
  `<Editor>`.
- `app/page.tsx` loads it with `next/dynamic` and `{ ssr: false }`. In Next 15
  that option is only allowed from a Client Component, so the page carries
  `"use client"` too.

`next.config.mjs` lists the editor packages under `transpilePackages` so Next
compiles their ESM rather than treating them as pre-built externals.

## Persisting scenes

`onSceneChange` (wired in `Diagram.tsx`) hands you the full `Scene`. Serialize it
with [`@oh-just-another/serialization`](https://www.npmjs.com/package/@oh-just-another/serialization)
and store it wherever you like — `localStorage`, a route handler, your database.
