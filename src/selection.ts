import type { Selection } from "./store";

export type Selectable = {
  selected?: boolean;
  data?: { files: unknown[] };
};

export function rule(entry: Selectable, selection: Selection) {
  if (selection === "all") return true;
  if (selection === "none") return false;
  return !!entry.data?.files.length;
}
export function included(entry: Selectable, selection: Selection) {
  return entry.selected ?? rule(entry, selection);
}
// Ticking a repository back to what the rule already says drops the exception.
// A repository still loading has no changes to count yet, so its tick is stored
// as given rather than measured against a rule that cannot answer.
export function exceptionFor(
  entry: Selectable,
  selection: Selection,
  value: boolean,
) {
  if (entry.data && value === rule(entry, selection)) return undefined;
  return value;
}
