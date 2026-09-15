# polydiff

Review changes across repos and worktrees in one local workspace.

[![npm](https://img.shields.io/npm/v/polydiff)](https://www.npmjs.com/package/polydiff)
[![checks](https://github.com/VaibhavAcharya/polydiff/actions/workflows/checks.yml/badge.svg)](https://github.com/VaibhavAcharya/polydiff/actions/workflows/checks.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/VaibhavAcharya/polydiff/blob/main/LICENSE)

A feature can touch your API, frontend, and a shared library. Other work continues in separate worktrees. Point polydiff at the folder containing them to review their changes together, without switching branches or opening each repository separately.

```sh
npx polydiff ~/Developer
```

![polydiff showing the API and frontend pagination changes together, with the empty-state worktree listed under the repository it belongs to](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/workspace.png)

The screenshots use sample repositories: an API and frontend adding pagination, plus a worktree working on an empty state.

## Review the work across your workspace

- Follow a feature across repositories. Read the API change and its frontend changes in the same view.
- Check parallel worktrees. Review another branch's work while leaving your current checkout alone, including work produced by coding agents. Worktrees sit under the repository they belong to in the sidebar.
- See the whole change before opening a PR. The working-tree comparison includes committed feature work, staged and unstaged edits, and untracked files.
- Keep reading while the work moves. Selected repositories reload when their files or refs change, so a review stays current while an agent or a colleague is still writing.
- Tick off what you have read. Each file has a reviewed mark that clears itself when the file changes again, and reviewed files can be hidden.
- Keep separate review contexts in tabs. Each tab remembers its folder, which repositories are in the review, their comparison branches, and what you have reviewed. Name a tab, drag it into place, or duplicate it to review the same workspace another way.

## Start reviewing

You need Node.js 20.19 or newer and Git on your PATH. The command starts a local server and opens your browser. It runs on macOS, Linux, and Windows.

```sh
npx polydiff ~/Developer/my-projects
```

The sidebar lists every repository it found, with the repositories in the review at the top. New tabs start with none selected; tick the repositories you want to review to load their changes, or use Select matching after typing in the search box. Each repository keeps its own base and comparison branch, even when unticked. Use the sidebar to jump between files, and the refresh button to rescan and reload selected repositories.

Selected repositories are watched while the tab is in front of you, and reload on their own when a file or a Git ref changes. The sidebar says what the watcher is doing and can turn it off; a background tab or a hidden window pauses it.

Mark each file reviewed as you go. The mark is tied to the diff you read, so a file that changes again comes back with a badge saying so, and the toolbar keeps a count. Hide what you have reviewed to see only what is left.

![A file marked reviewed, and one that changed after it was reviewed, with the review count in the toolbar](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/reviewing.png)

Click a repository's comparison summary to choose **Committed + uncommitted**, **Committed only**, **Uncommitted only**, **Staged only**, or **Unstaged only**. Branch comparisons let you choose a base, including a tag or a commit you type in. The local scopes show what has not been committed, split by the index when you want to read staged and unstaged work apart. Each repository keeps its own comparison.

![The comparison picker open on a linked worktree, choosing what it reviews and which branch it compares with](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/comparisons.png)

The default comparison shows changes since the common ancestor of the base branch and HEAD, including your current working-tree edits. Select a branch or HEAD to review committed changes only. Remote branches use refs already present locally.

Run `npx polydiff` without a folder to restore your previous tabs. On the first run, it opens the current directory. Use `--no-open` to print the URL without opening a browser, and Ctrl+C to stop the server.

## Read diffs your way

Switch between unified and split views, wrap long lines, expand surrounding code, and choose a light, dark, or system theme. Resize the sidebar and scroll long paths horizontally. Repositories and diffs start folded, so a large review opens as a list you can work through rather than a wall of code. Expand all opens every file at once.

Filter the review down to what you want to read: search by path, keep one kind of change, hide lockfiles and other generated output, or hide what you have already reviewed. The filter applies to the sidebar and the review pane together. Search inside the loaded diffs to jump between matches, with an option to look at changed lines only.

Press `?` for the keyboard shortcuts. `j` and `k` move between files, `n` and `p` between hunks, `r` marks a file reviewed, `f` searches the diffs, and `[` and `]` switch tabs. A file's menu copies its path or opens it in your editor at the first changed line.

![Split diffs in the dark theme, showing the API and frontend changes side by side](https://raw.githubusercontent.com/VaibhavAcharya/polydiff/main/docs/images/split-dark.png)

## Local and read-only

Your code stays on your machine. The app connects to a local server bound to loopback, with a per-session token for API requests. It does not upload code, check out branches, fetch, stage, or edit repository files. Preferences and tabs are saved in `~/.polydiff/db.json`.

Discovery finds repositories and worktrees beneath the folder you open, including `.worktrees` inside repositories. It skips dependency and cache folders by default. Edit the skipped-folder list, search depth, and directory limits in Settings. Reset preferences restores the defaults while keeping your tabs and comparisons.

Binary files, file mode changes, and repositories without commits are all shown with a note explaining what happened. Untracked files over 1 MB and untracked symlinks are skipped with a warning. Opening a file in your editor uses that editor's own URL scheme, so nothing is run on the server. See the [usage reference](https://github.com/VaibhavAcharya/polydiff/blob/main/docs/usage.md) for comparison details, discovery limits, and stored settings.

## Contributing

See [development and contribution guidelines](https://github.com/VaibhavAcharya/polydiff/blob/main/CONTRIBUTING.md) for local setup, checks, and the release workflow. Report bugs or suggest improvements in [GitHub issues](https://github.com/VaibhavAcharya/polydiff/issues).

## License

[MIT](https://github.com/VaibhavAcharya/polydiff/blob/main/LICENSE). Bundled IBM Plex Sans and Lilex fonts use the SIL Open Font License; their license texts ship in `dist/licenses/`.
