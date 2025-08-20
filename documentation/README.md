# documentation/

Framework **public library documentation website** — what will be hosted in the future
through GitHub (Pages or external docs-hosting).

>
> | Folder | Audience | Content |
> |---|---|---|
> | `documentation/` | library users | public site: guides, API, examples |
>
> but `documentation/` is written «for those who are connecting the library», not
> «for those who are developing it».

## Status

**Framework.** Currently this is structure + placeholder pages. Website generator
(Docusaurus / VitePress / MkDocs / Astro Starlight) is not yet chosen —
pages are intentionally framework-agnostic markdown, so that the choice does not block
content creation. See [SETUP.md](./SETUP.md) for hosting options.

## Structure

```
documentation/
  README.md            ← this file
  SETUP.md             ← generator/hosting options (decision deferred)
  index.md             ← website landing page
  guides/              ← step-by-step instructions
    getting-started.md
    text-and-fonts.md
  reference/           ← reference manual
    packages.md
  examples/            ← examples (placeholder)
    README.md
```

## How to populate

1. Write pages as regular markdown in `guides/` / `reference/`.
3. When we choose the generator — add configuration and navigation on top of these same
   markdown files (the folder structure is already tailored for this).
