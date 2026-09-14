import { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Collapsible } from "@base-ui/react/collapsible";
import { Input } from "@base-ui/react/input";
import { Popover } from "@base-ui/react/popover";
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
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { flattenEmptyDirectories } from "./order";
import { RepoSelector } from "./RepoSelector";
import { BranchPicker, IconButton, type BranchGroup } from "./ui";
import {
  comparisonLabel,
  stats,
  type Entry,
  type useWorkspace,
} from "./workspace";

type WorkspaceState = ReturnType<typeof useWorkspace>;
type Navigate = (repo: string, file?: string) => void;
// The tallest a single repository's tree grows before it scrolls on its own.
const maxVisibleTreeRows = 20;

function branchGroups(entry: Entry, working: boolean): BranchGroup[] {
  const { local, remote } = entry.repo.branches;
  return [
    {
      value: "Current",
      items: [
        ...(working
          ? [
              {
                value: "@working",
                label: `working tree (${entry.repo.branch})`,
              },
            ]
          : []),
        { value: "HEAD", label: working ? "HEAD (committed only)" : "HEAD" },
      ],
    },
    { value: "Local", items: local.map((value) => ({ value, label: value })) },
    {
      value: "Remote",
      items: remote.map((value) => ({ value, label: value })),
    },
  ];
}
function Comparison({
  entry,
  workspace,
}: {
  entry: Entry;
  workspace: WorkspaceState;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="compare-chip"
        aria-label={`Comparison for ${entry.repo.name}`}
      >
        <GitBranchIcon />
        <span title={`${entry.base} → ${comparisonLabel(entry.target)}`}>
          {entry.base}
          <ArrowRightIcon />
          {comparisonLabel(entry.target)}
        </span>
        <CaretDownIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="floating"
        >
          <Popover.Popup className="popup comparison-popup">
            <Popover.Title>Compare</Popover.Title>
            <Popover.Description className="muted">
              {entry.repo.name}
              {entry.repo.worktree ? " · worktree" : ""}
            </Popover.Description>
            <BranchPicker
              label="Base"
              value={entry.base}
              groups={branchGroups(entry, false)}
              onChange={(base) => workspace.configure(entry, { base })}
            />
            <div className="compare-connector">
              <ArrowRightIcon />
            </div>
            <BranchPicker
              label="Compare"
              value={entry.target}
              groups={branchGroups(entry, true)}
              onChange={(target) => workspace.configure(entry, { target })}
            />
            <p className="popup-note">
              Changes since the common ancestor. Uncommitted edits are included
              only for the working tree.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
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
  const included = workspace.included(entry);
  const total = stats(entry.data?.files || []);
  const count = entry.data?.files.length;
  return (
    <Collapsible.Root
      className={`sidebar-repo ${included ? "" : "is-excluded"}`}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="sidebar-repo-heading">
        <Checkbox.Root
          className="checkbox"
          aria-label={`Include ${entry.repo.name}`}
          checked={included}
          onCheckedChange={(checked) => workspace.select(entry, checked)}
        >
          <Checkbox.Indicator>
            <CheckIcon weight="bold" />
          </Checkbox.Indicator>
        </Checkbox.Root>
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
          ) : included ? (
            <span className="diff-stat">
              <span className="added">
                {total.added ? `+${total.added}` : ""}
              </span>
              <span className="removed">
                {total.removed ? `−${total.removed}` : ""}
              </span>
            </span>
          ) : (
            <span className="selector-count">
              {entry.error ? <WarningCircleIcon /> : (count ?? "—")}
            </span>
          )}
        </Collapsible.Trigger>
      </div>
      <Collapsible.Panel className="sidebar-repo-panel">
        <Comparison entry={entry} workspace={workspace} />
        {!included ? (
          <p className="repo-note">
            {count
              ? `${count} changed ${count === 1 ? "file" : "files"}, not in this review.`
              : "Not in this review."}
          </p>
        ) : entry.error ? (
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
  const [showExcluded, setShowExcluded] = useState<boolean | null>(null);
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
  const inReview = visible.filter(({ entry }) => workspace.included(entry));
  const excluded = visible.filter(({ entry }) => !workspace.included(entry));
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
          aria-label="Filter repositories and changed files"
          placeholder="Find a repository or file…"
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
          inReview.map(row)
        )}
        {!!excluded.length && (
          <Collapsible.Root
            className="excluded-group"
            open={showExcluded ?? !!needle}
            onOpenChange={setShowExcluded}
          >
            <Collapsible.Trigger className="excluded-heading">
              <CaretRightIcon className="disclosure" />
              Excluded
              <span className="selector-count">{excluded.length}</span>
            </Collapsible.Trigger>
            <Collapsible.Panel>{excluded.map(row)}</Collapsible.Panel>
          </Collapsible.Root>
        )}
        {!workspace.scanning && !visible.length && (
          <p className="repo-note">
            {query
              ? "No matching repositories or files."
              : "This folder has no Git repositories or worktrees inside it."}
          </p>
        )}
        {!workspace.scanning && !!visible.length && !inReview.length && (
          <p className="repo-note">
            Nothing is in this review. Tick a repository below to add it.
          </p>
        )}
      </nav>
    </aside>
  );
}
