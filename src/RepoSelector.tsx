import { Popover } from "@base-ui/react/popover";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { CaretDownIcon, FoldersIcon } from "@phosphor-icons/react";
import type { Entry, useWorkspace } from "./workspace";
import type { Selection } from "./store";

type WorkspaceState = ReturnType<typeof useWorkspace>;
const presets: { value: Selection; label: string; hint: string }[] = [
  {
    value: "changed",
    label: "Changed",
    hint: "Follow repositories that have changes",
  },
  { value: "all", label: "All", hint: "Include every repository" },
  { value: "none", label: "None", hint: "Leave every repository out" },
];
const ruleLabel: Record<Selection, string> = {
  changed: "Changed",
  all: "All",
  none: "None",
};
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
  const exceptions = workspace.entries.filter(
    (entry) => entry.selected !== undefined,
  );
  const summary = summarise(exceptions);
  return (
    <Popover.Root>
      <Popover.Trigger className="selector-trigger" aria-label="Repositories">
        <FoldersIcon />
        <strong>{ruleLabel[workspace.selection]}</strong>
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
            <Popover.Title>Which repositories to review</Popover.Title>
            <ToggleGroup
              className="segmented"
              aria-label="Which repositories to review"
              value={[workspace.selection]}
              onValueChange={(value) =>
                workspace.setSelection(
                  (value[0] as Selection) ?? workspace.selection,
                )
              }
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
            <p className="popup-note">
              {summary
                ? `Currently ${ruleLabel[workspace.selection].toLowerCase()}, ${summary}. Choosing a rule again clears those.`
                : "Tick a repository in the sidebar to keep it in or leave it out, whatever this rule says."}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
