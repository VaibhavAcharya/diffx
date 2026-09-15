import { expect, test } from "vitest";
import { parsePatchFiles } from "@pierre/diffs";
import { searchDiffs } from "./search";

const patch = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1111111..2222222 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,5 +1,6 @@",
  ' import { load } from "./load";',
  "-const limit = 10;",
  "+const limit = 20;",
  "+const retries = 3;",
  " export function start() {",
  "   return load(limit);",
  " }",
  "",
].join("\n");
const files = parsePatchFiles(patch, undefined, true).flatMap(
  (parsed) => parsed.files,
);
const sources = [{ repo: "/tmp/api", files }];

test("finds matches on both sides of a change with their line numbers", () => {
  const matches = searchDiffs(sources, "limit", false);
  expect(
    matches.map((match) => `${match.side}:${match.line}:${match.text.trim()}`),
  ).toEqual([
    "deletions:2:const limit = 10;",
    "additions:2:const limit = 20;",
    "additions:5:return load(limit);",
  ]);
  expect(matches[0].repo).toBe("/tmp/api");
  expect(matches[0].file).toBe("src/app.ts");
});

test("changed lines only leaves context out", () => {
  expect(
    searchDiffs(sources, "limit", true).map((match) => match.line),
  ).toEqual([2, 2]);
  expect(searchDiffs(sources, "load", true)).toEqual([]);
  expect(searchDiffs(sources, "load", false).length).toBe(2);
});

test("rows follow the order the renderer lays lines out in", () => {
  const rows = searchDiffs(sources, "const", false).map((match) => match.row);
  expect(rows).toEqual([...rows].sort((left, right) => left - right));
  expect(new Set(rows).size).toBe(rows.length);
});

test("an empty search matches nothing and the search ignores case", () => {
  expect(searchDiffs(sources, "  ", false)).toEqual([]);
  expect(searchDiffs(sources, "RETRIES", false).length).toBe(1);
});
