import { useState } from "react";
import { Checkbox } from "@base-ui/react/checkbox";
import { Input } from "@base-ui/react/input";
import { Popover } from "@base-ui/react/popover";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  FoldersIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { BranchPicker, type BranchGroup } from "./ui";
import { comparisonLabel, type Entry, type useWorkspace } from "./workspace";
import type { Selection } from "./store";

type WorkspaceState = ReturnType<typeof useWorkspace>;
const presets: { value: Selection; label: string; hint: string }[] = [
  {
    value: "changed",
    label: "Changed",
    hint: "Follow repositories that have changes",
  },
  { value: "all", label: "All", hint: "Include every repository" },
  { value: "none", label: "None", hint: "Clear the selection" },
];

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
          side="right"
          align="start"
          sideOffset={10}
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
function SelectorRow({
  entry,
  workspace,
}: {
  entry: Entry;
  workspace: WorkspaceState;
}) {
  const repo = entry.repo;
  const included = workspace.included(entry);
  return (
    <div className={`selector-row ${included ? "is-selected" : ""}`}>
      <Checkbox.Root
        className="checkbox"
        aria-label={`Include ${repo.name}`}
        checked={included}
        onCheckedChange={(checked) => workspace.select(repo.path, checked)}
      >
        <Checkbox.Indicator>
          <CheckIcon weight="bold" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className="selector-name" title={repo.path}>
        {repo.name}
        {repo.worktree && <span className="worktree-label">worktree</span>}
      </span>
      <span
        className={`selector-count ${entry.error ? "has-error" : ""}`}
        title={entry.error || `${entry.data?.files.length || 0} changed files`}
      >
        {entry.loading ? (
          <span className="busy-dot" />
        ) : entry.error ? (
          <WarningCircleIcon />
        ) : (
          entry.data?.files.length || "—"
        )}
      </span>
      <Comparison entry={entry} workspace={workspace} />
    </div>
  );
}
export function RepoSelector({ workspace }: { workspace: WorkspaceState }) {
  const [query, setQuery] = useState("");
  const visible = workspace.entries.filter((entry) =>
    entry.repo.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Popover.Root>
      <Popover.Trigger className="selector-trigger" aria-label="Repositories">
        <FoldersIcon />
        <strong>Repositories</strong>
        <small>
          {workspace.scanning
            ? "Scanning…"
            : `${workspace.selected.length} of ${workspace.entries.length}`}
        </small>
        <CaretDownIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="floating">
          <Popover.Popup className="popup selector-popup">
            <div className="search-field">
              <MagnifyingGlassIcon />
              <Input
                aria-label="Filter repositories"
                placeholder="Find a repository…"
                value={query}
                onValueChange={setQuery}
              />
            </div>
            <div className="selector-actions">
              <ToggleGroup
                className="segmented"
                aria-label="Which repositories to review"
                value={
                  workspace.selection === "custom" ? [] : [workspace.selection]
                }
                onValueChange={(value) => {
                  if (value[0]) workspace.setSelection(value[0] as Selection);
                }}
              >
                {presets.map((preset) => (
                  <Toggle
                    key={preset.value}
                    value={preset.value}
                    title={preset.hint}
                  >
                    {preset.label}
                  </Toggle>
                ))}
              </ToggleGroup>
              <span className="selector-summary">
                {workspace.selection === "custom" ? "Custom · " : ""}
                {workspace.selected.length} of {workspace.entries.length}
              </span>
            </div>
            <div className="selector-list">
              {visible.map((entry) => (
                <SelectorRow
                  key={entry.repo.path}
                  entry={entry}
                  workspace={workspace}
                />
              ))}
              {!visible.length && (
                <p className="popup-empty">
                  {workspace.scanning
                    ? "Discovering repositories…"
                    : "No matching repositories."}
                </p>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
