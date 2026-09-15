import { expect, test } from "vitest";
import type { FileDiffMetadata } from "@pierre/diffs";
import { isGenerated, noFilter, visibleFiles } from "./filter";

const file = (name: string, type = "change") =>
  ({ name, type, hunks: [] }) as unknown as FileDiffMetadata;
const names = (files: FileDiffMetadata[]) => files.map((item) => item.name);

test("search text matches any part of a path", () => {
  const files = [file("src/App.tsx"), file("server/git.mjs")];
  expect(names(visibleFiles(files, { ...noFilter, query: " GIT " }))).toEqual([
    "server/git.mjs",
  ]);
  expect(names(visibleFiles(files, { ...noFilter, query: ".tsx" }))).toEqual([
    "src/App.tsx",
  ]);
  // A repository whose own name matched keeps all of its files.
  expect(
    names(
      visibleFiles(files, { ...noFilter, query: "zzz" }, { skipQuery: true }),
    ),
  ).toEqual(names(files));
});

test("change types and reviewed files filter independently", () => {
  const files = [
    file("added.ts", "new"),
    file("gone.ts", "deleted"),
    file("moved.ts", "rename-changed"),
    file("edited.ts"),
  ];
  expect(names(visibleFiles(files, { ...noFilter, kinds: ["added"] }))).toEqual(
    ["added.ts"],
  );
  expect(
    names(visibleFiles(files, { ...noFilter, kinds: ["renamed", "deleted"] })),
  ).toEqual(["gone.ts", "moved.ts"]);
  expect(
    names(
      visibleFiles(
        files,
        { ...noFilter, hideReviewed: true },
        { reviewed: (name) => name === "edited.ts" },
      ),
    ),
  ).toEqual(["added.ts", "gone.ts", "moved.ts"]);
});

test("generated files are recognised by name and by path", () => {
  for (const name of [
    "pnpm-lock.yaml",
    "app/yarn.lock",
    "src/__snapshots__/App.test.tsx.snap",
    "web/dist/app.min.js",
    "api/proto/user.pb.go",
    "lib/generated/client.ts",
    "styles/app.css.map",
  ])
    expect(isGenerated(name), name).toBe(true);
  for (const name of ["src/lock.ts", "package.json", "docs/snapshot.md"])
    expect(isGenerated(name), name).toBe(false);
  expect(
    names(
      visibleFiles([file("package.json"), file("pnpm-lock.yaml")], {
        ...noFilter,
        hideNoise: true,
      }),
    ),
  ).toEqual(["package.json"]);
});

test("an empty filter returns the same list it was given", () => {
  const files = [file("a.ts"), file("b.ts")];
  expect(visibleFiles(files, noFilter)).toBe(files);
});
