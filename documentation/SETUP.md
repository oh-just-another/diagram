# Hosting and generator (solution postponed)

The framework is intentionally not tied to a specific generator. When we have time — choose one of the options and place the config next to these markdown pages.

## Candidates

| Generator | Pros | Cons |
|---|---|---|
| **Astro Starlight** | fast, MDX, built-in search, good for libraries | requires build-step |
| **VitePress** | lightweight, Vue ecosystem, fast dev | fewer "doc" features |
| **Docusaurus** | mature, document versioning, i18n | heavier, React-bound |
| **MkDocs Material** | very simple, Python | outside JS tooling monorepo |
| **plain GitHub Pages + Jekyll** | no dependencies | minimal features |

## Hosting

- **GitHub Pages** — deploy from `gh-pages` branch or `/documentation`
  via GitHub Actions. Free, tied to the repository.
- External (Vercel / Netlify) — if preview PR and custom
  domain are needed.

## What not to do now

Do not pull in a heavy framework before choosing a generator and agreeing
on the design — pages remain clean markdown, suitable for any of
the options above.

## TODO

- [ ] Choose a generator (discuss).
- [ ] Add config + navigation.
- [ ] Set up GitHub Actions deploy.
- [ ] Bind domain (if needed).
