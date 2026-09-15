import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import {
  CaretDownIcon,
  CaretUpDownIcon,
  CheckIcon,
  GitBranchIcon,
} from "@phosphor-icons/react";
import { BranchPicker, type BranchGroup } from "./ui";
import {
  comparisonScope,
  reviewBranch,
  scopes,
  scopeTarget,
} from "./comparison";
import type { Entry, useWorkspace } from "./workspace";

function branchGroups(entry: Entry): BranchGroup[] {
  const { local, remote, tags } = entry.repo.branches;
  return [
    {
      value: "Current checkout",
      items: [
        {
          value: "HEAD",
          label: `${reviewBranch("HEAD", entry.repo.branch)} (current)`,
        },
      ],
    },
    { value: "Local", items: local.map((value) => ({ value, label: value })) },
    {
      value: "Remote",
      items: remote.map((value) => ({ value, label: value })),
    },
    {
      value: "Tags",
      items: (tags || []).map((value) => ({ value, label: value })),
    },
  ];
}

export function ComparisonPicker({
  entry,
  workspace,
}: {
  entry: Entry;
  workspace: ReturnType<typeof useWorkspace>;
}) {
  const scope = comparisonScope(entry.target);
  const local = scope.value !== "committed";
  return (
    <Popover.Root>
      <Popover.Trigger
        className="compare-chip"
        aria-label={`Comparison for ${entry.repo.name}`}
      >
        <GitBranchIcon />
        <span className="comparison-summary">
          <span>
            {scope.base
              ? `${reviewBranch(entry.target, entry.repo.branch)} vs ${reviewBranch(entry.base, entry.repo.branch)}`
              : scope.label}
          </span>
          <small>
            {scope.value === "combined"
              ? "Includes uncommitted edits"
              : scope.value === "committed"
                ? "Committed only"
                : reviewBranch(entry.target, entry.repo.branch)}
          </small>
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
            <Popover.Title>Review changes</Popover.Title>
            <Popover.Description className="muted">
              {entry.repo.name}
              {entry.repo.worktree ? " · linked worktree" : ""}
            </Popover.Description>
            <Select.Root
              value={scope.value}
              items={scopes}
              onValueChange={(value) => {
                if (value)
                  workspace.configure(entry, {
                    target: scopeTarget(value, entry.target),
                  });
              }}
            >
              <Select.Label className="control-label">Changes</Select.Label>
              <Select.Trigger className="branch-trigger" aria-label="Changes">
                <Select.Value />
                <CaretUpDownIcon />
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  alignItemWithTrigger={false}
                  className="floating"
                >
                  <Select.Popup className="popup scope-popup">
                    <Select.List className="option-list">
                      {scopes.map((option) => (
                        <Select.Item
                          key={option.value}
                          value={option.value}
                          className="option scope-option"
                        >
                          <span className="option-label">
                            <Select.ItemText>{option.label}</Select.ItemText>
                            <small>{option.description}</small>
                          </span>
                          <Select.ItemIndicator className="option-check">
                            <CheckIcon weight="bold" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            {local ? (
              <div className="current-branch">
                <span className="control-label">Review branch</span>
                <span>
                  <GitBranchIcon />
                  {reviewBranch("HEAD", entry.repo.branch)}{" "}
                  <small>(current)</small>
                </span>
              </div>
            ) : (
              <BranchPicker
                label="Review branch"
                value={entry.target}
                groups={branchGroups(entry)}
                onChange={(target) => workspace.configure(entry, { target })}
              />
            )}
            {scope.base && (
              <BranchPicker
                label="Base branch"
                value={entry.base}
                groups={branchGroups(entry)}
                onChange={(base) => workspace.configure(entry, { base })}
              />
            )}
            <p className="popup-note">
              {scope.description}
              {scope.value === "combined" &&
                " Committed changes start where the current branch diverged from the base."}
              {scope.value === "committed" &&
                " Local edits belong to the currently checked-out branch and are not included."}
              {(scope.value === "combined" || scope.value === "uncommitted") &&
                " Staged and unstaged edits appear as their combined current content."}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
