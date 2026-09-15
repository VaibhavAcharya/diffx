import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { Separator } from "@base-ui/react/separator";
import { Button } from "@base-ui/react/button";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Input } from "@base-ui/react/input";
import { Popover } from "@base-ui/react/popover";
import { Switch } from "@base-ui/react/switch";
import { Virtualizer, WorkerPoolContextProvider } from "@pierre/diffs/react";
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";
import {
  IconContext,
  CaretDownIcon,
  CaretUpIcon,
  KeyboardIcon,
  MagnifyingGlassIcon,
  SidebarSimpleIcon,
  ColumnsIcon,
  RowsIcon,
  ArrowElbowDownLeftIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  CopyIcon,
  PencilSimpleIcon,
  FunnelSimpleIcon,
  GitDiffIcon,
  CheckCircleIcon,
  FolderOpenIcon,
  PlusCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Sidebar } from "./Sidebar";
import { ResizableSidebar } from "./ResizableSidebar";
import { DiffFile } from "./DiffView";
import { SettingsDialog } from "./Settings";
import { Empty, IconButton, Loading } from "./ui";
import { shortcuts, useKeyboard } from "./keyboard";
import { searchDiffs } from "./search";
import {
  useStore,
  tabName,
  type Settings,
  type Tab,
  type TabPatch,
} from "./store";
import {
  stats,
  useWorkspace,
  fileId,
  digest,
  reviewedFiles,
} from "./workspace";
import {
  changeKinds,
  noFilter,
  repoView,
  type ChangeKind,
  type Filter,
  type View,
} from "./filter";
import { comparisonSummary, reviewBranch } from "./comparison";
import "./assets/fonts/fonts.css";
import "./App.css";

const workerPool = { workerFactory: () => new DiffWorker() };
type Store = ReturnType<typeof useStore>;

