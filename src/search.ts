import type { FileDiffMetadata } from "@pierre/diffs";

export type DiffMatch = {
  repo: string;
  file: string;
  line: number;
  side: "additions" | "deletions";
  changed: boolean;
  text: string;
  // Where the renderer puts this line when it lays the file out in one column,
  // which is how a match is found again in the rendered diff.
  row: number;
};
// Walks a patch the way the renderer lays it out: context lines appear on both
// sides, and a change block puts its deletions above its additions.
function* patchLines(file: FileDiffMetadata) {
  for (const hunk of file.hunks) {
    let row = hunk.unifiedLineStart;
    let deletionLine = hunk.deletionStart;
    let additionLine = hunk.additionStart;
    for (const block of hunk.hunkContent) {
      if (block.type === "context") {
        for (let index = 0; index < block.lines; index++)
          yield {
            text: file.additionLines[block.additionLineIndex + index] ?? "",
            side: "additions" as const,
            changed: false,
            line: additionLine + index,
            row: row + index,
          };
        row += block.lines;
        deletionLine += block.lines;
        additionLine += block.lines;
        continue;
      }
      for (let index = 0; index < block.deletions; index++)
        yield {
          text: file.deletionLines[block.deletionLineIndex + index] ?? "",
          side: "deletions" as const,
          changed: true,
          line: deletionLine + index,
          row: row + index,
        };
      for (let index = 0; index < block.additions; index++)
        yield {
          text: file.additionLines[block.additionLineIndex + index] ?? "",
          side: "additions" as const,
          changed: true,
          line: additionLine + index,
          row: row + block.deletions + index,
        };
      row += block.deletions + block.additions;
      deletionLine += block.deletions;
      additionLine += block.additions;
    }
  }
}
export function searchDiffs(
  sources: { repo: string; files: FileDiffMetadata[] }[],
  query: string,
  changedOnly: boolean,
) {
  const needle = query.trim().toLowerCase();
  const matches: DiffMatch[] = [];
  if (!needle) return matches;
  for (const source of sources)
    for (const file of source.files)
      for (const line of patchLines(file)) {
        if (changedOnly && !line.changed) continue;
        if (!line.text.toLowerCase().includes(needle)) continue;
        matches.push({ repo: source.repo, file: file.name, ...line });
      }
  return matches;
}
