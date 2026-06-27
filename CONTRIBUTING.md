# Contributing

Thanks for your interest in contributing! This is an open, MIT-licensed project
and contributions of all kinds are welcome — bug reports, fixes, features, docs,
and tests.

## Prerequisites

- **Node.js >= 22** (see `.nvmrc`)
- **pnpm** (the repo is a pnpm + nx monorepo)

```bash
pnpm install
pnpm build      # build all packages (required before running the docs/playground)
```

## Project layout

Independent npm packages with **one-way dependencies** across levels L0 → L6
(e.g. `math`/`types` at the bottom, `react-ui`/`editor` near the top). A lower
package must never import from a higher one. The layering gate is:

```bash
pnpm deps:check   # dependency-cruiser: enforces layering + no runtime cycles
```

## Development workflow

1. Branch off `master`.
2. Make your change in small, focused commits — one package at a time where
   possible.
3. Add or update **tests** for any behavior change (vitest for units, pixel
   snapshots for the renderer).
4. Keep the docs in sync if you change a public API.
5. Open a pull request against `master`.

### Checks (must be green)

```bash
pnpm typecheck    # tsc --noEmit (vitest does not type-check)
pnpm lint         # eslint (strict, type-checked)
pnpm test         # unit + snapshot tests
pnpm deps:check   # layering / cycles
```

Git hooks run a subset automatically: **pre-commit** (eslint --fix + prettier on
staged files) and **pre-push** (format check, typecheck, lint, test,
deps:check). After
changes to a core/shared package, run tests without the nx cache
(`pnpm test --skip-nx-cache`) to avoid stale green results.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), **subject line
only** (no body):

```
type(scope): short description
```

Types: `feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `perf` /
`build` / `ci`. Link issues from the **pull request description**
(`Closes #N`), not from the commit.

## Changesets

Any user-visible change to a package's public API or behavior needs a changeset
(this drives versioning and the changelog):

```bash
pnpm changeset
```

## Licensing of contributions

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE). There is **no CLA** — standard GitHub
pull-request contributions are all that's needed.

## Code of Conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md). By participating,
you are expected to uphold it.
