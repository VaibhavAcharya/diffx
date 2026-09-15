import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  git,
  scan,
  diff,
  fileContents,
  signature,
  defaultIgnored,
} from "./git.mjs";
import { parsePatchFiles } from "@pierre/diffs";

test("allows removing default folder exclusions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "polydiff-ignore-"));
  try {
    const repo = path.join(root, "node_modules", "repo");
    await mkdir(repo, { recursive: true });
    await git(repo, ["init", "-b", "main"]);
    assert.equal((await scan(root)).repos.length, 0);
    assert.equal(
      (
        await scan(root, {
          ignore: defaultIgnored.filter((name) => name !== "node_modules"),
        })
      ).repos.length,
      1,
    );
    assert.equal((await scan(root, { ignore: [] })).repos.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovers cross-repo worktrees and compares feature changes without changing Git state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "polydiff-test-"));
  try {
    const repo = path.join(root, "build");
    await mkdir(repo);
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.name", "Polydiff Test"]);
    await git(repo, ["config", "user.email", "polydiff@example.invalid"]);
    await writeFile(path.join(repo, "tracked.txt"), "base\n");
    await git(repo, ["add", "."]);
    await git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "base"]);
    await git(repo, ["checkout", "-b", "feature"]);
    await writeFile(path.join(repo, "committed.txt"), "feature\n");
    await git(repo, ["add", "."]);
    await git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "feature"]);
    await git(repo, ["checkout", "main"]);
    await writeFile(path.join(repo, "base-only.txt"), "later base change\n");
    await git(repo, ["add", "."]);
    await git(repo, [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "advance base",
    ]);
    await git(repo, ["checkout", "feature"]);
    await writeFile(path.join(repo, "tracked.txt"), "staged\n");
    await git(repo, ["add", "."]);
    await writeFile(path.join(repo, "tracked.txt"), "staged\nunstaged\n");
    await writeFile(path.join(repo, "new file.txt"), "untracked\n");
    await writeFile(path.join(repo, "empty.txt"), "");
    await writeFile(path.join(repo, "binary.bin"), Buffer.from([0, 1, 2]));
    const tree = path.join(root, "features", "one", "build");
    await git(repo, ["worktree", "add", "-b", "other-feature", tree, "main"]);
    const workspace = await scan(root);
    assert.equal(workspace.repos.length, 2);
    assert.equal(
      workspace.repos.find((item) => item.path === tree).worktree,
      true,
    );
    const before = await git(repo, ["status", "--porcelain=v1"]);
    const changes = await diff(repo, "main", "@working");
    assert.match(changes.patch, /committed.txt/);
    assert.match(changes.patch, /\+staged/);
    assert.match(changes.patch, /\+unstaged/);
    assert.match(changes.patch, /\+untracked/);
    assert.doesNotMatch(changes.patch, /base-only/);
    const files = parsePatchFiles(changes.patch, undefined, true).flatMap(
      (patch) => patch.files,
    );
    assert.ok(files.some((file) => file.name === "new file.txt"));
    assert.ok(files.some((file) => file.name === "binary.bin"));
    assert.ok(files.some((file) => file.name === "empty.txt"));
    const tracked = files.find((file) => file.name === "tracked.txt");
    const context = await fileContents(repo, {
      name: "tracked.txt",
      oldRef: changes.mergeBase,
      newRef: changes.targetRef,
      expectedHash: tracked.newObjectId,
    });
    assert.equal(context.oldFile.contents, "base\n");
    assert.equal(context.newFile.contents, "staged\nunstaged\n");
    await assert.rejects(
      fileContents(repo, {
        name: "../outside",
        oldRef: changes.mergeBase,
        newRef: "@working",
      }),
      /Invalid file path/,
    );
    await assert.rejects(
      fileContents(repo, {
        name: "tracked.txt",
        oldRef: "main",
        newRef: "@working",
      }),
      /Invalid comparison revision/,
    );
    const committed = await diff(repo, "main", "feature");
    assert.match(committed.patch, /committed.txt/);
    assert.doesNotMatch(committed.patch, /unstaged|untracked|base-only/);
    const committedContext = await fileContents(repo, {
      name: "tracked.txt",
      oldRef: committed.mergeBase,
      newRef: committed.targetRef,
    });
    assert.equal(committedContext.newFile.contents, "base\n");
    const uncommitted = await diff(repo, "missing-base", "@uncommitted");
    assert.equal(
      uncommitted.mergeBase,
      (await git(repo, ["rev-parse", "HEAD"])).trim(),
    );
    assert.equal(uncommitted.targetRef, "@working");
    assert.doesNotMatch(uncommitted.patch, /committed.txt|base-only/);
    assert.match(uncommitted.patch, /\+staged/);
    assert.match(uncommitted.patch, /\+unstaged/);
    assert.match(uncommitted.patch, /\+untracked/);
    const localContext = await fileContents(repo, {
      name: "tracked.txt",
      oldRef: uncommitted.mergeBase,
      newRef: uncommitted.targetRef,
    });
    assert.equal(localContext.oldFile.contents, "base\n");
    assert.equal(localContext.newFile.contents, "staged\nunstaged\n");
    assert.equal((await diff(tree, "missing-base", "@uncommitted")).patch, "");
    assert.equal(await git(repo, ["status", "--porcelain=v1"]), before);
    assert.equal(
      (await git(repo, ["branch", "--show-current"])).trim(),
      "feature",
    );
    await assert.rejects(diff(repo, "--output=bad", "@working"));
    await writeFile(path.join(repo, "tracked.txt"), "changed after loading\n");
    await assert.rejects(
      fileContents(repo, {
        name: "tracked.txt",
        oldRef: changes.mergeBase,
        newRef: "@working",
        expectedHash: tracked.newObjectId,
      }),
      /changed since the diff/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("separates local from remote branches and ignores bare remote refs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "polydiff-test-"));
  try {
    const repo = path.join(root, "buildbot");
    await mkdir(repo);
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.name", "Polydiff Test"]);
    await git(repo, ["config", "user.email", "polydiff@example.invalid"]);
    await writeFile(path.join(repo, "tracked.txt"), "base\n");
    await git(repo, ["add", "."]);
    await git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "base"]);
    await git(repo, ["branch", "feature"]);
    const head = (await git(repo, ["rev-parse", "HEAD"])).trim();
    await git(repo, ["update-ref", "refs/remotes/origin/main", head]);
    await git(repo, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/main",
    ]);
    const { repos } = await scan(root);
    const { branches, base } = repos[0];
    assert.deepEqual(branches.local, ["feature", "main"]);
    // refs/remotes/origin/HEAD shortens to "origin", which is not a branch.
    assert.deepEqual(branches.remote, ["origin/main"]);
    assert.equal(base, "origin/main");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("honours the configured search depth, budget, and extra skipped folders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "polydiff-limits-"));
  try {
    const deep = path.join(root, "a", "b", "c", "repo");
    const skipped = path.join(root, "sandbox", "repo");
    for (const repo of [deep, skipped]) {
      await mkdir(repo, { recursive: true });
      await git(repo, ["init", "-b", "main"]);
    }
    const all = await scan(root);
    assert.equal(all.repos.length, 2);
    assert.deepEqual(all.warnings, []);

    const shallow = await scan(root, { depth: 2 });
    assert.equal(shallow.repos.length, 1);
    assert.match(shallow.warnings[0], /Stopped at 2 directory levels/);

    const ignored = await scan(root, { ignore: ["sandbox"] });
    assert.deepEqual(
      ignored.repos.map((repo) => repo.name),
      [path.join("a", "b", "c", "repo")],
    );

    const capped = await scan(root, { budget: 2 });
    assert.match(capped.warnings.at(-1), /Stopped after 2 directories/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the change signature follows what each comparison actually shows", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "polydiff-signature-"));
  const repo = path.join(root, "repo");
  try {
    await mkdir(repo);
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.name", "Polydiff Test"]);
    await git(repo, ["config", "user.email", "polydiff@example.invalid"]);
    await writeFile(path.join(repo, "tracked.txt"), "base\n");
    await git(repo, ["add", "."]);
    await git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "base"]);
    const stamp = (target) => signature(repo, "main", target);
    const working = await stamp("@working");
    const committed = await stamp("HEAD");
    assert.deepEqual(await stamp("@working"), working);

    await writeFile(path.join(repo, "tracked.txt"), "edited\n");
    const edited = await stamp("@working");
    assert.notDeepEqual(edited, working);
    // An edit of the same length still moves the file's timestamp.
    await writeFile(path.join(repo, "tracked.txt"), "EDITED\n");
    assert.notDeepEqual(await stamp("@working"), edited);
    // Committed review ignores the working tree until something is committed.
    assert.deepEqual(await stamp("HEAD"), committed);

    await writeFile(path.join(repo, "untracked.txt"), "new\n");
    assert.notDeepEqual(await stamp("@working"), edited);
    await git(repo, ["add", "."]);
    await git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "more"]);
    assert.notDeepEqual(await stamp("HEAD"), committed);
    assert.deepEqual(
      await stamp("@working"),
      await diff(repo, "main", "@working").then((changes) => ({
        signature: changes.signature,
      })),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
