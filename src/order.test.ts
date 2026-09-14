import { expect, test } from "vitest";
import { sortToTreeOrder } from "./order";

const order = (names: string[]) =>
  sortToTreeOrder(names.map((name) => ({ name }))).map((file) => file.name);

test("directories come before files and dotted directories sort with them", () => {
  expect(
    order([
      "README.md",
      "src/App.tsx",
      ".circleci/config.yml",
      "zeta.md",
      "bin/run.mjs",
    ]),
  ).toEqual([
    ".circleci/config.yml",
    "bin/run.mjs",
    "src/App.tsx",
    "README.md",
    "zeta.md",
  ]);
});

test("names are collated the way the tree collates them", () => {
  expect(order(["a10/x.ts", "a2/x.ts"])).toEqual(["a2/x.ts", "a10/x.ts"]);
  expect(order(["src/api.ts", "src/App.tsx"])).toEqual([
    "src/api.ts",
    "src/App.tsx",
  ]);
});

test("every file survives, including repeated names", () => {
  expect(order(["b.ts", "a.ts", "a.ts"])).toEqual(["a.ts", "a.ts", "b.ts"]);
  expect(order([])).toEqual([]);
});
