import type { ReactElement, ReactNode } from "react";
import { Button } from "@base-ui/react/button";
import { Tooltip } from "@base-ui/react/tooltip";
import { Combobox } from "@base-ui/react/combobox";
import {
  CaretUpDownIcon,
  CheckIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";

export function IconButton({
  label,
  children,
  onClick,
  disabled,
  pressed,
  className = "",
}: {
  label: string;
  children: ReactElement;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<Button />}
        className={`icon-button ${className}`}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup className="tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
type BranchOption = { label: string; value: string };
export type BranchGroup = { value: string; items: BranchOption[] };
export function BranchPicker({
  label,
  value,
  groups,
  onChange,
}: {
  label: string;
  value: string;
  groups: BranchGroup[];
  onChange: (value: string) => void;
}) {
  const selected = groups
    .flatMap((group) => group.items)
    .find((item) => item.value === value);
  return (
    <Combobox.Root
      items={groups.filter((group) => group.items.length)}
      value={selected || { value, label: value }}
      onValueChange={(item) => {
        if (item) onChange(item.value);
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      limit={60}
    >
      <Combobox.Label className="control-label">{label}</Combobox.Label>
      <Combobox.Trigger className="branch-trigger" aria-label={label}>
        <GitBranchIcon />
        <span>
          <Combobox.Value />
        </span>
        <CaretUpDownIcon />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" className="floating">
          <Combobox.Popup className="popup branch-popup">
            <div className="search-field">
              <MagnifyingGlassIcon />
              <Combobox.Input
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder="Find a branch…"
              />
            </div>
            <Combobox.Empty className="popup-empty">
              No matching branches.
            </Combobox.Empty>
            <Combobox.List className="option-list">
              {(group: BranchGroup) => (
                <Combobox.Group
                  key={group.value}
                  items={group.items}
                  className="option-group"
                >
                  <Combobox.GroupLabel className="option-group-label">
                    {group.value}
                  </Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(item: BranchOption) => (
                      <Combobox.Item
                        className="option"
                        key={item.value}
                        value={item}
                      >
                        <GitBranchIcon />
                        <span className="option-label">{item.label}</span>
                        <Combobox.ItemIndicator>
                          <CheckIcon />
                        </Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
export function Loading({
  lines = 2,
  children,
}: {
  lines?: number;
  children: ReactNode;
}) {
  return (
    <div className="review-loading" role="status">
      <span>{children}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} />
      ))}
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
