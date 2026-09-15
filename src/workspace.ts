import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { api } from "./api";
import { sortToTreeOrder } from "./order";
import type { RepoSettings, Tab, TabPatch } from "./store";

type Repo = {
  path: string;
  name: string;
  branch: string;
  branches: { local: string[]; remote: string[]; tags: string[] };
  base: string;
  worktree: boolean;
  parentName: string;
};
type Changes = {
  patch: string;
  mergeBase: string;
  targetRef: string;
  signature: string;
  binary: string[];
  warnings: string[];
};
type Result = {
  loading: boolean;
  error?: string;
  data?: Omit<Changes, "patch" | "binary"> & {
    binary: Set<string>;
    files: FileDiffMetadata[];
    prints: Record<string, string>;
    version: number;
  };
};
export type Entry = Result & {
  repo: Repo;
  base: string;
  target: string;
  selected?: boolean;
  reviewed: Record<string, string>;
};
type Workspace = { root: string; repos: Repo[]; warnings: string[] };
const loading: Result = { loading: true };

export function fileId(repo: string, name?: string) {
  return `diff-${encodeURIComponent(repo)}${name ? `-${encodeURIComponent(name)}` : ""}`;
}
export function digest(values: Iterable<string>) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    for (let index = 0; index < value.length; index++)
      hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
    hash = Math.imul(hash ^ 10, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
// One value per file that stands for everything its diff shows. Expanding
// context rewrites the metadata in place, so this is taken once, on arrival.
export function fingerprint(file: FileDiffMetadata) {
  return digest(
    (function* () {
      yield file.name;
      yield file.prevName || "";
      yield file.type;
      yield `${file.prevMode || ""}>${file.mode || ""}`;
      for (const hunk of file.hunks)
        yield `${hunk.deletionStart},${hunk.deletionCount},${hunk.additionStart},${hunk.additionCount}`;
      yield* file.deletionLines;
      yield* file.additionLines;
    })(),
  );
}
export function stats(files: FileDiffMetadata[]) {
  return files
    .flatMap((file) => file.hunks)
    .reduce(
      (total, hunk) => ({
        added: total.added + hunk.additionLines,
        removed: total.removed + hunk.deletionLines,
      }),
      { added: 0, removed: 0 },
    );
}
// A file counts as reviewed while its diff still looks the way it did when it
// was ticked; anything else brings it back into the review.
export function reviewedFiles(entry: Entry) {
  const prints = entry.data?.prints;
  if (!prints) return new Set<string>();
  return new Set(
    Object.keys(prints).filter((name) => entry.reviewed[name] === prints[name]),
  );
}
// Only values that differ from the scanned defaults are worth storing, and an
// empty entry tells the server to forget that repository's overrides. Reviewed
// files whose paths have left the comparison are dropped once it is loaded.
function overrides(repo: Repo, settings: RepoSettings, known?: Set<string>) {
  const minimal: RepoSettings = {};
  if (settings.base && settings.base !== repo.base)
    minimal.base = settings.base;
  if (settings.target && settings.target !== "@working")
    minimal.target = settings.target;
  if (settings.selected) minimal.selected = true;
  const reviewed = Object.entries(settings.reviewed || {}).filter(
    ([name]) => !known || known.has(name),
  );
  if (reviewed.length) minimal.reviewed = Object.fromEntries(reviewed);
  return minimal;
}

// How often a watched workspace asks the server whether anything moved.
const pollInterval = 2500;

export function useWorkspace(
  tab: Tab,
  save: (patch: TabPatch) => void,
  { active, autoRefresh }: { active: boolean; autoRefresh: boolean },
) {
  const [root, setRoot] = useState(tab.root);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [config, setConfig] = useState(tab.repos);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const scanRequest = useRef<AbortController | null>(null);
  const requests = useRef(new Map<string, AbortController>());
  const counter = useRef(0);
  const configRef = useRef(config);
  const saved = useRef("");
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Repositories in the review come first so the sidebar and the review pane
  // read in the same order. Inside each group a linked worktree sorts under
  // the repository it belongs to, and everything else is alphabetical.
  const entries = useMemo<Entry[]>(
    () =>
      repos
        .map((repo) => {
          const settings = config[repo.path];
          return {
            repo,
            base: settings?.base || repo.base,
            target: settings?.target || "@working",
            selected: settings?.selected,
            reviewed: settings?.reviewed || {},
            ...(results[repo.path] ||
              (settings?.selected ? loading : { loading: false })),
          };
        })
        .sort((left, right) => {
          const group = (entry: Entry) =>
            entry.repo.parentName || entry.repo.name;
          return (
            Number(!!right.selected) - Number(!!left.selected) ||
            group(left).localeCompare(group(right)) ||
            Number(!!left.repo.parentName) - Number(!!right.repo.parentName) ||
            left.repo.name.localeCompare(right.repo.name)
          );
        }),
    [repos, config, results],
  );
  const selected = useMemo(
    () => entries.filter((entry) => entry.selected),
    [entries],
  );

  const load = useCallback(
    async (repo: Repo, base: string, target: string, parent?: AbortSignal) => {
      if (parent?.aborted) return;
      requests.current.get(repo.path)?.abort();
      const controller = new AbortController();
      requests.current.set(repo.path, controller);
      const abort = () => controller.abort();
      parent?.addEventListener("abort", abort, { once: true });
      const version = ++counter.current;
      setResults((previous) => ({
        ...previous,
        [repo.path]: { ...previous[repo.path], loading: true },
      }));
      try {
        const changes = await api<Changes>(
          "diff",
          { repo: repo.path, base, target },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const files = parsePatchFiles(
          changes.patch,
          `${repo.path}:${version}`,
          true,
        ).flatMap((patch) => patch.files);
        const prints: Record<string, string> = {};
        for (const file of files) prints[file.name] = fingerprint(file);
        setResults((previous) => ({
          ...previous,
          [repo.path]: {
            loading: false,
            data: {
              files: sortToTreeOrder(files),
              prints,
              mergeBase: changes.mergeBase,
              targetRef: changes.targetRef,
              signature: changes.signature,
              binary: new Set(changes.binary),
              warnings: changes.warnings,
              version,
            },
          },
        }));
      } catch (cause) {
        if (!controller.signal.aborted)
          setResults((previous) => ({
            ...previous,
            [repo.path]: {
              loading: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Could not load changes.",
            },
          }));
      } finally {
        parent?.removeEventListener("abort", abort);
        if (requests.current.get(repo.path) === controller)
          requests.current.delete(repo.path);
      }
    },
    [],
  );

  const open = useCallback(
    async (path: string, preserve = false) => {
      scanRequest.current?.abort();
      requests.current.forEach((controller) => controller.abort());
      requests.current.clear();
      const controller = new AbortController();
      scanRequest.current = controller;
      setScanning(true);
      setError("");
      try {
        const workspace = await api<Workspace>(
          "workspace",
          { path },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setRoot(workspace.root);
        setWarnings(workspace.warnings);
        setRepos(workspace.repos);
        if (!preserve) setResults({});
        setScanning(false);
        let index = 0;
        await Promise.all(
          Array.from(
            { length: Math.min(4, workspace.repos.length) },
            async () => {
              while (
                index < workspace.repos.length &&
                !controller.signal.aborted
              ) {
                const repo = workspace.repos[index++];
                const settings = configRef.current[repo.path];
                if (!settings?.selected) continue;
                await load(
                  repo,
                  settings?.base || repo.base,
                  settings?.target || "@working",
                  controller.signal,
                );
              }
            },
          ),
        );
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not scan workspace.",
          );
          setScanning(false);
        }
      }
    },
    [load],
  );
  useEffect(() => {
    void open(tab.root);
    const pending = requests.current;
    return () => {
      scanRequest.current?.abort();
      pending.forEach((controller) => controller.abort());
    };
  }, [open, tab.root]);

  useEffect(() => {
    if (!repos.length) return;
    const stored: Record<string, RepoSettings> = {};
    for (const repo of repos) {
      const prints = results[repo.path]?.data?.prints;
      stored[repo.path] = overrides(
        repo,
        config[repo.path] || {},
        prints && new Set(Object.keys(prints)),
      );
    }
    const payload = JSON.stringify({ repos: stored });
    if (payload === saved.current) return;
    saved.current = payload;
    save({ repos: stored });
  }, [repos, config, results, save]);

  const reload = useCallback(
    (entry: Entry) => load(entry.repo, entry.base, entry.target),
    [load],
  );

  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const [checking, setChecking] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const watched = useRef<Entry[]>(selected);
  useEffect(() => {
    watched.current = selected;
  }, [selected]);
  useEffect(() => {
    const track = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", track);
    return () => document.removeEventListener("visibilitychange", track);
  }, []);
  // A background tab, a hidden window, and a workspace still being scanned all
  // stop the polling rather than queue work nobody is looking at.
  const watching = autoRefresh && active && visible && !scanning;
  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const targets = watched.current.filter(
        (entry) => !entry.loading && entry.data,
      );
      if (targets.length) {
        setChecking(true);
        try {
          const stale: Entry[] = [];
          for (const entry of targets) {
            const current = await api<{ signature: string }>("signature", {
              repo: entry.repo.path,
              base: entry.base,
              target: entry.target,
            });
            if (stopped) return;
            if (current.signature !== entry.data!.signature) stale.push(entry);
          }
          if (stale.length) {
            await Promise.all(
              stale.map((entry) => load(entry.repo, entry.base, entry.target)),
            );
            if (!stopped) setRefreshedAt(Date.now());
          }
        } catch {
          // A failed check is not worth reporting; the next one retries.
        } finally {
          if (!stopped) setChecking(false);
        }
      }
      if (!stopped) timer = setTimeout(() => void check(), pollInterval);
    };
    timer = setTimeout(() => void check(), pollInterval);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [watching, load]);
  const configure = useCallback(
    (entry: Entry, patch: { base?: string; target?: string }) => {
      setConfig((previous) => ({
        ...previous,
        [entry.repo.path]: { ...previous[entry.repo.path], ...patch },
      }));
      if (entry.selected)
        void load(
          entry.repo,
          patch.base ?? entry.base,
          patch.target ?? entry.target,
        );
    },
    [load],
  );
  const review = useCallback(
    (entry: Entry, names: string[], value: boolean) => {
      setConfig((previous) => {
        const current = previous[entry.repo.path] || {};
        const reviewed = { ...current.reviewed };
        for (const name of names) {
          const print = entry.data?.prints[name];
          if (value && print) reviewed[name] = print;
          if (!value) delete reviewed[name];
        }
        return { ...previous, [entry.repo.path]: { ...current, reviewed } };
      });
    },
    [],
  );
  const select = useCallback(
    (entry: Entry, selected: boolean) => {
      setConfig((previous) => ({
        ...previous,
        [entry.repo.path]: { ...previous[entry.repo.path], selected },
      }));
      if (selected) void load(entry.repo, entry.base, entry.target);
      else {
        requests.current.get(entry.repo.path)?.abort();
        setResults((previous) => {
          const next = { ...previous };
          delete next[entry.repo.path];
          return next;
        });
      }
    },
    [load],
  );

  return {
    root,
    entries,
    selected,
    scanning,
    error,
    warnings,
    watch: {
      on: autoRefresh,
      watching,
      checking,
      paused: autoRefresh && !(active && visible),
      refreshedAt,
    },
    open,
    reload,
    configure,
    review,
    select,
  };
}
