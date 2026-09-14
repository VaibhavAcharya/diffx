import { useState, type ReactNode } from "react";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Fieldset } from "@base-ui/react/fieldset";
import { Input } from "@base-ui/react/input";
import { NumberField } from "@base-ui/react/number-field";
import { Switch } from "@base-ui/react/switch";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  GearSixIcon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Settings } from "./store";
import { version } from "../package.json";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <span className="setting-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      className="segmented"
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        if (next[0]) onChange(next[0] as T);
      }}
    >
      {options.map((option) => (
        <Toggle key={option.value} value={option.value}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
function Count({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField.Root
      className="counter"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onValueCommitted={(next) => next !== null && onChange(next)}
    >
      <NumberField.Group className="counter-group">
        <NumberField.Decrement aria-label={`Fewer ${label}`}>
          <MinusIcon />
        </NumberField.Decrement>
        <NumberField.Input />
        <NumberField.Increment aria-label={`More ${label}`}>
          <PlusIcon />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
export function SettingsDialog({
  settings,
  onChange,
  onReset,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
}) {
  const [folder, setFolder] = useState("");
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={<Button />}
        className="icon-button"
        aria-label="Settings"
      >
        <GearSixIcon />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="settings-dialog">
          <header className="settings-header">
            <SlidersHorizontalIcon />
            <Dialog.Title>Settings</Dialog.Title>
          </header>
          <Dialog.Description className="muted">
            These apply to every tab. What each tab compares stays with the tab.
          </Dialog.Description>
          <Fieldset.Root className="settings-group">
            <Fieldset.Legend className="settings-legend">
              Appearance
            </Fieldset.Legend>
            <Row label="Theme">
              <Choice
                label="Theme"
                value={settings.theme}
                onChange={(theme) => onChange({ theme })}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Row>
            <Row label="Diff layout">
              <Choice
                label="Diff layout"
                value={settings.layout}
                onChange={(layout) => onChange({ layout })}
                options={[
                  { value: "unified", label: "Unified" },
                  { value: "split", label: "Split" },
                ]}
              />
            </Row>
            <Row label="Wrap long lines">
              <Switch.Root
                className="switch"
                checked={settings.wrap}
                onCheckedChange={(wrap) => onChange({ wrap })}
              >
                <Switch.Thumb className="switch-thumb" />
              </Switch.Root>
            </Row>
            <Row
              label="Sidebar density"
              hint="Row height in the changed file trees"
            >
              <Choice
                label="Sidebar density"
                value={settings.density}
                onChange={(density) => onChange({ density })}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "default", label: "Default" },
                  { value: "relaxed", label: "Relaxed" },
                ]}
              />
            </Row>
          </Fieldset.Root>
          <Fieldset.Root className="settings-group">
            <Fieldset.Legend className="settings-legend">Diffs</Fieldset.Legend>
            <Row label="Highlight changes within a line">
              <Choice
                label="Highlight changes within a line"
                value={settings.wordDiff}
                onChange={(wordDiff) => onChange({ wordDiff })}
                options={[
                  { value: "word-alt", label: "Words" },
                  { value: "char", label: "Characters" },
                  { value: "none", label: "Off" },
                ]}
              />
            </Row>
            <Row
              label="Context lines per expansion"
              hint="How much surrounding code each expand reveals"
            >
              <Count
                label="context lines"
                value={settings.expansionLines}
                min={5}
                max={200}
                step={5}
                onChange={(expansionLines) => onChange({ expansionLines })}
              />
            </Row>
          </Fieldset.Root>
          <Fieldset.Root className="settings-group">
            <Fieldset.Legend className="settings-legend">
              Discovery
            </Fieldset.Legend>
            <Row
              label="Search depth"
              hint="Directory levels below a workspace folder"
            >
              <Count
                label="levels"
                value={settings.scanDepth}
                min={1}
                max={16}
                step={1}
                onChange={(scanDepth) => onChange({ scanDepth })}
              />
            </Row>
            <Row
              label="Directory budget"
              hint="Stop searching after this many directories"
            >
              <Count
                label="directories"
                value={settings.scanBudget}
                min={100}
                max={200000}
                step={1000}
                onChange={(scanBudget) => onChange({ scanBudget })}
              />
            </Row>
            <div className="skip-folders">
              <label htmlFor="skip-folder">Skip these folders</label>
              <p className="popup-note">
                Remove a name to include that folder in discovery.
              </p>
              <div className="folder-chips" aria-label="Skipped folders">
                {settings.ignore.map((name) => (
                  <Button
                    key={name}
                    className="folder-chip"
                    aria-label={`Include ${name} in discovery`}
                    onClick={() =>
                      onChange({
                        ignore: settings.ignore.filter(
                          (value) => value !== name,
                        ),
                      })
                    }
                  >
                    {name}
                    <XIcon />
                  </Button>
                ))}
                {!settings.ignore.length && (
                  <span className="muted">No folder names are skipped.</span>
                )}
              </div>
              <form
                className="folder-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = folder.trim();
                  if (name && !settings.ignore.includes(name))
                    onChange({ ignore: [...settings.ignore, name] });
                  setFolder("");
                }}
              >
                <Input
                  id="skip-folder"
                  className="input"
                  placeholder="Folder name, e.g. target"
                  value={folder}
                  onValueChange={setFolder}
                  maxLength={63}
                  pattern={String.raw`[^/\\]+`}
                  title="Enter a folder name without path separators."
                />
                <Button
                  type="submit"
                  className="text-button"
                  disabled={!folder.trim() || settings.ignore.length >= 200}
                >
                  Add
                </Button>
              </form>
            </div>
          </Fieldset.Root>
          <p className="popup-note">
            Discovery never walks inside a repository, so .gitignore never
            applies. Changes here take effect on the next rescan.
          </p>
          <div className="settings-actions">
            <Button
              className="text-button"
              onClick={() => {
                setFolder("");
                onReset();
              }}
              title="Restore all app preferences. Tabs and comparisons are kept."
            >
              Reset preferences
            </Button>
            <div className="push" />
            <span className="muted">polydiff v{version}</span>
            <Dialog.Close className="primary-button">Done</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
