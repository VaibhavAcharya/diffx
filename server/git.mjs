import { execFile } from "node:child_process";
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
// Directory names that never hold a repository worth reviewing. Build output
// names like build, dist, and target are deliberately absent: they are also
// ordinary repository names.
const ignored = new Set([
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
]);
// macOS bundles are directory trees presented as single files.
const bundle = /\.(app|framework|bundle|xcassets|photoslibrary)$/i;
export async function scan(
  root,
  { depth = 8, budget = 10000, ignore = [] } = {},
) {
  if (!(await stat(root)).isDirectory()) throw new Error("Choose a directory.");
  const skip = ignore.length ? new Set([...ignored, ...ignore]) : ignored;
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
          ])
        )
          .trim()
          .split("\n")
          .filter(Boolean);
        const local = [];
        const remote = [];
        for (const ref of refs) {
          if (ref.startsWith("refs/heads/"))
            local.push(ref.slice("refs/heads/".length));
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
        repos.push({
          path: dir,
          name: path.relative(root, dir) || path.basename(dir),
          branch,
          branches: { local, remote },
          base,
          worktree: entries.find((entry) => entry.name === ".git").isFile(),
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
  return {
    root,
    repos: repos.sort((a, b) => a.name.localeCompare(b.name)),
    warnings,
  };
}
export async function diff(repo, base, target) {
  const resolve = async (ref) =>
    (
      await git(repo, [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${ref}^{commit}`,
      ])
    ).trim();
  const baseHash = await resolve(base);
  const targetHash = await resolve(target === "@working" ? "HEAD" : target);
  const mergeBase = (
    await git(repo, ["merge-base", baseHash, targetHash])
  ).trim();
  const args = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--find-renames",
    mergeBase,
  ];
  if (target !== "@working") args.push(targetHash);
  args.push("--");
  let patch = await git(repo, args);
  const warnings = [];
  if (target === "@working") {
    const untracked = (
      await git(repo, ["ls-files", "--others", "--exclude-standard", "-z"])
    )
      .split("\0")
      .filter(Boolean);
    for (const file of untracked) {
      try {
        const info = await lstat(path.join(repo, file));
        if (!info.isFile() || info.size > 1024 * 1024) {
          warnings.push(
            `Untracked file skipped (not a regular file or exceeds 1 MB): ${file}`,
          );
          continue;
        }
        patch += await git(
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
    targetRef: target === "@working" ? "@working" : targetHash,
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
  if (
    !/^[a-f0-9]{40,64}$/.test(oldRef) ||
    (newRef !== "@working" && !/^[a-f0-9]{40,64}$/.test(newRef))
  )
    throw new Error("Invalid comparison revision.");
  const oldContents = await git(root, ["show", `${oldRef}:${oldName}`]);
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
  } else newContents = await git(root, ["show", `${newRef}:${name}`]);
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
