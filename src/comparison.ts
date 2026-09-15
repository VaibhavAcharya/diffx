export const scopes = [
  {
    value: "combined",
    label: "Committed + uncommitted",
    description:
      "Branch changes, staged and unstaged edits, and untracked files.",
  },
  {
    value: "committed",
    label: "Committed only",
    description: "Committed branch changes since it diverged from the base.",
  },
  {
    value: "uncommitted",
    label: "Uncommitted only",
    description:
      "Staged and unstaged edits, and untracked files, since the latest commit.",
  },
] as const;

export function comparisonScope(target: string) {
  return scopes[target === "@working" ? 0 : target === "@uncommitted" ? 2 : 1];
}

export function scopeTarget(scope: string, target: string) {
  if (scope === "combined") return "@working";
  if (scope === "uncommitted") return "@uncommitted";
  return comparisonScope(target).value === "committed" ? target : "HEAD";
}

export function reviewBranch(target: string, branch: string) {
  return target === "HEAD" || target === "@working" || target === "@uncommitted"
    ? branch === "Detached HEAD"
      ? "Detached checkout"
      : branch
    : target;
}

export function comparisonSummary(target: string, branch: string) {
  return `${reviewBranch(target, branch)} · ${comparisonScope(target).label}`;
}
