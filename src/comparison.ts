// Scopes with a target read the current checkout; committed review reads a
// branch, a tag, or a commit you name, so its target is that revision.
export const scopes = [
  {
    value: "combined",
    target: "@working",
    base: true,
    label: "Committed + uncommitted",
    description:
      "Branch changes, staged and unstaged edits, and untracked files.",
  },
  {
    value: "committed",
    target: "",
    base: true,
    label: "Committed only",
    description: "Committed branch changes since it diverged from the base.",
  },
  {
    value: "uncommitted",
    target: "@uncommitted",
    base: false,
    label: "Uncommitted only",
    description:
      "Staged and unstaged edits, and untracked files, since the latest commit.",
  },
  {
    value: "staged",
    target: "@staged",
    base: false,
    label: "Staged only",
    description: "What is in the index, compared with the latest commit.",
  },
  {
    value: "unstaged",
    target: "@unstaged",
    base: false,
    label: "Unstaged only",
    description:
      "Edits and untracked files that are not staged, compared with the index.",
  },
] as const;
export type Scope = (typeof scopes)[number];

export function comparisonScope(target: string): Scope {
  return (
    scopes.find((scope) => scope.target && scope.target === target) || scopes[1]
  );
}
export function scopeTarget(scope: string, target: string) {
  const chosen = scopes.find((option) => option.value === scope) || scopes[0];
  if (chosen.target) return chosen.target;
  return comparisonScope(target).value === "committed" ? target : "HEAD";
}
export function reviewBranch(target: string, branch: string) {
  return target === "HEAD" || target.startsWith("@")
    ? branch === "Detached HEAD"
      ? "Detached checkout"
      : branch
    : target;
}
export function comparisonSummary(target: string, branch: string) {
  return `${reviewBranch(target, branch)} · ${comparisonScope(target).label}`;
}
