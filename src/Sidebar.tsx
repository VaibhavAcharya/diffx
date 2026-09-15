import { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Collapsible } from "@base-ui/react/collapsible";
import { Input } from "@base-ui/react/input";
import {
  FileTree,
  useFileTree,
  useFileTreeSelector,
} from "@pierre/trees/react";
import {
  FILE_TREE_DENSITY_PRESETS,
  type GitStatusEntry,
  type FileTreeDensityKeyword,
} from "@pierre/trees";
import {
  ArrowsClockwiseIcon,
  CaretRightIcon,
  CheckIcon,
  FoldersIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { flattenEmptyDirectories } from "./order";
import { IconButton } from "./ui";
import { ComparisonPicker } from "./ComparisonPicker";
import { stats, type Entry, type useWorkspace } from "./workspace";

type WorkspaceState = ReturnType<typeof useWorkspace>;
type Navigate = (repo: string, file?: string) => void;
// The tallest a single repository's tree grows before it scrolls on its own.
const maxVisibleTreeRows = 20;

function ChangedTree({
  entry,
  search,
  density,
  navigate,
}: {
  entry: Entry;
  search: string;
  density: FileTreeDensityKeyword;
  navigate: Navigate;
}) {
  const files = entry.data?.files || [];
  const statuses: GitStatusEntry[] = files.map((file) => ({
    path: file.name,
    status:
      file.type === "new"
        ? "added"
        : file.type === "deleted"
          ? "deleted"
          : file.type.startsWith("rename")
            ? "renamed"
            : "modified",
  }));
  const { model } = useFileTree({
    paths: files.map((file) => file.name),
    gitStatus: statuses,
    initialExpansion: "open",
    flattenEmptyDirectories,
    density,
    presorted: true,
    unsafeCSS: `
      [data-item-section="content"] {
        flex-shrink: 0;
        min-width: max-content;
        max-width: none;
        overflow: visible;
      }
      [data-type="item"] {
        min-width: max-content;
      }
      [data-file-tree-virtualized-scroll="true"] {
        overflow-x: auto;
      }
    `,
    onSelectionChange: (paths) => {
      if (paths[0] && files.some((file) => file.name === paths[0]))
        navigate(entry.repo.path, paths[0]);
    },
  });
  useEffect(() => {
    model.setSearch(search || null);
  }, [model, search]);
  const rows = useFileTreeSelector(model, (tree) => tree.getVisibleCount());
  const itemHeight = FILE_TREE_DENSITY_PRESETS[density].itemHeight;
  return (
    <FileTree
      model={model}
      className="file-tree"
      style={{ height: Math.min(maxVisibleTreeRows, rows) * itemHeight }}
    />
  );
}
function RepoRow({
  entry,
  search,
  density,
  workspace,
  navigate,
}: {
  entry: Entry;
  search: string;
  density: FileTreeDensityKeyword;
  workspace: WorkspaceState;
  navigate: Navigate;
}) {
  const [open, setOpen] = useState(false);
  const included = !!entry.selected;
  const total = stats(entry.data?.files || []);
  return (
    <Collapsible.Root
      className={`sidebar-repo ${included ? "" : "is-excluded"}`}
      open={included && open}
      onOpenChange={setOpen}
    >
      <div className="sidebar-repo-heading">
        <Checkbox.Root
          className="checkbox"
          aria-label={`Include ${entry.repo.name}`}
          checked={included}
          onCheckedChange={(checked) => {
            workspace.select(entry, checked);
            setOpen(checked);
          }}
        >
          <Checkbox.Indicator>
            <CheckIcon weight="bold" />
          </Checkbox.Indicator>
        </Checkbox.Root>
        {included ? (
          <Collapsible.Trigger
            className="sidebar-repo-toggle"
            title={entry.repo.path}
          >
            <CaretRightIcon className="disclosure" />
            <span className="sidebar-repo-name">{entry.repo.name}</span>
            {entry.repo.worktree && (
              <span className="worktree-label">worktree</span>
            )}
            {entry.loading ? (
              <span className="busy-dot" />
            ) : entry.error ? (
              <WarningCircleIcon aria-label="Could not load changes" />
            ) : included ? (
              <span className="diff-stat">
                <span className="added">
                  {total.added ? `+${total.added}` : ""}
                </span>
                <span className="removed">
                  {total.removed ? `−${total.removed}` : ""}
                </span>
              </span>
            ) : null}
          </Collapsible.Trigger>
        ) : (
          <span className="sidebar-repo-name" title={entry.repo.path}>
            {entry.repo.name}
          </span>
        )}
      </div>
      <Collapsible.Panel className="sidebar-repo-panel">
        {included && open && (
          <ComparisonPicker entry={entry} workspace={workspace} />
        )}
        {entry.error ? (
          <p className="sidebar-error">
            <WarningCircleIcon />
            {entry.error}
            <Button
              className="text-button"
              onClick={() => void workspace.reload(entry)}
            >
              Retry
            </Button>
          </p>
        ) : entry.loading && !entry.data ? (
          <div className="tree-skeleton" aria-label="Loading changed files">
            <i />
            <i />
            <i />
          </div>
        ) : entry.data?.files.length ? (
          <ChangedTree
            key={entry.data.version}
            entry={entry}
            search={search}
            density={density}
            navigate={navigate}
          />
        ) : (
          <p className="repo-note">No changes in this comparison.</p>
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
export function Sidebar({
  workspace,
  density,
  navigate,
}: {
  workspace: WorkspaceState;
  density: FileTreeDensityKeyword;
  navigate: Navigate;
}) {
  const [query, setQuery] = useState("");
  const pending = workspace.entries.some((entry) => entry.loading);
  const needle = query.trim().toLowerCase();
  // A repository whose own name matches shows all of its files; otherwise the
  // tree is filtered down to the files that match.
  const visible = workspace.entries.flatMap((entry) => {
    if (!needle || entry.repo.name.toLowerCase().includes(needle))
      return [{ entry, search: "" }];
    const hit = entry.data?.files.some((file) =>
      file.name.toLowerCase().includes(needle),
    );
    return hit ? [{ entry, search: query }] : [];
  });
  const row = ({ entry, search }: (typeof visible)[number]) => (
    <RepoRow
      key={entry.repo.path}
      entry={entry}
      search={search}
      density={density}
      workspace={workspace}
      navigate={navigate}
    />
  );
  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="sidebar-top">
        <div className="repository-summary">
          <FoldersIcon />
          <strong>Repositories</strong>
          <small>
            {workspace.scanning
              ? "Scanning…"
              : `${workspace.selected.length} of ${workspace.entries.length} selected`}
          </small>
        </div>
        <IconButton
          label="Rescan and reload changes"
          disabled={workspace.scanning || pending}
          onClick={() => void workspace.open(workspace.root, true)}
        >
          <ArrowsClockwiseIcon
            className={pending || workspace.scanning ? "spinning" : ""}
          />
        </IconButton>
      </div>
      <div className="sidebar-search search-field">
        <MagnifyingGlassIcon />
        <Input
          aria-label="Filter repositories and changed files"
          placeholder="Find a repo or loaded file…"
          value={query}
          onValueChange={setQuery}
        />
      </div>
      <nav
        className="repository-list"
        aria-label="Repositories and changed files"
      >
        {workspace.scanning && !workspace.entries.length ? (
          <div className="tree-skeleton" role="status">
            <i />
            <i />
            <i />
            <span>Discovering repositories…</span>
          </div>
        ) : (
          visible.map(row)
        )}
        {!workspace.scanning && !visible.length && (
          <p className="repo-note">
            {query
              ? "No matching repositories or files."
              : "This folder has no Git repositories or worktrees inside it."}
          </p>
        )}
      </nav>
    </aside>
  );
}
