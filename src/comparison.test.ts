import { expect, test } from "vitest";
import {
  comparisonScope,
  comparisonSummary,
  reviewBranch,
  scopeTarget,
} from "./comparison";

test("existing comparisons map to the new scopes without changing their meaning", () => {
  expect(comparisonScope("@working").value).toBe("combined");
  expect(comparisonScope("HEAD").value).toBe("committed");
  expect(comparisonScope("origin/release").value).toBe("committed");
  expect(comparisonScope("@uncommitted").value).toBe("uncommitted");
});

test("local scopes use the current checkout and committed scope accepts other branches", () => {
  expect(scopeTarget("combined", "origin/release")).toBe("@working");
  expect(scopeTarget("uncommitted", "origin/release")).toBe("@uncommitted");
  expect(scopeTarget("committed", "@uncommitted")).toBe("HEAD");
  expect(scopeTarget("committed", "@working")).toBe("HEAD");
  expect(scopeTarget("committed", "origin/release")).toBe("origin/release");
});

test("summaries explain scope and show branch names instead of internal targets", () => {
  expect(comparisonSummary("@working", "feature/login")).toBe(
    "feature/login · Committed + uncommitted",
  );
  expect(comparisonSummary("@uncommitted", "feature/login")).toBe(
    "feature/login · Uncommitted only",
  );
  expect(comparisonSummary("HEAD", "feature/login")).toBe(
    "feature/login · Committed only",
  );
  expect(comparisonSummary("origin/release", "feature/login")).toBe(
    "origin/release · Committed only",
  );
  expect(reviewBranch("HEAD", "Detached HEAD")).toBe("Detached checkout");
});
