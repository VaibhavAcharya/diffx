import { useCallback, useEffect, useState } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { Separator } from "@base-ui/react/separator";
import { Button } from "@base-ui/react/button";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Virtualizer, WorkerPoolContextProvider } from "@pierre/diffs/react";
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";
import {
  IconContext,
  SidebarSimpleIcon,
  ColumnsIcon,
  RowsIcon,
  ArrowElbowDownLeftIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  ArrowCounterClockwiseIcon,
  CopyIcon,
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
import {
  useStore,
  tabName,
  type Settings,
  type Tab,
  type TabPatch,
} from "./store";
import { comparisonLabel, stats, useWorkspace, fileId } from "./workspace";
import "./assets/fonts/fonts.css";
import "./App.css";

const workerPool = { workerFactory: () => new DiffWorker() };
type Store = ReturnType<typeof useStore>;

function TabBar({ store, settings }: { store: Store; settings: Settings }) {
  return (
    <IconContext.Provider value={{ weight: "duotone", size: 16 }}>
      <div className="tab-bar">
        <Tabs.List className="tab-list" aria-label="Open workspaces">
          {store.tabs.map((tab) => {
            const name = tabName(tab, store.tabs);
            return (
              <ContextMenu.Root key={tab.id}>
                <ContextMenu.Trigger render={<span className="tab" />}>
                  <Tabs.Tab
                    className="tab-label"
                    value={tab.id}
                    title={tab.root}
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
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Positioner className="floating">
                    <ContextMenu.Popup className="popup menu">
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
          })}
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
function WorkspaceView({
  tab,
  settings,
  setSettings,
  saveTab,
}: {
  tab: Tab;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  saveTab: (id: string, patch: TabPatch) => void;
}) {
  const save = useCallback(
    (patch: TabPatch) => saveTab(tab.id, patch),
    [saveTab, tab.id],
  );
  const workspace = useWorkspace(tab, save);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const { selected } = workspace;
  const files = selected.flatMap((entry) => entry.data?.files || []);
  const total = stats(files);
  const pending =
    workspace.scanning || workspace.entries.some((entry) => entry.loading);
  const allCollapsed =
    files.length > 0 &&
    selected.every((entry) =>
      entry.data?.files.every((file) =>
        collapsed.has(fileId(entry.repo.path, file.name)),
      ),
    );
  function navigate(repo: string, file?: string) {
    const id = fileId(repo, file);
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setSidebarOpen(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ block: "start" }),
      ),
    );
  }
  function foldAll() {
    setCollapsed(
      allCollapsed
        ? new Set()
        : new Set(
            selected.flatMap(
              (entry) =>
                entry.data?.files.map((file) =>
                  fileId(entry.repo.path, file.name),
                ) || [],
            ),
          ),
    );
  }
  return (
    <>
      <ResizableSidebar
        width={settings.sidebarWidth}
        onResize={(sidebarWidth) => setSettings({ sidebarWidth })}
      >
        <Sidebar
          workspace={workspace}
          density={settings.density}
          navigate={navigate}
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
                  workspace={workspace}
                  density={settings.density}
                  navigate={navigate}
                />
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="review-title">
            <GitDiffIcon />
            <strong>Changes</strong>
            <span className="count-badge">{files.length}</span>
            <span className="toolbar-caption">
              {selected.length}{" "}
              {selected.length === 1 ? "repository" : "repositories"}
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
        </header>
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
          {!selected.length &&
            (pending ? (
              <Loading lines={3}>
                Finding changes across your workspace…
              </Loading>
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
                    ? "Nothing selected"
                    : "No repositories here"
                }
              >
                {workspace.entries.length
                  ? "Repositories without changes start deselected. Open the Repositories control to include more, or change what they compare against."
                  : "This folder has no Git repositories or worktrees inside it."}
              </Empty>
            ))}
          {selected.map((entry) => (
            <section
              id={fileId(entry.repo.path)}
              className="repo-diffs"
              key={entry.repo.path}
              aria-label={`Changes in ${entry.repo.name}`}
            >
              <div className="repo-divider">
                <strong>{entry.repo.name}</strong>
                <span>
                  {entry.data?.files.length || 0}{" "}
                  {entry.data?.files.length === 1 ? "file" : "files"}
                </span>
                {entry.repo.worktree && (
                  <span className="worktree-label">worktree</span>
                )}
                <span className="divider-comparison">
                  {entry.base} → {comparisonLabel(entry.target)}
                </span>
                <span className="divider-line" />
                {entry.loading && <span role="status">Updating…</span>}
              </div>
              {entry.error ? (
                <p role="alert" className="notice">
                  {entry.error}
                  <Button
                    className="text-button"
                    onClick={() => void workspace.reload(entry)}
                  >
                    Retry
                  </Button>
                </p>
              ) : entry.loading && !entry.data ? (
                <Loading lines={2}>Loading {entry.repo.name}…</Loading>
              ) : (
                <>
                  {entry.data?.warnings.map((warning) => (
                    <p className="notice" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {!entry.data?.files.length && (
                    <p className="file-note">
                      No changes against {entry.base}.
                    </p>
                  )}
                  <div
                    className="diff-files"
                    data-updating={entry.loading || undefined}
                  >
                    {entry.data?.files.map((file) => (
                      <DiffFile
                        key={`${entry.data!.version}:${file.name}`}
                        entry={entry}
                        file={file}
                        settings={settings}
                        collapsed={collapsed.has(
                          fileId(entry.repo.path, file.name),
                        )}
                        onCollapse={(value) =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);
                            const id = fileId(entry.repo.path, file.name);
                            if (value) next.add(id);
                            else next.delete(id);
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
              <span>End of changes</span>
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
                      settings={settings}
                      setSettings={store.setSettings}
                      saveTab={store.saveTab}
                    />
                  </Tabs.Panel>
                ))}
            {!store.ready && (
              <div className="workspace-view">
                <Loading lines={2}>Restoring your workspaces…</Loading>
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