function TabItem({
  tab,
  index,
  store,
  drop,
  onDrag,
  onOver,
}: {
  tab: Tab;
  index: number;
  store: Store;
  drop: { index: number; before: boolean } | null;
  onDrag: (
    state: { id: string; index: number; before: boolean } | null,
  ) => void;
  onOver: (index: number, before: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const name = tabName(tab, store.tabs);
  const commit = (value: string) => {
    setEditing(false);
    if (value.trim() !== (tab.name || "")) store.rename(tab.id, value.trim());
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <span
            className="tab"
            draggable={!editing}
            data-drop={
              drop?.index === index
                ? drop.before
                  ? "before"
                  : "after"
                : undefined
            }
            onDragStart={(event: DragEvent<HTMLSpanElement>) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", tab.id);
              onDrag({ id: tab.id, index, before: true });
            }}
            onDragOver={(event: DragEvent<HTMLSpanElement>) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              // Dragged data cannot be read until the drop, so the tab being
              // moved is the one remembered at the start of the drag.
              const box = event.currentTarget.getBoundingClientRect();
              onOver(index, event.clientX < box.left + box.width / 2);
            }}
            onDragEnd={() => onDrag(null)}
          />
        }
      >
        {editing ? (
          <Input
            className="tab-rename"
            autoFocus
            defaultValue={name}
            aria-label={`Rename ${name}`}
            maxLength={64}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(event.currentTarget.value);
              if (event.key === "Escape") setEditing(false);
              event.stopPropagation();
            }}
          />
        ) : (
          <>
            <Tabs.Tab
              className="tab-label"
              value={tab.id}
              title={tab.name ? `${tab.name}\n${tab.root}` : tab.root}
              onDoubleClick={() => setEditing(true)}
            >
              {name}
            </Tabs.Tab>
            <Button
              className="tab-close"
              aria-label={`Close ${name}`}
              onClick={() => store.close(tab.id)}
            >
              <XCircleIcon />
            </Button>
          </>
        )}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="floating">
          <ContextMenu.Popup className="popup menu">
            <ContextMenu.Item
              className="menu-item"
              onClick={() => setEditing(true)}
            >
              <PencilSimpleIcon />
              Rename tab
            </ContextMenu.Item>
            <ContextMenu.Item
              className="menu-item"
              disabled={!tab.name}
              onClick={() => store.rename(tab.id, "")}
            >
              <ArrowUUpLeftIcon />
              Reset name
            </ContextMenu.Item>
            <ContextMenu.Item
              className="menu-item"
              disabled={index === 0}
              onClick={() => store.move(tab.id, index - 1)}
            >
              <ArrowLeftIcon />
              Move left
            </ContextMenu.Item>
            <ContextMenu.Item
              className="menu-item"
              disabled={index === store.tabs.length - 1}
              onClick={() => store.move(tab.id, index + 1)}
            >
              <ArrowRightIcon />
              Move right
            </ContextMenu.Item>
            <ContextMenu.Item
              className="menu-item"
              onClick={() => store.duplicate(tab.id)}
            >
              <CopyIcon />
              Duplicate tab
            </ContextMenu.Item>
            <ContextMenu.Item
              className="menu-item"
              onClick={() => store.close(tab.id)}
            >
              <XCircleIcon />
              Close tab
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
function TabBar({ store, settings }: { store: Store; settings: Settings }) {
  const [drag, setDrag] = useState<{
    id: string;
    index: number;
    before: boolean;
  } | null>(null);
  // A drop lands before or after the tab under the pointer; removing the
  // dragged tab first shifts every later position down by one.
  function drop() {
    if (!drag) return;
    const from = store.tabs.findIndex((tab) => tab.id === drag.id);
    setDrag(null);
    if (from < 0) return;
    const target = drag.index + (drag.before ? 0 : 1);
    store.move(drag.id, target > from ? target - 1 : target);
  }
  return (
    <IconContext.Provider value={{ weight: "duotone", size: 16 }}>
      <div className="tab-bar">
        <Tabs.List
          className="tab-list"
          aria-label="Open workspaces"
          onDrop={drop}
          onDragOver={(event) => event.preventDefault()}
        >
          {store.tabs.map((tab, index) => (
            <TabItem
              key={tab.id}
              tab={tab}
              index={index}
              store={store}
              drop={drag}
              onDrag={setDrag}
              onOver={(over, before) =>
                setDrag(
                  (current) => current && { ...current, index: over, before },
                )
              }
            />
          ))}
        </Tabs.List>
        <Separator orientation="vertical" className="tab-separator" />
        <Tooltip.Root>
          <Tooltip.Trigger
            render={<Button />}
            className="tab-new"
            aria-label="Open a workspace folder"
            disabled={store.browsing}
            onClick={() => void store.browse()}
          >
            <PlusCircleIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner sideOffset={6}>
              <Tooltip.Popup className="tooltip">
                Open a workspace folder
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <div className="push" />
        {store.error && (
          <span className="tab-bar-error" role="alert">
            {store.error}
          </span>
        )}
        {!!store.recent.length && (
          <IconButton
            label={`Reopen ${tabName(store.recent[0], store.recent)}`}
            onClick={store.reopen}
          >
            <ArrowCounterClockwiseIcon />
          </IconButton>
        )}
        <SettingsDialog
          settings={settings}
          onChange={store.setSettings}
          onReset={store.resetSettings}
        />
      </div>
    </IconContext.Provider>
  );
}
function FilterMenu({
  filter,
  setFilter,
  progress,
  onReviewAll,
}: {
  filter: Filter;
  setFilter: (patch: Partial<Filter>) => void;
  progress: { reviewed: number; total: number };
  onReviewAll: (value: boolean) => void;
}) {
  const active =
    filter.kinds.length > 0 || filter.hideReviewed || filter.hideNoise;
  return (
    <Popover.Root>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={<Popover.Trigger />}
          className="icon-button"
          aria-label="Filter files"
          data-active={active || undefined}
        >
          <FunnelSimpleIcon />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={8}>
            <Tooltip.Popup className="tooltip">Filter files</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="floating"
        >
          <Popover.Popup className="popup filter-popup">
            <Popover.Title>Files in this review</Popover.Title>
            <span className="control-label">Change type</span>
            <ToggleGroup
              className="segmented"
              multiple
              aria-label="Change type"
              value={filter.kinds}
              onValueChange={(kinds) =>
                setFilter({ kinds: kinds as ChangeKind[] })
              }
            >
              {changeKinds.map((kind) => (
                <Toggle key={kind.value} value={kind.value}>
                  {kind.label}
                </Toggle>
              ))}
            </ToggleGroup>
            <div className="setting">
              <span className="setting-text">
                Hide generated files
                <small>
                  Lockfiles, snapshots, minified and generated output
                </small>
              </span>
              <Switch.Root
                className="switch"
                aria-label="Hide generated files"
                checked={filter.hideNoise}
                onCheckedChange={(hideNoise) => setFilter({ hideNoise })}
              >
                <Switch.Thumb className="switch-thumb" />
              </Switch.Root>
            </div>
            <div className="setting">
              <span className="setting-text">
                Hide reviewed files
                <small>
                  {progress.reviewed} of {progress.total} reviewed
                </small>
              </span>
              <Switch.Root
                className="switch"
                aria-label="Hide reviewed files"
                checked={filter.hideReviewed}
                onCheckedChange={(hideReviewed) => setFilter({ hideReviewed })}
              >
                <Switch.Thumb className="switch-thumb" />
              </Switch.Root>
            </div>
            <div className="filter-actions">
              <Button
                className="text-button"
                disabled={!progress.total}
                onClick={() => onReviewAll(true)}
              >
                <CheckCircleIcon />
                Mark shown files reviewed
              </Button>
              <Button
                className="text-button"
                disabled={!progress.reviewed}
                onClick={() => onReviewAll(false)}
              >
                <ArrowCounterClockwiseIcon />
                Clear review progress
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={<Dialog.Trigger />}
          className="icon-button"
          aria-label="Keyboard shortcuts"
        >
          <KeyboardIcon />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={8}>
            <Tooltip.Popup className="tooltip">
              Keyboard shortcuts
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="settings-dialog shortcuts-dialog">
          <header className="settings-header">
            <KeyboardIcon />
            <Dialog.Title>Keyboard shortcuts</Dialog.Title>
          </header>
          <Dialog.Description className="muted">
            These work while the review pane has focus, not while you are typing
            in a field.
          </Dialog.Description>
          <dl className="shortcut-list">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.keys}>
                <dt>
                  <kbd>{shortcut.keys}</kbd>
                </dt>
                <dd>{shortcut.action}</dd>
              </div>
            ))}
          </dl>
          <div className="settings-actions">
            <Dialog.Close className="primary-button">Done</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function WorkspaceView({
  tab,
  active,
  settings,
  setSettings,
  saveTab,
}: {
  tab: Tab;
  active: boolean;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  saveTab: (id: string, patch: TabPatch) => void;
}) {
  const save = useCallback(
    (patch: TabPatch) => saveTab(tab.id, patch),
    [saveTab, tab.id],
  );
  const workspace = useWorkspace(tab, save, {
    active,
    autoRefresh: settings.autoRefresh,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [cursor, setCursor] = useState<{ file: string; hunk: number } | null>(
    null,
  );
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState({ query: "", changedOnly: false });
  const [matchIndex, setMatchIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const [filter, setWholeFilter] = useState<Filter>(noFilter);
  const setFilter = useCallback(
    (patch: Partial<Filter>) =>
      setWholeFilter((previous) => ({ ...previous, ...patch })),
    [],
  );
  const views: View[] = workspace.entries.map((entry) => {
    const reviewed = reviewedFiles(entry);
    const view = repoView(
      entry.data?.files || [],
      entry.repo.name,
      filter,
      (name) => reviewed.has(name),
    );
    return {
      entry,
      reviewed,
      ...view,
      key: digest(view.files.map((file) => file.name)),
    };
  });
  const shown = views.filter((view) => view.entry.selected);
  const files = shown.flatMap((view) => view.files);
  const total = stats(files);
  const progress = {
    reviewed: shown.reduce((count, view) => count + view.reviewed.size, 0),
    total: shown.reduce(
      (count, view) => count + (view.entry.data?.files.length || 0),
      0,
    ),
  };
  const hidden = shown.reduce((count, view) => count + view.hidden, 0);
  const ordered = shown.flatMap((view) =>
    view.files.map((file) => ({
      view,
      file,
      id: fileId(view.entry.repo.path, file.name),
    })),
  );
  const matches = find.query.trim()
    ? searchDiffs(
        shown.map((view) => ({
          repo: view.entry.repo.path,
          files: view.files,
        })),
        find.query,
        find.changedOnly,
      )
    : [];
  const match = matches[matchIndex];
  const pending =
    workspace.scanning || shown.some((view) => view.entry.loading);
  const allCollapsed =
    files.length > 0 &&
    shown.every((view) =>
      view.files.every(
        (file) => !expanded.has(fileId(view.entry.repo.path, file.name)),
      ),
    );
  function navigate(repo: string, file?: string) {
    const id = fileId(repo, file);
    setExpanded((previous) => new Set(previous).add(id));
    setSidebarOpen(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ block: "start" }),
      ),
    );
  }
  function foldAll() {
    setExpanded(
      allCollapsed
        ? new Set(
            shown.flatMap((view) =>
              view.files.map((file) => fileId(view.entry.repo.path, file.name)),
            ),
          )
        : new Set(),
    );
  }
  function review(view: View, names: string[], value: boolean) {
    workspace.review(view.entry, names, value);
    if (value)
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const name of names)
          next.delete(fileId(view.entry.repo.path, name));
        return next;
      });
  }
  function reviewAll(value: boolean) {
    for (const view of shown)
      review(
        view,
        value
          ? view.files.map((file) => file.name)
          : Object.keys(view.entry.reviewed),
        value,
      );
  }
  // The rendered diff puts every line in its own shadow DOM element, and only
  // the visible ones exist. Scroll close with the line height, then look again.
  function scrollToRow(id: string, row: number) {
    const settle = (tries: number) => {
      const container = document.getElementById(id);
      const diff = container?.querySelector("diffs-container");
      const line = diff?.shadowRoot?.querySelector(
        `[data-line][data-line-index^="${row},"]`,
      );
      if (line instanceof HTMLElement)
        return line.scrollIntoView({ block: "center" });
      const scroller = container?.closest(".review-scroll");
      if (!(scroller instanceof HTMLElement) || !(diff instanceof HTMLElement))
        return container?.scrollIntoView({ block: "start" });
      const height =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--diffs-line-height",
          ),
        ) || 21;
      const top =
        diff.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      scroller.scrollTo({
        top: top + row * height - scroller.clientHeight / 3,
      });
      if (tries > 0) requestAnimationFrame(() => settle(tries - 1));
    };
    requestAnimationFrame(() => requestAnimationFrame(() => settle(4)));
  }
  function goToMatch(next: number) {
    if (!matches.length) return;
    const index = (next + matches.length) % matches.length;
    const target = matches[index];
    const id = fileId(target.repo, target.file);
    setMatchIndex(index);
    setCursor({ file: id, hunk: 0 });
    setExpanded((previous) => new Set(previous).add(id));
    scrollToRow(id, target.row);
  }
  function goToFile(delta: number) {
    if (!ordered.length) return;
    const current = ordered.findIndex((item) => item.id === cursor?.file);
    const index = Math.min(
      ordered.length - 1,
      Math.max(0, (current < 0 ? (delta > 0 ? -1 : 0) : current) + delta),
    );
    const target = ordered[index];
    setCursor({ file: target.id, hunk: 0 });
    setExpanded((previous) => new Set(previous).add(target.id));
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(target.id)?.scrollIntoView({ block: "start" }),
      ),
    );
  }
  function goToHunk(delta: number) {
    if (!ordered.length) return;
    const current = Math.max(
      0,
      ordered.findIndex((item) => item.id === cursor?.file),
    );
    const hunk = (cursor?.hunk ?? 0) + delta;
    const item = ordered[current];
    if (hunk >= 0 && hunk < item.file.hunks.length) {
      setCursor({ file: item.id, hunk });
      setExpanded((previous) => new Set(previous).add(item.id));
      return scrollToRow(item.id, item.file.hunks[hunk].unifiedLineStart);
    }
    const next = ordered[current + (delta > 0 ? 1 : -1)];
    if (!next) return;
    const index = delta > 0 ? 0 : Math.max(0, next.file.hunks.length - 1);
    setCursor({ file: next.id, hunk: index });
    setExpanded((previous) => new Set(previous).add(next.id));
    if (next.file.hunks[index])
      scrollToRow(next.id, next.file.hunks[index].unifiedLineStart);
    else
      requestAnimationFrame(() =>
        document.getElementById(next.id)?.scrollIntoView({ block: "start" }),
      );
  }
  useKeyboard(active, (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const at = ordered.find((item) => item.id === cursor?.file);
    const keys: Record<string, () => void> = {
      j: () => goToFile(1),
      k: () => goToFile(-1),
      n: () => goToHunk(1),
      p: () => goToHunk(-1),
      o: () =>
        at &&
        setExpanded((previous) => {
          const next = new Set(previous);
          if (next.has(at.id)) next.delete(at.id);
          else next.add(at.id);
          return next;
        }),
      e: foldAll,
      r: () =>
        at &&
        review(at.view, [at.file.name], !at.view.reviewed.has(at.file.name)),
      f: () => setFinding(true),
      "/": () => searchRef.current?.focus(),
      R: () => void workspace.open(workspace.root, true),
      "?": () => setShortcutsOpen(true),
      Escape: () => setFinding(false),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  });
  return (
    <>
      <ResizableSidebar
        width={settings.sidebarWidth}
        onResize={(sidebarWidth) => setSettings({ sidebarWidth })}
      >
        <Sidebar
          views={views}
          workspace={workspace}
          density={settings.density}
          filter={filter}
          setFilter={setFilter}
          navigate={navigate}
          setAutoRefresh={(autoRefresh) => setSettings({ autoRefresh })}
          searchRef={searchRef}
        />
      </ResizableSidebar>
      <main className="review-pane" aria-busy={pending}>
        <header className="review-toolbar">
          <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <Dialog.Trigger
              className="icon-button mobile-only"
              aria-label="Open sidebar"
            >
              <SidebarSimpleIcon />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="dialog-backdrop" />
              <Dialog.Popup className="mobile-sidebar">
                <Dialog.Title className="sr-only">
                  Workspace navigation
                </Dialog.Title>
                <Dialog.Close
                  className="icon-button mobile-close"
                  aria-label="Close sidebar"
                >
                  <XCircleIcon />
                </Dialog.Close>
                <Sidebar
                  views={views}
                  workspace={workspace}
                  density={settings.density}
                  filter={filter}
                  setFilter={setFilter}
                  navigate={navigate}
                  setAutoRefresh={(autoRefresh) => setSettings({ autoRefresh })}
                />
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="review-title">
            <GitDiffIcon />
            <strong>Changes</strong>
            <span className="count-badge">{files.length}</span>
            <span className="toolbar-caption">
              {shown.length}{" "}
              {shown.length === 1 ? "repository" : "repositories"}
              {progress.total > 0 &&
                ` · ${progress.reviewed}/${progress.total} reviewed`}
            </span>
          </div>
          <div className="push" />
          <span className="diff-stat toolbar-stat">
            <span className="added">
              {total.added ? `+${total.added}` : ""}
            </span>
            <span className="removed">
              {total.removed ? `−${total.removed}` : ""}
            </span>
          </span>
          <IconButton
            label="Search in the diffs"
            pressed={finding}
            disabled={!files.length}
            onClick={() => {
              setFinding(true);
              requestAnimationFrame(() => findRef.current?.focus());
            }}
          >
            <MagnifyingGlassIcon />
          </IconButton>
          <FilterMenu
            filter={filter}
            setFilter={setFilter}
            progress={progress}
            onReviewAll={reviewAll}
          />
          <ToggleGroup
            className="view-toggle"
            aria-label="Diff layout"
            value={[settings.layout]}
            onValueChange={(value) => {
              if (value[0] === "split" || value[0] === "unified")
                setSettings({ layout: value[0] });
            }}
          >
            <Toggle
              value="unified"
              aria-label="Unified view"
              title="Unified view"
            >
              <RowsIcon />
            </Toggle>
            <Toggle value="split" aria-label="Split view" title="Split view">
              <ColumnsIcon />
            </Toggle>
          </ToggleGroup>
          <IconButton
            label="Wrap lines"
            pressed={settings.wrap}
            onClick={() => setSettings({ wrap: !settings.wrap })}
          >
            <ArrowElbowDownLeftIcon />
          </IconButton>
          <IconButton
            label={allCollapsed ? "Expand all files" : "Collapse all files"}
            disabled={!files.length}
            onClick={foldAll}
          >
            {allCollapsed ? (
              <ArrowsOutLineVerticalIcon />
            ) : (
              <ArrowsInLineVerticalIcon />
            )}
          </IconButton>
          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />
        </header>
        {finding && (
          <div className="diff-search">
            <MagnifyingGlassIcon />
            <input
              ref={findRef}
              className="diff-search-input"
              autoFocus
              aria-label="Search inside the diffs"
              placeholder="Search in the loaded diffs…"
              value={find.query}
              onChange={(event) => {
                setFind({ ...find, query: event.target.value });
                setMatchIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFinding(false);
                if (event.key === "Enter")
                  goToMatch(matchIndex + (event.shiftKey ? -1 : 1));
              }}
            />
            <Toggle
              className="text-button"
              aria-label="Search changed lines only"
              pressed={find.changedOnly}
              onPressedChange={(changedOnly) => {
                setFind({ ...find, changedOnly });
                setMatchIndex(0);
              }}
            >
              Changed lines only
            </Toggle>
            <span className="muted diff-search-count">
              {find.query.trim()
                ? matches.length
                  ? `${matchIndex + 1} of ${matches.length}`
                  : "No matches"
                : ""}
            </span>
            <IconButton
              label="Previous match"
              disabled={!matches.length}
              onClick={() => goToMatch(matchIndex - 1)}
            >
              <CaretUpIcon />
            </IconButton>
            <IconButton
              label="Next match"
              disabled={!matches.length}
              onClick={() => goToMatch(matchIndex + 1)}
            >
              <CaretDownIcon />
            </IconButton>
            <IconButton
              label="Close the search"
              onClick={() => setFinding(false)}
            >
              <XCircleIcon />
            </IconButton>
          </div>
        )}
        <Virtualizer
          className="review-scroll"
          contentClassName="review-content"
        >
          {workspace.error && (
            <p className="notice" role="alert">
              {workspace.error}
            </p>
          )}
          {workspace.warnings.map((warning) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}
          {!shown.length &&
            (pending ? (
              <Loading lines={3}>Discovering repositories…</Loading>
            ) : (
              <Empty
                icon={
                  workspace.entries.length ? (
                    <CheckCircleIcon />
                  ) : (
                    <FolderOpenIcon />
                  )
                }
                title={
                  workspace.entries.length
                    ? "Select repositories to review"
                    : "No repositories here"
                }
              >
                {workspace.entries.length
                  ? "Select repositories in the sidebar to load their changes. Each repository keeps its own comparison branches."
                  : "This folder has no Git repositories or worktrees inside it."}
              </Empty>
            ))}
          {shown.map((view) => (
            <section
              id={fileId(view.entry.repo.path)}
              className="repo-diffs"
              key={view.entry.repo.path}
              aria-label={`Changes in ${view.entry.repo.name}`}
            >
              <div className="repo-divider">
                <strong>{view.entry.repo.name}</strong>
                <span>
                  {view.files.length}{" "}
                  {view.files.length === 1 ? "file" : "files"}
                  {view.hidden > 0 && ` · ${view.hidden} hidden`}
                </span>
                {view.entry.repo.worktree && (
                  <span className="worktree-label">
                    {view.entry.repo.parentName
                      ? `worktree of ${view.entry.repo.parentName}`
                      : "worktree"}
                  </span>
                )}
                <span className="divider-comparison">
                  {comparisonSummary(view.entry.target, view.entry.repo.branch)}
                  {view.entry.target !== "@uncommitted" &&
                    ` · Compared with ${reviewBranch(view.entry.base, view.entry.repo.branch)}`}
                </span>
                <span className="divider-line" />
                {view.entry.loading && <span role="status">Updating…</span>}
              </div>
              {view.entry.error ? (
                <p role="alert" className="notice">
                  {view.entry.error}
                  <Button
                    className="text-button"
                    onClick={() => void workspace.reload(view.entry)}
                  >
                    Retry
                  </Button>
                </p>
              ) : view.entry.loading && !view.entry.data ? (
                <Loading lines={2}>Loading {view.entry.repo.name}…</Loading>
              ) : (
                <>
                  {view.entry.data?.warnings.map((warning) => (
                    <p className="notice" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {!view.files.length && (
                    <p className="file-note">
                      {view.hidden > 0
                        ? `Every changed file is hidden by the current filter (${view.hidden}).`
                        : view.entry.target === "@uncommitted"
                          ? "No uncommitted changes."
                          : `No changes compared with ${reviewBranch(view.entry.base, view.entry.repo.branch)}.`}
                    </p>
                  )}
                  <div
                    className="diff-files"
                    data-updating={view.entry.loading || undefined}
                  >
                    {view.files.map((file) => (
                      <DiffFile
                        key={`${view.entry.data!.prints[file.name]}:${file.name}`}
                        entry={view.entry}
                        file={file}
                        settings={settings}
                        binary={!!view.entry.data?.binary.has(file.name)}
                        cursor={
                          cursor?.file ===
                          fileId(view.entry.repo.path, file.name)
                        }
                        highlight={
                          match &&
                          match.repo === view.entry.repo.path &&
                          match.file === file.name
                            ? { line: match.line, side: match.side }
                            : undefined
                        }
                        reviewed={view.reviewed.has(file.name)}
                        changedSinceReview={
                          !view.reviewed.has(file.name) &&
                          !!view.entry.reviewed[file.name]
                        }
                        onReview={(value) => review(view, [file.name], value)}
                        collapsed={
                          !expanded.has(fileId(view.entry.repo.path, file.name))
                        }
                        onCollapse={(value) =>
                          setExpanded((previous) => {
                            const next = new Set(previous);
                            const id = fileId(view.entry.repo.path, file.name);
                            if (value) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          ))}
          {!!files.length && !pending && (
            <div className="review-end">
              <CheckCircleIcon />
              <span>
                End of changes
                {hidden > 0 &&
                  ` · ${hidden} ${hidden === 1 ? "file" : "files"} hidden by the filter`}
              </span>
            </div>
          )}
        </Virtualizer>
      </main>
    </>
  );
}
function App() {
  const store = useStore();
  const settings = store.settings;
  const theme = settings?.theme;
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
  }, [theme]);
  useKeyboard(store.tabs.length > 1, (event) => {
    const index = store.tabs.findIndex((tab) => tab.id === store.activeTab);
    if (index < 0) return;
    const step = event.key === "]" || event.key === "ArrowRight" ? 1 : -1;
    const arrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (event.altKey && event.shiftKey && arrow) {
      event.preventDefault();
      store.move(store.tabs[index].id, index + step);
    } else if (
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      (event.key === "[" || event.key === "]")
    ) {
      event.preventDefault();
      store.activate(
        store.tabs[(index + step + store.tabs.length) % store.tabs.length].id,
      );
    }
  });
  return (
    <IconContext.Provider value={{ weight: "duotone", size: 18 }}>
      <Tooltip.Provider delay={350}>
        <WorkerPoolContextProvider
          poolOptions={workerPool}
          highlighterOptions={{}}
        >
          <Tabs.Root
            className="app-shell"
            value={store.activeTab}
            onValueChange={(value) => store.activate(String(value))}
          >
            {settings && <TabBar store={store} settings={settings} />}
            {settings &&
              store.tabs
                .filter((tab) => store.visited.includes(tab.id))
                .map((tab) => (
                  <Tabs.Panel
                    key={tab.id}
                    value={tab.id}
                    keepMounted
                    className="workspace-view"
                  >
                    <WorkspaceView
                      tab={tab}
                      active={tab.id === store.activeTab}
                      settings={settings}
                      setSettings={store.setSettings}
                      saveTab={store.saveTab}
                    />
                  </Tabs.Panel>
                ))}
            {!store.ready && (
              <div className="workspace-view">
                {store.error ? (
                  <p className="notice" role="alert">
                    {store.error}
                    <Button
                      className="text-button"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </Button>
                  </p>
                ) : (
                  <Loading lines={2}>Restoring your workspaces…</Loading>
                )}
              </div>
            )}
            {store.ready && !store.tabs.length && (
              <div className="workspace-view">
                <Empty icon={<FolderOpenIcon />} title="Open a workspace">
                  Choose a directory containing your repositories and feature
                  worktrees. Every tab remembers its own directory,
                  repositories, and comparison branches.
                  <Button
                    className="primary-button"
                    onClick={() => void store.browse()}
                    disabled={store.browsing}
                  >
                    <FolderOpenIcon />
                    {store.browsing ? "Choosing…" : "Choose a folder"}
                  </Button>
                </Empty>
              </div>
            )}
          </Tabs.Root>
        </WorkerPoolContextProvider>
      </Tooltip.Provider>
    </IconContext.Provider>
  );
}
export default App;
