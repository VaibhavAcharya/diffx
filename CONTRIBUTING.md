# Contributing

## Development

```sh
pnpm install
pnpm build
pnpm start ~/Developer
```

`pnpm dev` runs the Vite frontend alone against Vite's own server. Use `pnpm build` followed by `pnpm start` for the full application, and rebuild after frontend edits. Building needs Node.js 20.19+ or 22.12+, which is what Vite 8 requires; running the published CLI only needs 20.19.

```sh
pnpm build
pnpm lint
pnpm test
pnpm format:check
```

`pnpm test` covers the state store, Git discovery and comparison, and the HTTP boundary. The HTTP tests spawn the real CLI, so run `pnpm build` first. `pnpm format` formats the project with Prettier defaults.

GitHub Actions runs every check on Linux, Windows, and macOS against Node 22 and 24, and separately runs the store and HTTP tests on Node 20.19 to hold the floor that `engines` claims. The Git tests need Node 21 or newer, because they import the browser diff library to check the parsed patch.

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). release-please watches `main`, keeps a release pull request open with the next version and the generated `CHANGELOG.md`, and tags the release when that pull request merges. `feat:` moves the minor version while the project is below 1.0, `fix:` moves the patch, and `ci:`, `chore:`, `test:` and `build:` stay out of the changelog.

Publishing happens in the same workflow run that creates the release, over OIDC through npm's trusted publishing, so no token is stored anywhere.

## Code and writing

Keep changes focused and follow the surrounding patterns. Prefer clear names and direct control flow over new abstractions. Comments should explain a constraint or a non-obvious decision; avoid narrating the code. Preserve useful existing comments.

Describe what a change lets someone do, then explain any limits. Use plain language and concrete examples. Keep internal storage and release details in the reference docs rather than the README introduction. Use screenshots from the running app with sample repositories, and update them when the interface changes.

For bug reports, include the command you ran, your OS, Node and Git versions, and what you expected to see. A small reproduction repository is useful; remove private code, local paths, and the session token from reports.
