import type { FileDiffMetadata } from "@pierre/diffs";
import type { Entry } from "./workspace";

export type ChangeKind = "added" | "modified" | "deleted" | "renamed";
export const changeKinds: { value: ChangeKind; label: string }[] = [
  { value: "added", label: "Added" },
  { value: "modified", label: "Modified" },
  { value: "deleted", label: "Deleted" },
  { value: "renamed", label: "Renamed" },
];
export type Filter = {
  query: string;
  kinds: ChangeKind[];
  hideReviewed: boolean;
  hideNoise: boolean;
};
export const noFilter: Filter = {
  query: "",
  kinds: [],
  hideReviewed: false,
  hideNoise: false,
};

export function changeKind(file: FileDiffMetadata): ChangeKind {
  if (file.type === "new") return "added";
  if (file.type === "deleted") return "deleted";
  if (file.type.startsWith("rename")) return "renamed";
  return "modified";
}
// Files a tool writes rather than a person: reading them is rarely the point
// of a review, and they are long enough to bury everything else.
const generatedNames = new Set([
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
  "package-lock.json",
  "Package.resolved",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);
const generatedPatterns = [
  /(^|\/)__snapshots__\//,
  /(^|\/)generated\//,
  /\.ambr$/,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /\.(js|css)\.map$/,
  /\.pb\.(go|ts|js)$/,
  /_pb2\.pyi?$/,
  /\.g\.dart$/,
  /\.generated\.[^/]+$/,
];
export function isGenerated(name: string) {
  const base = name.slice(name.lastIndexOf("/") + 1);
  return (
    generatedNames.has(base) ||
    generatedPatterns.some((pattern) => pattern.test(name))
  );
}
export function filtering(filter: Filter) {
  return (
    !!filter.query.trim() ||
    filter.kinds.length > 0 ||
    filter.hideReviewed ||
    filter.hideNoise
  );
}
// The search text matches a repository as a whole, so a repository whose name
// matches keeps every one of its files; the other rules still apply.
export function visibleFiles(
  files: FileDiffMetadata[],
  filter: Filter,
  {
    reviewed,
    skipQuery,
  }: { reviewed?: (name: string) => boolean; skipQuery?: boolean } = {},
) {
  const needle = skipQuery ? "" : filter.query.trim().toLowerCase();
  if (!filtering(filter) && !needle) return files;
  return files.filter((file) => {
    if (needle && !file.name.toLowerCase().includes(needle)) return false;
    if (filter.kinds.length && !filter.kinds.includes(changeKind(file)))
      return false;
    if (filter.hideNoise && isGenerated(file.name)) return false;
    if (filter.hideReviewed && reviewed?.(file.name)) return false;
    return true;
  });
}

// What one repository contributes to the review under the current filter.
// `listed` is about the search text alone: a repository stays in the sidebar
// while you filter its files down to none, so you can still see its progress.
export function repoView(
  files: FileDiffMetadata[],
  repoName: string,
  filter: Filter,
  reviewed: (name: string) => boolean,
) {
  const needle = filter.query.trim().toLowerCase();
  const named = !!needle && repoName.toLowerCase().includes(needle);
  const visible = visibleFiles(files, filter, { reviewed, skipQuery: named });
  return {
    files: visible,
    named,
    listed:
      !needle ||
      named ||
      files.some((file) => file.name.toLowerCase().includes(needle)),
    hidden: files.length - visible.length,
  };
}

// One repository as the sidebar and the review pane both read it: its entry,
// the files a filter leaves, and which of them have been reviewed.
export type View = ReturnType<typeof repoView> & {
  entry: Entry;
  reviewed: Set<string>;
  key: string;
};
