import { useCallback, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiffMetadata, FileDiffLoadedFiles } from "@pierre/diffs";
import {
  CaretRightIcon,
  CheckCircleIcon,
  CopyIcon,
  DotsThreeIcon,
  FileCodeIcon,
  PencilSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { api } from "./api";
import { stats, fileId, type Entry } from "./workspace";
import { editors, editorUrl, joinPath } from "./editor";
import type { Settings } from "./store";

function FileActions({
  repo,
  name,
  line,
  editor,
}: {
  repo: string;
  name: string;
  line: number;
  editor: Settings["editor"];
}) {
  const [copied, setCopied] = useState("");
  const absolute = joinPath(repo, name);
  const copy = (label: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(""), 1500);
      },
      () => setCopied(""),
    );
  };
  const open = editors.find((option) => option.value === editor);
  return (
    <Menu.Root>
      <Menu.Trigger
        className="icon-button file-actions"
        aria-label={`Actions for ${name}`}
      >
        <DotsThreeIcon weight="bold" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" className="floating">
          <Menu.Popup className="popup menu">
            <Menu.Item
              className="menu-item"
              onClick={() => copy("path", name)}
              closeOnClick={false}
            >
              <CopyIcon />
              {copied === "path" ? "Copied" : "Copy repository path"}
            </Menu.Item>
            <Menu.Item
              className="menu-item"
              onClick={() => copy("absolute", absolute)}
              closeOnClick={false}
            >
              <CopyIcon />
              {copied === "absolute" ? "Copied" : "Copy full path"}
            </Menu.Item>
            {open && (
              <Menu.Item
                className="menu-item"
                onClick={() => {
                  window.location.href = editorUrl(open.value, absolute, line);
                }}
              >
                <PencilSimpleIcon />
                Open in {open.label}
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function DiffFile({
  entry,
  file,
  settings,
  binary,
  cursor,
  highlight,
  reviewed,
  changedSinceReview,
  onReview,
  collapsed,
  onCollapse,
}: {
  entry: Entry;
  file: FileDiffMetadata;
  settings: Settings;
  binary: boolean;
  cursor: boolean;
  highlight?: { line: number; side: "additions" | "deletions" };
  reviewed: boolean;
  changedSinceReview: boolean;
  onReview: (value: boolean) => void;
  collapsed: boolean;
  onCollapse: (value: boolean) => void;
}) {
  const [contextError, setContextError] = useState("");
  const [loadingContext, setLoadingContext] = useState(false);
  const anchor = useRef<Element | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const total = stats([file]);
  const modeChanged =
    !!file.mode && !!file.prevMode && file.mode !== file.prevMode;
  const loadDiffFiles = useCallback(
    async (metadata: FileDiffMetadata): Promise<FileDiffLoadedFiles> => {
      setContextError("");
      setLoadingContext(true);
      try {
        return await api<FileDiffLoadedFiles>("file", {
          repo: entry.repo.path,
          name: metadata.name,
          oldName: metadata.prevName || metadata.name,
          oldRef: entry.data!.mergeBase,
          newRef: entry.data!.targetRef,
          expectedHash: metadata.newObjectId || "",
        });
      } catch (error) {
        setContextError(
          error instanceof Error ? error.message : "Could not expand context.",
        );
        throw error;
      } finally {
        setLoadingContext(false);
      }
    },
    [entry.repo.path, entry.data],
  );
  return (
    <div
      className="diff-file"
      id={fileId(entry.repo.path, file.name)}
      data-reviewed={reviewed || undefined}
      data-cursor={cursor || undefined}
    >
      <div className="file-heading">
        <button
          className="file-toggle"
          aria-expanded={!collapsed}
          onClick={() => onCollapse(!collapsed)}
        >
          <CaretRightIcon className="disclosure" />
          <FileCodeIcon />
          <span className="file-path">
            {file.prevName && <span className="muted">{file.prevName} → </span>}
            {file.name}
          </span>
        </button>
        {changedSinceReview && (
          <span className="file-badge">Changed since you reviewed it</span>
        )}
        {modeChanged && (
          <span className="file-badge" title="File mode">
            {file.prevMode} → {file.mode}
          </span>
        )}
        {binary && <span className="file-badge">Binary</span>}
        <span className="file-status">
          {file.type === "new"
            ? "Added"
            : file.type === "deleted"
              ? "Deleted"
              : file.type.startsWith("rename")
                ? "Renamed"
                : ""}
        </span>
        <span className="diff-stat">
          <span className="added">{total.added ? `+${total.added}` : ""}</span>
          <span className="removed">
            {total.removed ? `−${total.removed}` : ""}
          </span>
        </span>
        <FileActions
          repo={entry.repo.path}
          name={file.name}
          line={file.hunks[0]?.additionStart || 1}
          editor={settings.editor}
        />
        <button
          className="review-toggle"
          aria-pressed={reviewed}
          aria-label={
            reviewed
              ? `Mark ${file.name} unreviewed`
              : `Mark ${file.name} reviewed`
          }
          onClick={() => onReview(!reviewed)}
        >
          <CheckCircleIcon weight={reviewed ? "fill" : "duotone"} />
          <span>Reviewed</span>
        </button>
      </div>
      <div
        className="file-panel"
        data-collapsed={collapsed || undefined}
        ref={panel}
        onMouseDownCapture={(event) => {
          const target = event.nativeEvent.composedPath()[0];
          anchor.current = target instanceof Element ? target : panel.current;
        }}
      >
        {file.hunks.length ? (
          <FileDiff
            fileDiff={file}
            selectedLines={
              highlight && {
                start: highlight.line,
                end: highlight.line,
                side: highlight.side,
              }
            }
            options={{
              theme: { light: "pierre-light", dark: "pierre-dark" },
              themeType: settings.theme,
              diffStyle: settings.layout,
              overflow: settings.wrap ? "wrap" : "scroll",
              lineDiffType: settings.wordDiff,
              expansionLineCount: settings.expansionLines,
              disableFileHeader: true,
              hunkSeparators: "line-info",
              collapsed,
              loadDiffFiles,
            }}
          />
        ) : (
          !collapsed && (
            <p className="file-note">
              {file.type === "rename-pure"
                ? "File renamed without content changes."
                : binary
                  ? `Binary file ${file.type === "new" ? "added" : file.type === "deleted" ? "deleted" : "changed"}. Its contents are not shown.`
                  : modeChanged
                    ? `File mode changed from ${file.prevMode} to ${file.mode}, with no change to its contents.`
                    : "No text hunks. An empty file, or a change Git records without content."}
            </p>
          )
        )}
      </div>
      <Popover.Root
        open={!!contextError || loadingContext}
        onOpenChange={(open) => !open && setContextError("")}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={() => anchor.current || panel.current}
            side="top"
            align="center"
            sideOffset={6}
            className="floating"
          >
            <Popover.Popup
              className="popup context-status"
              role={contextError ? "alert" : "status"}
            >
              {contextError ? (
                <>
                  <WarningCircleIcon />
                  <span>{contextError}</span>
                  <Popover.Close className="text-button">Dismiss</Popover.Close>
                </>
              ) : (
                <>
                  <span className="busy-dot" />
                  <span>Loading the full file…</span>
                </>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
