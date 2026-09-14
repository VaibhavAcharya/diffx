import { Button } from "@base-ui/react/button";
import { Select } from "@base-ui/react/select";
import { CaretUpDownIcon, CheckIcon, FoldersIcon } from "@phosphor-icons/react";
import type { Entry, useWorkspace } from "./workspace";
import type { Selection } from "./store";

type WorkspaceState = ReturnType<typeof useWorkspace>;
const rules: { value: Selection; label: string; hint: string }[] = [
  {
    value: "changed",
    label: "Changed",
    hint: "Follow the repositories that have changes",
  },
  { value: "all", label: "All", hint: "Every repository in the folder" },
  { value: "none", label: "None", hint: "Start from an empty review" },
];
function names(entries: Entry[]) {
  if (entries.length > 2) return `${entries.length} repositories`;
  return entries.map((entry) => entry.repo.name).join(" and ");
}
function summarise(entries: Entry[]) {
  const added = entries.filter((entry) => entry.selected);
  const removed = entries.filter((entry) => entry.selected === false);
  return [
    added.length ? `plus ${names(added)}` : "",
    removed.length ? `minus ${names(removed)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
export function RepoSelector({ workspace }: { workspace: WorkspaceState }) {
  const summary = summarise(
    workspace.entries.filter((entry) => entry.selected !== undefined),
  );
  return (
    <Select.Root
      value={workspace.selection}
      onValueChange={(value) => workspace.setSelection(value as Selection)}
    >
      <Select.Trigger
        className="selector-trigger"
        aria-label="Which repositories to review"
      >
        <FoldersIcon />
        <strong>
          <Select.Value>
            {(value: Selection) =>
              rules.find((rule) => rule.value === value)?.label
            }
          </Select.Value>
        </strong>
        <small>
          {workspace.scanning
            ? "Scanning…"
            : `${workspace.selected.length} of ${workspace.entries.length}`}
        </small>
        <Select.Icon>
          <CaretUpDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={8} align="start" className="floating">
          <Select.Popup className="popup selector-popup">
            <Select.List className="option-list">
              {rules.map((rule) => (
                <Select.Item
                  key={rule.value}
                  value={rule.value}
                  className="option"
                >
                  <span>
                    <Select.ItemText>{rule.label}</Select.ItemText>
                    <small>{rule.hint}</small>
                  </span>
                  <Select.ItemIndicator>
                    <CheckIcon />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
            {summary && (
              <div className="selector-exceptions">
                <span>Currently {summary}.</span>
                <Button
                  className="text-button"
                  onClick={workspace.clearExceptions}
                >
                  Clear
                </Button>
              </div>
            )}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
