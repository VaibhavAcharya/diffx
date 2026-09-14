import { prepareFileTreeInput } from "@pierre/trees";

export const flattenEmptyDirectories = true;
// The file tree accepts paths only in its own canonical order, which collates
// numbers, punctuation and accents differently from a plain locale compare, and
// rejects anything else. Ask it for that order and give the same one to the
// review pane, so the sidebar and the diffs stay in step.
export function sortToTreeOrder<File extends { name: string }>(files: File[]) {
  const prepared = prepareFileTreeInput(
    files.map((file) => file.name),
    { flattenEmptyDirectories },
  );
  const order = new Map<string, number>();
  prepared.paths.forEach((name, index) => {
    if (!order.has(name)) order.set(name, index);
  });
  return [...files].sort(
    (left, right) => order.get(left.name)! - order.get(right.name)!,
  );
}
