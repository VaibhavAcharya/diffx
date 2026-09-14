import { expect, test } from "vitest";
import { exceptionFor, included, rule } from "./selection";

const changed = { data: { files: [{}] } };
const quiet = { data: { files: [] } };
const loading = {};

test("changed follows whether a repository has changes", () => {
  expect(rule(changed, "changed")).toBe(true);
  expect(rule(quiet, "changed")).toBe(false);
  expect(rule(loading, "changed")).toBe(false);
});

test("all and none ignore the changes", () => {
  expect(rule(quiet, "all")).toBe(true);
  expect(rule(changed, "none")).toBe(false);
});

test("an exception overrides the rule in both directions", () => {
  expect(included({ ...quiet, selected: true }, "changed")).toBe(true);
  expect(included({ ...changed, selected: false }, "changed")).toBe(false);
  expect(included({ ...changed, selected: false }, "all")).toBe(false);
  expect(included({ ...quiet, selected: true }, "none")).toBe(true);
});

test("ticking away from the rule records an exception", () => {
  expect(exceptionFor(changed, "changed", false)).toBe(false);
  expect(exceptionFor(quiet, "changed", true)).toBe(true);
  expect(exceptionFor(quiet, "all", false)).toBe(false);
});

test("ticking back to the rule drops the exception", () => {
  expect(exceptionFor({ ...changed, selected: false }, "changed", true)).toBe(
    undefined,
  );
  expect(exceptionFor({ ...quiet, selected: true }, "changed", false)).toBe(
    undefined,
  );
  expect(exceptionFor({ ...quiet, selected: false }, "all", true)).toBe(
    undefined,
  );
});

// While a diff is still loading the rule cannot say whether the repository has
// changes, so the tick is stored as given instead of measured against it.
test("a tick during loading is kept whichever way it goes", () => {
  expect(exceptionFor(loading, "changed", false)).toBe(false);
  expect(exceptionFor(loading, "changed", true)).toBe(true);
  expect(exceptionFor({ ...loading, selected: true }, "none", false)).toBe(
    false,
  );
});
