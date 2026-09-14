import { useCallback, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiffMetadata, FileDiffLoadedFiles } from "@pierre/diffs";
import {
  CaretRightIcon,
  FileCodeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { api } from "./api";
import { stats, fileId, type Entry } from "./workspace";
import type { Settings } from "./store";

export function DiffFile({
  entry,
  file,
  settings,
  collapsed,
  onCollapse,
}: {
  entry: Entry;
  file: FileDiffMetadata;
  settings: Settings;
  collapsed: boolean;
  onCollapse: (value: boolean) => void;
}) {
  const [contextError, setContextError] = useState("");
  const [loadingContext, setLoadingContext] = useState(false);
  const anchor = useRef<Element | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const total = stats([file]);
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
    <div className="diff-file" id={fileId(entry.repo.path, file.name)}>
      <button
        className="file-heading"
        aria-expanded={!collapsed}
        onClick={() => onCollapse(!collapsed)}
      >
        <CaretRightIcon className="disclosure" />
        <FileCodeIcon />
        <span className="file-path">
          {file.prevName && <span className="muted">{file.prevName} → </span>}
          {file.name}
        </span>
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
      </button>
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
                : "No text hunks. Binary content, an empty file, or a file mode change."}
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
