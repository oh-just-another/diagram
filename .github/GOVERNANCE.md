# Governance

## License pledge

- The SDK is and stays **MIT-licensed** — every package, every feature, forever.
- **No license keys, no watermarks, no production gates.** Nothing in the
  runtime checks who you are or where you deploy.
- A published version can never be relicensed: everything already on npm stays
  MIT irrevocably. If the project ever changed course for future versions (no
  such plan exists), every released version would remain usable and forkable.
- Commercial use, OSS redistribution, and embedding in other products are all
  allowed without asking.

Paid offerings, if any, are built **on top of** the MIT core (hosting, support,
services) — never by closing it.

## Maintainership

The project is currently maintained by [@rustamgarifulin](https://github.com/rustamgarifulin).
Contributors with a track record of quality PRs may be offered triage or
maintainer roles. If maintainership is ever transferred, this pledge transfers
with it.

## Continuity

The repository is self-contained: no private dependencies, no build secrets,
all assets in-tree. Anyone can build, test, and publish a fork from a clean
clone (`pnpm install && pnpm build && pnpm test`).

## Decisions

Features and breaking changes are discussed in GitHub issues before
implementation. Releases are versioned per package via changesets;
architectural decisions are recorded in the root `CHANGELOG.md`.
