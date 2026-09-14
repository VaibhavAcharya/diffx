import { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
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
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { RepoSelector } from "./RepoSelector";
import { IconButton } from "./ui";
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
    flattenEmptyDirectories: true,
    density,
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
function RepoFiles({
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
  const [open, setOpen] = useState(true);
  const total = stats(entry.data?.files || []);
  return (
    <Collapsible.Root
      className="sidebar-repo"
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger
        className="sidebar-repo-heading"
        title={entry.repo.path}
      >
        <CaretRightIcon className="disclosure" />
        <span>{entry.repo.name}</span>
        {entry.loading ? (
          <span className="busy-dot" />
        ) : (
          <span className="diff-stat">
            <span className="added">
              {total.added ? `+${total.added}` : ""}
            </span>
            <span className="removed">
              {total.removed ? `−${total.removed}` : ""}
            </span>
          </span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel className="sidebar-repo-panel">
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
  const visible = workspace.selected.flatMap((entry) => {
    if (!needle || entry.repo.name.toLowerCase().includes(needle))
      return [{ entry, search: "" }];
    const hit = entry.data?.files.some((file) =>
      file.name.toLowerCase().includes(needle),
    );
    return hit ? [{ entry, search: query }] : [];
  });
  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="sidebar-top">
        <RepoSelector workspace={workspace} />
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
          aria-label="Filter changed files"
          placeholder="Find a file…"
          value={query}
          onValueChange={setQuery}
        />
      </div>
      <nav className="repository-list" aria-label="Changed files">
        {workspace.scanning && !workspace.entries.length ? (
          <div className="tree-skeleton" role="status">
            <i />
            <i />
            <i />
            <span>Discovering repositories…</span>
          </div>
        ) : (
          visible.map(({ entry, search }) => (
            <RepoFiles
              key={entry.repo.path}
              entry={entry}
              search={search}
              density={density}
              workspace={workspace}
              navigate={navigate}
            />
          ))
        )}
        {!workspace.scanning && !visible.length && (
          <p className="repo-note">
            {query
              ? "No matching files."
              : workspace.selected.length
                ? "No changes in the current comparisons."
                : "Choose repositories to review."}
          </p>
        )}
      </nav>
    </aside>
  );
}
