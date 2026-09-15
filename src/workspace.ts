import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { api } from "./api";
import { sortToTreeOrder } from "./order";
import type { RepoSettings, Tab, TabPatch } from "./store";

type Repo = {
  path: string;
  name: string;
  branch: string;
  branches: { local: string[]; remote: string[] };
  base: string;
  worktree: boolean;
};
type Changes = {
  patch: string;
  mergeBase: string;
  targetRef: string;
  warnings: string[];
};
type Result = {
  loading: boolean;
  error?: string;
  data?: Omit<Changes, "patch"> & {
    files: FileDiffMetadata[];
    version: number;
  };
};
export type Entry = Result & {
  repo: Repo;
  base: string;
  target: string;
  selected?: boolean;
};
type Workspace = { root: string; repos: Repo[]; warnings: string[] };
const loading: Result = { loading: true };

export function fileId(repo: string, name?: string) {
  return `diff-${encodeURIComponent(repo)}${name ? `-${encodeURIComponent(name)}` : ""}`;
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
// Only values that differ from the scanned defaults are worth storing, and an
// empty entry tells the server to forget that repository's overrides.
function overrides(repo: Repo, settings: RepoSettings) {
  const minimal: RepoSettings = {};
  if (settings.base && settings.base !== repo.base)
    minimal.base = settings.base;
  if (settings.target && settings.target !== "@working")
    minimal.target = settings.target;
  if (settings.selected) minimal.selected = true;
  return minimal;
}

export function useWorkspace(tab: Tab, save: (patch: TabPatch) => void) {
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

  const entries = useMemo<Entry[]>(
    () =>
      repos.map((repo) => {
        const settings = config[repo.path];
        return {
          repo,
          base: settings?.base || repo.base,
          target: settings?.target || "@working",
          selected: settings?.selected,
          ...(results[repo.path] ||
            (settings?.selected ? loading : { loading: false })),
        };
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
        setResults((previous) => ({
          ...previous,
          [repo.path]: {
            loading: false,
            data: {
              files: sortToTreeOrder(files),
              mergeBase: changes.mergeBase,
              targetRef: changes.targetRef,
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
    for (const repo of repos)
      stored[repo.path] = overrides(repo, config[repo.path] || {});
    const payload = JSON.stringify({ repos: stored });
    if (payload === saved.current) return;
    saved.current = payload;
    save({ repos: stored });
  }, [repos, config, save]);

  const reload = useCallback(
    (entry: Entry) => load(entry.repo, entry.base, entry.target),
    [load],
  );
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
    open,
    reload,
    configure,
    select,
  };
}
