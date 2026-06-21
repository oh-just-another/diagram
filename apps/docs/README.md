# @oh-just-another/docs

The documentation site for the **diagram** library, built with
[Docusaurus](https://docusaurus.io/). It embeds a live instance of the real
`@oh-just-another/editor` component (see `src/components/LiveEditor`).

Deployed to GitHub Pages at <https://oh-just-another.github.io/diagram/> by the
`pages.yml` workflow.

## Local development

Run from the repo root:

```bash
pnpm build        # build the workspace packages the site imports (editor, react-ui, …)
pnpm docs:dev     # start the dev server (http://localhost:3000/diagram/)
```

The live editor is loaded client-side via a dynamic `import()` (see
`src/components/LiveEditor`), so it needs the workspace packages built
(`pnpm build`) before the site can resolve `@oh-just-another/editor`.

## Build

```bash
pnpm docs:build   # static output in apps/docs/build
```

`apps/docs` is a private app and is intentionally excluded from the workspace-wide
`pnpm build` / `pnpm typecheck` so the package build loop stays fast.
