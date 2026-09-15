# Using polydiff

[Back to the README](../README.md)

## Tabs

Work is organised into tabs. The `+` button opens the operating system's own folder chooser (`osascript` on macOS, `zenity` or `kdialog` on Linux, a PowerShell folder dialog on Windows) and always opens a new tab, so the same directory can be open several times with different repositories and comparisons in each. Right-click a tab to duplicate it, which copies its settings. Running `polydiff <directory>` reuses a tab already open on that directory instead of adding another.

Closing a tab keeps it in a list of the ten most recently closed. The restore button at the right of the tab bar brings the last one back with its settings intact.

## Settings and stored state

Settings apply everywhere and cover appearance (theme, unified or split, line wrapping, sidebar density and width), diffs (within-line highlighting, context lines per expansion), and discovery (search depth, directory budget, and folder names to skip). Discovery settings take effect on the next rescan. Each tab separately remembers its directory and any repository whose base branch, comparison branch, or tick you changed.

New tabs start with no repositories selected. Every discovered repository appears in the sidebar, and ticking one loads its changes and opens its file list. Unticking it cancels its pending diff request and removes it from the review. Saved selections are restored when you reopen a tab; newly discovered repositories remain unticked. Comparison branches are kept for unticked repositories. Search matches repository names and loaded changed files.

Skip these folders shows the full default list. Remove a name to include that folder in discovery, or add a folder name to skip it. Reset preferences restores all app defaults, including this list and the sidebar width, while keeping open tabs, recently closed tabs, and repository comparisons.

Drag the sidebar's right edge to resize it. You can also focus the divider and use Left/Right to adjust its width, or Home/End for the minimum/maximum. The width is saved across sessions. Long file and directory names scroll horizontally within each repository tree.

Repositories in the sidebar and files in the review pane both open folded. Clicking a file in the sidebar expands that file and scrolls to it, and the toolbar button expands or folds every file at once.

Search text, which files are expanded, and scroll position are deliberately not stored, because restoring them is more surprising than retyping them.

State lives in `~/.polydiff/db.json`, written atomically and debounced; set `POLYDIFF_HOME` to store it elsewhere. Only values that differ from the defaults are written, so the file stays readable. A file that cannot be parsed is moved aside to `db.json.corrupt` and a fresh one is started. Files written by an earlier version are migrated when loaded and saved in the current format on the next write.

```json
{
  "version": 5,
  "revision": 48,
  "settings": { "layout": "split" },
  "activeTab": "tmu0as73o",
  "tabs": [
    {
      "id": "tmu0as73o",
      "root": "/Users/you/Developer/netlify",
      "repos": {
        "/Users/you/Developer/netlify/build": {
          "target": "release",
          "selected": true
        }
      }
    }
  ],
  "recent": []
}
```

The browser sends one command per change rather than the whole document, and the server applies it to whatever is on disk. Repository settings merge, so a repository missing from the latest scan keeps what you gave it, including its selection, and two windows editing different tabs do not overwrite each other.

Version 5 removes automatic selection rules. Migration preserves explicit selections and comparison branches in open and recently closed tabs; repositories previously included only by Changed or All now start unticked. Before version 4, ticks only applied in custom mode (or version 1), so inactive ticks from other modes are discarded.

## Comparisons

Select and expand a repository to show its comparison button above the file list. Branch comparisons show the review branch versus the base, with “Includes uncommitted edits” or “Committed only” underneath. Local-only review shows “Uncommitted changes.” Unselected and folded repositories hide this control; the main review pane keeps the full comparison summary. Click the button and choose **Changes** first:

- **Committed + uncommitted** (default) includes committed changes since the current branch diverged from the base, staged and unstaged edits as their combined current content, and untracked files. The review branch is the current checkout; you can choose the base branch.
- **Committed only** shows committed changes since the review branch diverged from the base. You can choose any local or remote review branch and base branch. Local edits are excluded.
- **Uncommitted only** compares local files with the latest commit of the current checkout. It includes staged and unstaged edits as their combined current content, and untracked files. Both branch pickers are hidden; the saved base is restored when you switch back to a branch comparison.

Switching from committed review of another branch to a scope containing uncommitted edits switches the review to the current checkout. Switching back to committed review starts with that checkout; choose another review branch if needed. Existing saved comparisons retain their meaning. No checkout, fetch, staging, or file edits are performed.

The base defaults to origin's default branch when available, then main/master, then HEAD. You can override it per repository. Remote branches reflect the refs already present locally.

Discovery handles `.git` directories and worktree `.git` files, searches eight directory levels and 10,000 directories by default, and does not follow directory symlinks. Inside repositories it also checks `.worktrees`.

Discovery stops at each repository boundary and never walks a repository's contents, so it only traverses the space between repositories. No `.gitignore` applies there, and none is read; dependency, virtualenv, and cache directory names are skipped by default, and Settings can add or remove names. Build output names such as `build`, `dist`, and `target` are deliberately not on the default list, because they are also ordinary repository names. Reaching either search limit reports one summary warning rather than one per directory, naming the setting that raises it.

Binary files and changes without text hunks show a notice. Untracked files larger than 1 MB and untracked symlinks are skipped with a warning; Git output is limited to 16 MB per command. Repositories without commits currently report a comparison error.

The server binds to loopback on an available port and requires a per-session token for API requests. `POST` is accepted only for state commands. The browser uses the local server to read directories; nothing is uploaded.

Syntax highlighting runs in a worker pool and diffs are virtualised, so only visible content is rendered. Expanding hidden context loads the whole file once and caches it, so the first expansion in a file is slower than the rest.
