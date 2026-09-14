import { useCallback, useEffect, useRef, useState } from "react";
import { api, post } from "./api";

export type Settings = {
  theme: "system" | "light" | "dark";
  layout: "unified" | "split";
  wrap: boolean;
  wordDiff: "word-alt" | "word" | "char" | "none";
  expansionLines: number;
  density: "compact" | "default" | "relaxed";
  sidebarWidth: number;
  scanDepth: number;
  scanBudget: number;
  ignore: string[];
};
export type Selection = "changed" | "all" | "none";
export type RepoSettings = {
  base?: string;
  target?: string;
  selected?: boolean;
};
export type Tab = {
  id: string;
  root: string;
  selection: Selection;
  repos: Record<string, RepoSettings>;
};
export type TabPatch = {
  repos?: Record<string, RepoSettings>;
  selection?: Selection;
};
type State = {
  version: number;
  revision: number;
  settings: Settings;
  activeTab: string | null;
  tabs: Tab[];
  recent: Tab[];
};
type Command =
  | { op: "reset-settings" }
  | { op: "settings"; settings: Partial<Settings> }
  | { op: "open"; root: string }
  | { op: "duplicate"; id: string }
  | { op: "close"; id: string }
  | { op: "reopen" }
  | { op: "activate"; id: string }
  | ({ op: "tab"; id: string } & TabPatch);

const separator = /[\\/]+/;
function segments(root: string) {
  return root.split(separator).filter(Boolean);
}
export function tabName(tab: Tab, all: Tab[]) {
  const parts = segments(tab.root);
  const name = parts.at(-1) || tab.root;
  const collides = all.some(
    (other) =>
      other.root !== tab.root && (segments(other.root).at(-1) || "") === name,
  );
  const label = collides && parts.length > 1 ? `${parts.at(-2)}/${name}` : name;
  const sameRoot = all.filter((other) => other.root === tab.root);
  if (sameRoot.length < 2) return label;
  const index = sameRoot.findIndex((other) => other.id === tab.id);
  return index > 0 ? `${label} ${index + 1}` : label;
}

export function useStore() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [visited, setVisited] = useState<string[]>([]);
  const latest = useRef<State | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(new Map<string, TabPatch>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const accept = useCallback((next: State) => {
    latest.current = next;
    setState(next);
  }, []);
  const send = useCallback(
    (command: Command) => {
      const request = queue.current.then(() => post<State>("state", command));
      queue.current = request.then(
        () => {},
        () => {},
      );
      return request.then(
        (next) => {
          accept(next);
          return next;
        },
        (cause: Error) => {
          setError(cause.message);
          throw cause;
        },
      );
    },
    [accept],
  );
  // Whichever tab the command leaves active has to be mounted to render.
  const run = useCallback(
    async (command: Command) => {
      const next = await send(command);
      const active = next.activeTab;
      if (active)
        setVisited((previous) =>
          previous.includes(active) ? previous : [...previous, active],
        );
      return next;
    },
    [send],
  );

  useEffect(() => {
    let active = true;
    void api<State>("state")
      .then((stored) => {
        if (!active) return;
        accept(stored);
        if (stored.activeTab) setVisited([stored.activeTab]);
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [accept]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const patches = [...pending.current];
    pending.current.clear();
    for (const [id, patch] of patches)
      void run({ op: "tab", id, ...patch }).catch(() => {});
  }, [run]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const saveTab = useCallback(
    (id: string, patch: TabPatch) => {
      const waiting = pending.current.get(id);
      pending.current.set(id, {
        ...waiting,
        ...patch,
        ...(waiting?.repos || patch.repos
          ? { repos: { ...waiting?.repos, ...patch.repos } }
          : {}),
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [flush],
  );

  const activate = useCallback(
    (id: string) => {
      setVisited((previous) =>
        previous.includes(id) ? previous : [...previous, id],
      );
      setState((previous) => previous && { ...previous, activeTab: id });
      void send({ op: "activate", id }).catch(() => {});
    },
    [send],
  );
  const setSettings = useCallback(
    (settings: Partial<Settings>) => {
      setState(
        (previous) =>
          previous && {
            ...previous,
            settings: { ...previous.settings, ...settings },
          },
      );
      void send({ op: "settings", settings }).catch(() => {});
    },
    [send],
  );
  const browse = useCallback(async () => {
    setBrowsing(true);
    setError("");
    try {
      const tabs = latest.current?.tabs || [];
      const active = tabs.find((tab) => tab.id === latest.current?.activeTab);
      const chosen = await api<{ path?: string; canceled?: boolean }>(
        "choose-directory",
        active ? { path: active.root } : {},
      );
      if (chosen.path) await run({ op: "open", root: chosen.path });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open a folder.",
      );
    } finally {
      setBrowsing(false);
    }
  }, [run]);
  const close = useCallback(
    (id: string) => {
      setVisited((previous) => previous.filter((value) => value !== id));
      void run({ op: "close", id }).catch(() => {});
    },
    [run],
  );
  const duplicate = useCallback(
    (id: string) => void run({ op: "duplicate", id }).catch(() => {}),
    [run],
  );
  const reopen = useCallback(
    () => void run({ op: "reopen" }).catch(() => {}),
    [run],
  );

  return {
    settings: state?.settings,
    tabs: state?.tabs || [],
    recent: state?.recent || [],
    activeTab: state?.activeTab || null,
    ready: state !== null,
    visited,
    error,
    browsing,
    activate,
    browse,
    close,
    duplicate,
    reopen,
    saveTab,
    setSettings,
    resetSettings: () => void send({ op: "reset-settings" }).catch(() => {}),
  };
}
