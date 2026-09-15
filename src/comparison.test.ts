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

test("staged and unstaged review have their own scopes and no base branch", () => {
  expect(comparisonScope("@staged").value).toBe("staged");
  expect(comparisonScope("@unstaged").value).toBe("unstaged");
  expect(comparisonScope("@staged").base).toBe(false);
  expect(scopeTarget("staged", "origin/release")).toBe("@staged");
  expect(scopeTarget("unstaged", "origin/release")).toBe("@unstaged");
  expect(scopeTarget("committed", "@staged")).toBe("HEAD");
  expect(comparisonSummary("@staged", "feature/login")).toBe(
    "feature/login · Staged only",
  );
  expect(comparisonSummary("@unstaged", "feature/login")).toBe(
    "feature/login · Unstaged only",
  );
});

test("a commit or tag can stand in for a review branch", () => {
  expect(comparisonScope("v1.2.0").value).toBe("committed");
  expect(reviewBranch("9f1c2ab", "main")).toBe("9f1c2ab");
  expect(comparisonSummary("v1.2.0", "main")).toBe("v1.2.0 · Committed only");
});
