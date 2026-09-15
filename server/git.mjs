import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { readdir, stat, lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
export async function git(cwd, args, allowed = [0]) {
  try {
    return (
      await exec("git", ["-c", "core.quotePath=false", ...args], {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30000,
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
        },
      })
    ).stdout;
  } catch (error) {
    if (allowed.includes(error.code)) return error.stdout;
    throw new Error(error.stderr?.trim() || error.message, { cause: error });
  }
}
// Default directory names to skip during discovery. Build output
// names like build, dist, and target are deliberately absent: they are also
// ordinary repository names.
export const defaultIgnored = [
  ".git",
  "node_modules",
  "vendor",
  ".next",
  ".cache",
  ".pnpm-store",
  ".turbo",
  ".parcel-cache",
  ".svelte-kit",
  "__pycache__",
  "site-packages",
  "venv",
  ".venv",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".gradle",
  ".terraform",
  "DerivedData",
  "Pods",
];
// macOS bundles are directory trees presented as single files.
const bundle = /\.(app|framework|bundle|xcassets|photoslibrary)$/i;
export async function scan(
  root,
  { depth = 8, budget = 10000, ignore = defaultIgnored } = {},
) {
  if (!(await stat(root)).isDirectory()) throw new Error("Choose a directory.");
  const skip = new Set(ignore);
  const repos = [];
  const warnings = [];
  let visited = 0;
  let exhausted = false;
  const tooDeep = [];
  async function walk(dir, level) {
    if (++visited > budget) {
      exhausted = true;
      return;
    }
    if (level > depth) {
      tooDeep.push(dir);
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      warnings.push(`Could not read ${dir}`);
      return;
    }
    if (entries.some((entry) => entry.name === ".git")) {
      try {
        const branch =
          (
            await git(dir, ["symbolic-ref", "--short", "-q", "HEAD"], [0, 1])
          ).trim() || "Detached HEAD";
        const refs = (
          await git(dir, [
            "for-each-ref",
            "--format=%(refname)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
          ])
        )
          .trim()
          .split("\n")
          .filter(Boolean);
        const local = [];
        const remote = [];
        const tags = [];
        for (const ref of refs) {
          if (ref.startsWith("refs/heads/"))
            local.push(ref.slice("refs/heads/".length));
          else if (ref.startsWith("refs/tags/"))
            tags.push(ref.slice("refs/tags/".length));
          else if (ref.startsWith("refs/remotes/")) {
            const name = ref.slice("refs/remotes/".length);
            if (name.includes("/") && !name.endsWith("/HEAD"))
              remote.push(name);
          }
        }
        const remoteHead = (
          await git(
            dir,
            ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"],
            [0, 1],
          )
        ).trim();
        const base = [
          remoteHead,
          "origin/main",
          "main",
          "origin/master",
          "master",
          "HEAD",
        ].find(
          (ref) =>
            ref &&
            (ref === "HEAD" || local.includes(ref) || remote.includes(ref)),
        );
        const worktree = entries
          .find((entry) => entry.name === ".git")
          .isFile();
        // A linked worktree shares the main checkout's Git directory, which is
        // how it can say which repository it belongs to.
        const common = worktree
          ? (
              await git(
                dir,
                ["rev-parse", "--path-format=absolute", "--git-common-dir"],
                [0, 1, 128],
              )
            ).trim()
          : "";
        repos.push({
          path: dir,
          name: path.relative(root, dir) || path.basename(dir),
          branch,
          branches: { local, remote, tags },
          base,
          worktree,
          parent: common.endsWith(".git") ? path.dirname(common) : "",
        });
      } catch (error) {
        warnings.push(`${dir}: ${error.message}`);
      }
      if (
        entries.some(
          (entry) => entry.name === ".worktrees" && entry.isDirectory(),
        )
      )
        await walk(path.join(dir, ".worktrees"), level + 1);
      return;
    }
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !skip.has(entry.name) &&
        !bundle.test(entry.name)
      )
        await walk(path.join(dir, entry.name), level + 1);
      if (visited > budget) break;
    }
  }
  await walk(root, 0);
  if (exhausted)
    warnings.push(
      `Stopped after ${budget.toLocaleString("en-US")} directories. Some repositories may be missing. Raise the directory budget in Settings to search further.`,
    );
  if (tooDeep.length)
    warnings.push(
      `Stopped at ${depth} directory levels in ${tooDeep.length} place${
        tooDeep.length === 1 ? "" : "s"
      }, such as ${path.relative(root, tooDeep[0])}. Raise the search depth in Settings to look deeper.`,
    );
  const names = new Map(repos.map((repo) => [repo.path, repo.name]));
  for (const repo of repos)
    repo.parentName = (repo.parent && names.get(repo.parent)) || "";
  return {
    root,
    repos: repos.sort((a, b) => a.name.localeCompare(b.name)),
    warnings,
  };
}
// Paths carried by `git status --porcelain=v2 -z`, whose records put the path
// last: eight fields for a changed entry, ten for an unmerged one, one marker
// for an untracked or ignored file.
function statusPaths(status) {
  const paths = [];
  for (const record of status.split("\0")) {
    if (!record) continue;
    const kind = record[0];
    if (kind === "?" || kind === "!") paths.push(record.slice(2));
    else if (kind === "1" || kind === "2" || kind === "u") {
      const fields = record.split(" ");
      const skip = kind === "u" ? 10 : 8;
      if (fields.length > skip) paths.push(fields.slice(skip).join(" "));
    }
  }
  return paths;
}
// Targets beginning with @ read the current checkout instead of a named ref.
// `worktree` scopes read the files on disk; `staged` reads the index.
function scopeOf(target) {
  const staged = target === "@staged";
  const worktree =
    target === "@working" ||
    target === "@uncommitted" ||
    target === "@unstaged";
  return { staged, worktree, local: staged || worktree };
}
// A short value that changes whenever a comparison would produce a different
// patch, so the browser can poll cheaply instead of reloading whole diffs.
const statLimit = 4000;
export async function signature(repo, base, target) {
  const { local, worktree, staged } = scopeOf(target);
  const revision = async (ref) =>
    (
      await git(
        repo,
        ["rev-parse", "--verify", "-q", "--end-of-options", `${ref}^{commit}`],
        [0, 1, 128],
      )
    ).trim();
  const hash = createHash("sha1");
  hash.update(await revision(local ? "HEAD" : target));
  if (!local) hash.update(`\n${await revision(base)}`);
  else if (target === "@working") hash.update(`\n${await revision(base)}`);
  if (local) {
    const status = await git(repo, [
      "status",
      "--porcelain=v2",
      "--untracked-files=all",
      "--no-renames",
      "-z",
    ]);
    hash.update(`\n${status}`);
    // Status carries the staged content's hash but says nothing about what is
    // in the working copy, so a comparison that reads it needs timestamps too.
    if (worktree)
      for (const file of statusPaths(status).slice(0, statLimit)) {
        const info = await lstat(path.join(repo, file)).catch(() => null);
        if (info) hash.update(`\n${file}:${info.mtimeMs}:${info.size}`);
      }
    if (staged) hash.update("\nstaged");
  }
  return { signature: hash.digest("hex") };
}
// The hash Git gives an empty tree. A repository without commits has nothing
// to compare against, so its first files read as additions to nothing.
export const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
// Binary files carry no hunks, which on its own looks the same as an empty
// file. Numstat marks them with dashes and gives the path unambiguously.
async function binaryPaths(repo, range) {
  const output = await git(repo, [
    "diff",
    "--numstat",
    "-z",
    "--no-ext-diff",
    "--no-textconv",
    "--find-renames",
    ...range,
  ]);
  const records = output.split("\0");
  const binary = [];
  for (let index = 0; index < records.length; index++) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(records[index]);
    if (!match) continue;
    // A rename puts its two paths in the next two records instead.
    const renamed = match[3] === "";
    const name = renamed ? records[index + 2] : match[3];
    if (renamed) index += 2;
    if (match[1] === "-" && match[2] === "-" && name) binary.push(name);
  }
  return binary;
}
export async function diff(repo, base, target) {
  // Taken before the patch is read so a change landing mid-read shows up as a
  // stale signature rather than being silently baked in.
  const { signature: stamp } = await signature(repo, base, target);
  const resolve = async (ref) =>
    (
      await git(repo, [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${ref}^{commit}`,
      ])
    ).trim();
  const { local, worktree, staged } = scopeOf(target);
  const unstaged = target === "@unstaged";
  const unborn =
    local &&
    !(
      await git(repo, ["rev-parse", "--verify", "-q", "HEAD"], [0, 1, 128])
    ).trim();
  const warnings = [];
  if (unborn)
    warnings.push(
      "This repository has no commits yet, so everything in it is shown as new.",
    );
  const targetHash = unborn
    ? emptyTree
    : await resolve(local ? "HEAD" : target);
  // Only a comparison against another branch reaches back to a merge base; the
  // rest start at the current commit, or at the index for unstaged edits.
  const mergeBase = unstaged
    ? "@index"
    : unborn || target === "@uncommitted" || staged
      ? targetHash
      : (
          await git(repo, ["merge-base", await resolve(base), targetHash])
        ).trim();
  const range = [];
  if (staged) range.push("--cached");
  if (!unstaged) range.push(mergeBase);
  if (!local) range.push(targetHash);
  const args = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--find-renames",
    ...range,
    "--",
  ];
  let patch = await git(repo, args);
  const binary = await binaryPaths(repo, [...range, "--"]);
  if (worktree) {
    const untracked = (
      await git(repo, ["ls-files", "--others", "--exclude-standard", "-z"])
    )
      .split("\0")
      .filter(Boolean);
    for (const file of untracked) {
      try {
        const info = await lstat(path.join(repo, file));
        // Git lists a nested repository as one untracked directory entry, and
        // that repository has its own row in the review.
        if (info.isDirectory()) continue;
        if (!info.isFile()) {
          warnings.push(
            `Untracked ${info.isSymbolicLink() ? "symlink" : "special file"} skipped: ${file}`,
          );
          continue;
        }
        if (info.size > 1024 * 1024) {
          warnings.push(
            `Untracked file skipped: ${file} is ${(info.size / (1024 * 1024)).toFixed(1)} MB, over the 1 MB limit.`,
          );
          continue;
        }
        const added = await git(
          repo,
          [
            "diff",
            "--no-index",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--",
            "/dev/null",
            file,
          ],
          [0, 1],
        );
        patch += added;
        if (/^Binary files /m.test(added)) binary.push(file);
      } catch (error) {
        warnings.push(`${file}: ${error.message}`);
      }
      if (Buffer.byteLength(patch) > 16 * 1024 * 1024)
        throw new Error("Diff exceeds 16 MB. Choose a narrower comparison.");
    }
  }
  return {
    patch,
    mergeBase,
    targetRef: staged ? "@index" : local ? "@working" : targetHash,
    signature: stamp,
    binary,
    warnings,
  };
}

// Full contents are loaded only when the diff renderer expands hidden context.
export async function fileContents(
  repo,
  { name, oldName = name, oldRef, newRef, expectedHash },
) {
  const root = await realpath(repo);
  function validateName(value) {
    if (
      !value ||
      path.isAbsolute(value) ||
      value.split(/[\\/]/).some((part) => part === ".." || part === ".git")
    )
      throw new Error("Invalid file path.");
    const resolved = path.resolve(root, value);
    if (!resolved.startsWith(root + path.sep))
      throw new Error("File is outside the repository.");
    return resolved;
  }
  validateName(oldName);
  const current = validateName(name);
  const revision = (ref) => /^[a-f0-9]{40,64}$/.test(ref) || ref === "@index";
  if (!revision(oldRef) || (newRef !== "@working" && !revision(newRef)))
    throw new Error("Invalid comparison revision.");
  // `git show :path` reads the staged copy, which is the old side of an
  // unstaged comparison and the new side of a staged one.
  const show = (ref, name) =>
    git(root, ["show", ref === "@index" ? `:${name}` : `${ref}:${name}`]);
  const oldContents = await show(oldRef, oldName);
  let newContents;
  if (newRef === "@working") {
    const resolved = await realpath(current);
    const info = await lstat(current);
    if (!resolved.startsWith(root + path.sep) || !info.isFile())
      throw new Error("Cannot expand context for this file.");
    if (info.size > 2 * 1024 * 1024)
      throw new Error("Context expansion is limited to files under 2 MB.");
    newContents = await readFile(current, "utf8");
    if (expectedHash && !/^0+$/.test(expectedHash)) {
      const hash = (
        await git(root, ["hash-object", `--path=${name}`, "--", name])
      ).trim();
      if (!hash.startsWith(expectedHash))
        throw new Error(
          "This file changed since the diff was loaded. Refresh to expand its context.",
        );
    }
  } else newContents = await show(newRef, name);
  if (
    Buffer.byteLength(oldContents) > 2 * 1024 * 1024 ||
    Buffer.byteLength(newContents) > 2 * 1024 * 1024
  )
    throw new Error("Context expansion is limited to files under 2 MB.");
  if (oldContents.includes("\0") || newContents.includes("\0"))
    throw new Error("Binary files do not have text context.");
  return {
    oldFile: { name: oldName, contents: oldContents },
    newFile: { name, contents: newContents },
  };
}
