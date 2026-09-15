import { useEffect, useState, type RefObject } from "react";
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
  CheckCircleIcon,
  FoldersIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { flattenEmptyDirectories } from "./order";
import { IconButton } from "./ui";
import { ComparisonPicker } from "./ComparisonPicker";
import { stats, type useWorkspace } from "./workspace";
import type { Filter, View } from "./filter";

type WorkspaceState = ReturnType<typeof useWorkspace>;
type Watch = WorkspaceState["watch"];
type Navigate = (repo: string, file?: string) => void;
// The tallest a single repository's tree grows before it scrolls on its own.
const maxVisibleTreeRows = 20;

// A worktree sits under its repository, so its own row only needs the part of
// the path that is not the repository it belongs to.
function repoLabel(repo: View["entry"]["repo"]) {
  if (!repo.parentName) return repo.name;
  const suffix = repo.name.startsWith(`${repo.parentName}/`)
    ? repo.name.slice(repo.parentName.length + 1)
    : repo.name;
  return suffix.replace(/^\.worktrees\//, "");
}
function since(from: number, now: number) {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}
function WatchStatus({
  watch,
  onToggle,
}: {
  watch: Watch;
  onToggle: (value: boolean) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!watch.refreshedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [watch.refreshedAt]);
  const state = !watch.on
    ? "off"
    : watch.paused
      ? "paused"
      : watch.checking
        ? "checking"
        : "watching";
  const label = !watch.on
    ? "Auto-refresh off"
    : watch.paused
      ? "Paused while this tab is in the background"
      : watch.checking
        ? "Checking for changes…"
        : watch.refreshedAt
          ? `Refreshed ${since(watch.refreshedAt, now)}`
          : "Watching for changes";
  return (
    <p className="watch-status" data-state={state}>
      <span className="watch-dot" />
      <span className="watch-label">{label}</span>
      <Button className="text-button" onClick={() => onToggle(!watch.on)}>
        {watch.on ? "Turn off" : "Turn on"}
      </Button>
    </p>
  );
}
function ChangedTree({
  view,
  search,
  density,
  navigate,
}: {
  view: View;
  search: string;
  density: FileTreeDensityKeyword;
  navigate: Navigate;
}) {
  const files = view.files;
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
        navigate(view.entry.repo.path, paths[0]);
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
  view,
  search,
  density,
  workspace,
  navigate,
}: {
  view: View;
  search: string;
  density: FileTreeDensityKeyword;
  workspace: WorkspaceState;
  navigate: Navigate;
}) {
  const [open, setOpen] = useState(false);
  const { entry } = view;
  const included = !!entry.selected;
  const total = stats(view.files);
  const loaded = entry.data?.files.length || 0;
  return (
    <Collapsible.Root
      className={`sidebar-repo ${included ? "" : "is-excluded"}`}
      data-nested={entry.repo.parentName || undefined}
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
            <span className="sidebar-repo-name">{repoLabel(entry.repo)}</span>
            <span
              className="repo-branch"
              title={`Checked out at ${entry.repo.branch}`}
            >
              {entry.repo.branch}
            </span>
            {entry.loading ? (
              <span className="busy-dot" />
            ) : entry.error ? (
              <WarningCircleIcon aria-label="Could not load changes" />
            ) : (
              <>
                {view.reviewed.size > 0 && (
                  <span
                    className="review-count"
                    title={`${view.reviewed.size} of ${loaded} files reviewed`}
                  >
                    <CheckCircleIcon />
                    {view.reviewed.size}/{loaded}
                  </span>
                )}
                <span className="diff-stat">
                  <span className="added">
                    {total.added ? `+${total.added}` : ""}
                  </span>
                  <span className="removed">
                    {total.removed ? `−${total.removed}` : ""}
                  </span>
                </span>
              </>
            )}
          </Collapsible.Trigger>
        ) : (
          <>
            <span className="sidebar-repo-name" title={entry.repo.path}>
              {repoLabel(entry.repo)}
            </span>
            <span className="repo-branch">{entry.repo.branch}</span>
          </>
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
        ) : view.files.length ? (
          <ChangedTree
            key={view.key}
            view={view}
            search={search}
            density={density}
            navigate={navigate}
          />
        ) : (
          <p className="repo-note">
            {view.hidden > 0
              ? `All ${view.hidden} changed files are hidden by the filter.`
              : "No changes in this comparison."}
          </p>
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
export function Sidebar({
  views,
  workspace,
  density,
  filter,
  setFilter,
  navigate,
  setAutoRefresh,
  searchRef,
}: {
  views: View[];
  workspace: WorkspaceState;
  density: FileTreeDensityKeyword;
  filter: Filter;
  setFilter: (patch: Partial<Filter>) => void;
  navigate: Navigate;
  setAutoRefresh: (value: boolean) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const pending = workspace.entries.some((entry) => entry.loading);
  const listed = views.filter((view) => view.listed);
  const matching = listed.filter((view) => !view.entry.selected);
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
          ref={searchRef}
          aria-label="Filter repositories and changed files"
          placeholder="Find a repo or loaded file…"
          value={filter.query}
          onValueChange={(query) => setFilter({ query })}
        />
        {!!filter.query && (
          <Button
            className="icon-button clear-search"
            aria-label="Clear the search"
            onClick={() => setFilter({ query: "" })}
          >
            <XIcon />
          </Button>
        )}
      </div>
      <div className="bulk-actions">
        <Button
          className="text-button"
          disabled={!matching.length}
          onClick={() =>
            matching.forEach((view) => workspace.select(view.entry, true))
          }
        >
          <ListChecksIcon />
          {filter.query.trim() ? "Select matching" : "Select all"}
          <span>{matching.length}</span>
        </Button>
        <div className="push" />
        <Button
          className="text-button"
          disabled={!workspace.selected.length}
          onClick={() =>
            workspace.selected.forEach((entry) =>
              workspace.select(entry, false),
            )
          }
        >
          Clear selection
        </Button>
      </div>
      <WatchStatus watch={workspace.watch} onToggle={setAutoRefresh} />
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
          listed.map((view) => (
            <RepoRow
              key={view.entry.repo.path}
              view={view}
              search={view.named ? "" : filter.query}
              density={density}
              workspace={workspace}
              navigate={navigate}
            />
          ))
        )}
        {!workspace.scanning && !listed.length && (
          <p className="repo-note">
            {filter.query
              ? "No matching repositories or files."
              : "This folder has no Git repositories or worktrees inside it."}
          </p>
        )}
      </nav>
    </aside>
  );
}
