# diffx

[![checks](https://github.com/VaibhavAcharya/diffx/actions/workflows/checks.yml/badge.svg)](https://github.com/VaibhavAcharya/diffx/actions/workflows/checks.yml)

Review uncommitted and unmerged changes across every Git repository and worktree in a directory, in your browser.

If your work lives in one folder full of repositories and feature worktrees, diffx shows what changed in all of them at once, without checking anything out.

```sh
npx diffx ~/Developer
```

That scans the directory, starts a local server, and opens a browser. Needs Node.js 20.19 or newer and Git on your PATH. Nothing leaves your machine.

Not on npm yet. Until the first release, run it from a clone as described under [Development](#development).

With no directory, diffx restores the tabs from your last session and falls back to the current directory the first time. Pass `--no-open` to print the URL instead of opening it. Stop the server with Ctrl+C.

## What you get

The Repositories control in the sidebar selects which repositories to display and holds each repository's base and comparison branch pickers. Branch lists show local branches before remote ones. Below it the sidebar lists the changed files for every selected repository; each repository collapses like the directories inside it. Use Refresh to rescan and reload changes.

Selection is a mode rather than a one-off action. Changed follows whichever repositories have changes as comparisons load, All and None cover everything and nothing, and ticking a single repository switches to Custom while keeping what was already on screen. The mode belongs to the tab.

## Tabs

Work is organised into tabs. The `+` button opens the operating system's own folder chooser (`osascript` on macOS, `zenity` or `kdialog` on Linux, a PowerShell folder dialog on Windows) and always opens a new tab, so the same directory can be open several times with different repositories and comparisons in each. Right-click a tab to duplicate it, which copies its settings. Running `diffx <directory>` reuses a tab already open on that directory instead of adding another.

Closing a tab keeps it in a list of the ten most recently closed. The restore button at the right of the tab bar brings the last one back with its settings intact.

## Settings and stored state

Settings apply everywhere and cover appearance (theme, unified or split, line wrapping, sidebar density), diffs (within-line highlighting, context lines per expansion), and discovery (search depth, directory budget, extra folder names to skip). Discovery settings take effect on the next rescan. Each tab separately remembers its directory, its selection mode, and any repository whose base branch, comparison branch, or individual tick you changed.

Search text, which files are collapsed, and scroll position are deliberately not stored, because restoring them is more surprising than retyping them.

State lives in `~/.diffx/db.json`, written atomically and debounced; set `DIFFX_HOME` to store it elsewhere. Only values that differ from the defaults are written, so the file stays readable. A file that cannot be parsed is moved aside to `db.json.corrupt` and a fresh one is started. Files written by an earlier version are migrated on first read.

```json
{
  "version": 2,
  "revision": 48,
  "settings": { "layout": "split" },
  "activeTab": "tmu0as73o",
  "tabs": [
    {
      "id": "tmu0as73o",
      "root": "/Users/you/Developer/netlify",
      "selection": "changed",
      "repos": {
        "/Users/you/Developer/netlify/build": { "target": "release" }
      }
    }
  ],
  "recent": []
}
```

The browser sends one command per change rather than the whole document, and the server applies it to whatever is on disk. Repository settings merge, so a repository missing from the latest scan keeps what you gave it, and two windows editing different tabs do not overwrite each other.

## Comparisons

The default view compares the merge base of the base branch and HEAD with the working tree. It includes committed feature changes, staged and unstaged changes as their combined current content, and untracked files. Selecting a different target branch shows that branch's committed changes. No checkout, fetch, staging, or file edits are performed.

The base defaults to origin's default branch when available, then main/master, then HEAD. You can override it per repository. Remote branches reflect the refs already present locally.

Discovery handles `.git` directories and worktree `.git` files, searches eight directory levels and 10,000 directories by default, and does not follow directory symlinks. Inside repositories it also checks `.worktrees`.

Discovery stops at each repository boundary and never walks a repository's contents, so it only traverses the space between repositories. No `.gitignore` applies there, and none is read; a built-in list of dependency, virtualenv, and cache directory names is skipped instead, and Settings can add more. Build output names such as `build`, `dist`, and `target` are deliberately not on the built-in list, because they are also ordinary repository names. Reaching either search limit reports one summary warning rather than one per directory, naming the setting that raises it.

Binary files and changes without text hunks show a notice. Untracked files larger than 1 MB and untracked symlinks are skipped with a warning; Git output is limited to 16 MB per command. Repositories without commits currently report a comparison error.

The server binds to loopback on an available port and requires a per-session token for API requests. `POST` is accepted only for state commands. The browser uses the local server to read directories; nothing is uploaded.

Syntax highlighting runs in a worker pool and diffs are virtualised, so only visible content is rendered. Expanding hidden context loads the whole file once and caches it, so the first expansion in a file is slower than the rest.

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

## License

MIT. See [LICENSE](LICENSE).

The bundled IBM Plex Sans and Lilex fonts are under the SIL Open Font License; their license texts ship in `dist/licenses/`.
