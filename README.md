# polydiff

Review changes across repos and worktrees in one local workspace.

[![npm](https://img.shields.io/npm/v/polydiff)](https://www.npmjs.com/package/polydiff)
[![checks](https://github.com/VaibhavAcharya/polydiff/actions/workflows/checks.yml/badge.svg)](https://github.com/VaibhavAcharya/polydiff/actions/workflows/checks.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/VaibhavAcharya/polydiff/blob/main/LICENSE)

A feature can touch your API, frontend, and a shared library. Other work continues in separate worktrees. Point polydiff at the folder containing them to review their changes together, without switching branches or opening each repository separately.

```sh
npx polydiff ~/Developer
```

![PolyDiff showing API and frontend changes together, with a separate feature worktree in the sidebar](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/workspace.png)

The screenshots use sample repositories: an API and frontend adding pagination, plus a worktree working on an empty state.

## Review the work across your workspace

- Follow a feature across repositories. Read the API change and its frontend changes in the same view.
- Check parallel worktrees. Review another branch's work while leaving your current checkout alone, including work produced by coding agents.
- See the whole change before opening a PR. The working-tree comparison includes committed feature work, staged and unstaged edits, and untracked files.
- Keep separate review contexts in tabs. Each tab remembers its folder, which repositories are in the review, and their comparison branches. Duplicate a tab to review the same workspace another way.

## Start reviewing

You need Node.js 20.19 or newer and Git on your PATH. The command starts a local server and opens your browser. It runs on macOS, Linux, and Windows.

```sh
npx polydiff ~/Developer/my-projects
```

The sidebar lists every repository it found. **Changed** follows the ones that have changes, and **All** and **None** are there when you want them. Tick a repository to keep it in or leave it out whatever the rule says; choosing a rule again clears those. Each repository carries its own base and comparison branch, and the ones left out keep theirs, so you can fix a wrong base before adding it back. Use the sidebar to jump between files, and the refresh button to rescan and reload changes.

![Repository selection and independent branch comparisons, including a linked worktree](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/comparisons.png)

The default comparison shows changes since the common ancestor of the base branch and HEAD, including your current working-tree edits. Select a branch or HEAD to review committed changes only. Remote branches use refs already present locally.

Run `npx polydiff` without a folder to restore your previous tabs. On the first run, it opens the current directory. Use `--no-open` to print the URL without opening a browser, and Ctrl+C to stop the server.

## Read diffs your way

Switch between unified and split views, wrap long lines, expand surrounding code, and choose a light, dark, or system theme. Resize the sidebar and scroll long paths horizontally. Repositories and diffs start folded, so a large review opens as a list you can work through rather than a wall of code. Expand all opens every file at once.

![Split diffs in the dark theme, showing changes across the API and frontend repositories](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/split-dark.png)

## Local and read-only

Your code stays on your machine. The app connects to a local server bound to loopback, with a per-session token for API requests. It does not upload code, check out branches, fetch, stage, or edit repository files. Preferences and tabs are saved in `~/.polydiff/db.json`.

Discovery finds repositories and worktrees beneath the folder you open, including `.worktrees` inside repositories. It skips dependency and cache folders by default. Edit the skipped-folder list, search depth, and directory limits in Settings. Reset preferences restores the defaults while keeping your tabs and comparisons.

Binary changes show a notice. Untracked files over 1 MB and untracked symlinks are skipped, and repositories need at least one commit. See the [usage reference](https://github.com/VaibhavAcharya/polydiff/blob/main/docs/usage.md) for comparison details, discovery limits, and stored settings.

## Contributing

See [development and contribution guidelines](https://github.com/VaibhavAcharya/polydiff/blob/main/CONTRIBUTING.md) for local setup, checks, and the release workflow. Report bugs or suggest improvements in [GitHub issues](https://github.com/VaibhavAcharya/polydiff/issues).

## License

[MIT](https://github.com/VaibhavAcharya/polydiff/blob/main/LICENSE). Bundled IBM Plex Sans and Lilex fonts use the SIL Open Font License; their license texts ship in `dist/licenses/`.
