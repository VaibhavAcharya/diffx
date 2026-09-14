import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultIgnored } from "./git.mjs";

const directory =
  process.env.POLYDIFF_HOME || path.join(os.homedir(), ".polydiff");
const file = path.join(directory, "db.json");
const recentLimit = 10;

export const defaults = {
  theme: "system",
  layout: "unified",
  wrap: false,
  wordDiff: "word-alt",
  expansionLines: 20,
  density: "compact",
  sidebarWidth: 304,
  scanDepth: 8,
  scanBudget: 10000,
  ignore: defaultIgnored,
};
const choices = {
  theme: ["system", "light", "dark"],
  layout: ["unified", "split"],
  wordDiff: ["word-alt", "word", "char", "none"],
  density: ["compact", "default", "relaxed"],
};
const ranges = {
  sidebarWidth: [220, 640],
  expansionLines: [5, 200],
  scanDepth: [1, 16],
  scanBudget: [100, 200000],
};
const selections = ["changed", "all", "none", "custom"];

function blank() {
  return {
    version: 3,
    revision: 0,
    settings: { ...defaults },
    activeTab: null,
    tabs: [],
    recent: [],
  };
}
function cleanSettings(value) {
  const settings = { ...defaults };
  if (!value || typeof value !== "object") return settings;
  for (const [key, allowed] of Object.entries(choices))
    if (allowed.includes(value[key])) settings[key] = value[key];
  for (const [key, [low, high]] of Object.entries(ranges)) {
    const number = Math.round(Number(value[key]));
    if (Number.isFinite(number))
      settings[key] = Math.min(high, Math.max(low, number));
  }
  if (typeof value.wrap === "boolean") settings.wrap = value.wrap;
  if (Array.isArray(value.ignore))
    settings.ignore = [
      ...new Set(
        value.ignore.filter(
          (name) =>
            typeof name === "string" &&
            name.length > 0 &&
            name.length < 64 &&
            !/[/\\]/.test(name),
        ),
      ),
    ].slice(0, 200);
  return settings;
}
function cleanRepos(value) {
  if (!value || typeof value !== "object") return {};
  const repos = {};
  for (const [repo, settings] of Object.entries(value)) {
    if (!path.isAbsolute(repo) || !settings || typeof settings !== "object")
      continue;
    const clean = {};
    if (typeof settings.base === "string" && settings.base)
      clean.base = settings.base;
    if (
      typeof settings.target === "string" &&
      settings.target &&
      settings.target !== "@working"
    )
      clean.target = settings.target;
    if (typeof settings.selected === "boolean")
      clean.selected = settings.selected;
    if (Object.keys(clean).length) repos[repo] = clean;
  }
  return repos;
}
function cleanTab(value, seen, migrating) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.id !== "string" || !value.id || seen.has(value.id))
    return null;
  if (typeof value.root !== "string" || !path.isAbsolute(value.root))
    return null;
  seen.add(value.id);
  const repos = cleanRepos(value.repos);
  // Version 1 had no selection mode. A tab where every repository was ticked
  // by hand is a custom selection; anything else followed the changes.
  const inferred =
    migrating &&
    Object.values(repos).some((settings) => settings.selected !== undefined)
      ? "custom"
      : "changed";
  return {
    id: value.id,
    root: value.root,
    selection: selections.includes(value.selection)
      ? value.selection
      : inferred,
    repos,
  };
}
export function sanitize(value) {
  if (!value || typeof value !== "object") return blank();
  const migrating = value.version === 1;
  const seen = new Set();
  const list = (input) =>
    (Array.isArray(input) ? input : [])
      .map((tab) => cleanTab(tab, seen, migrating))
      .filter(Boolean);
  const tabs = list(value.tabs);
  const recent = list(value.recent).slice(0, recentLimit);
  const revision =
    Number.isInteger(value.revision) && value.revision >= 0
      ? value.revision
      : 0;
  return {
    version: 3,
    revision,
    settings: cleanSettings(
      value.version === 1 || value.version === 2
        ? {
            ...value.settings,
            ignore: [
              ...defaultIgnored,
              ...(Array.isArray(value.settings?.ignore)
                ? value.settings.ignore
                : []),
            ],
          }
        : value.settings,
    ),
    activeTab: tabs.some((tab) => tab.id === value.activeTab)
      ? value.activeTab
      : (tabs[0]?.id ?? null),
    tabs,
    recent,
  };
}
function nextId(state) {
  const taken = new Set([...state.tabs, ...state.recent].map((tab) => tab.id));
  const stamp = Date.now().toString(36);
  for (let suffix = 0; ; suffix++) {
    const id = `t${stamp}${suffix ? suffix.toString(36) : ""}`;
    if (!taken.has(id)) return id;
  }
}
function insert(state, tab, index) {
  return {
    ...state,
    activeTab: tab.id,
    tabs: [...state.tabs.slice(0, index), tab, ...state.tabs.slice(index)],
  };
}
export function apply(state, command) {
  const op = command && typeof command === "object" ? command.op : null;
  if (op === "reset-settings")
    return { ...state, settings: cleanSettings(null) };
  if (op === "settings")
    return {
      ...state,
      settings: cleanSettings({ ...state.settings, ...command.settings }),
    };
  if (op === "open") {
    if (typeof command.root !== "string" || !path.isAbsolute(command.root))
      throw new Error("Choose a directory.");
    if (command.focus) {
      const existing = state.tabs.find((tab) => tab.root === command.root);
      if (existing) return { ...state, activeTab: existing.id };
    }
    const tab = {
      id: nextId(state),
      root: command.root,
      selection: "changed",
      repos: {},
    };
    return insert(state, tab, state.tabs.length);
  }
  if (op === "duplicate") {
    const index = state.tabs.findIndex((tab) => tab.id === command.id);
    if (index < 0) return state;
    const source = state.tabs[index];
    return insert(
      state,
      { ...source, id: nextId(state), repos: { ...source.repos } },
      index + 1,
    );
  }
  if (op === "close") {
    const index = state.tabs.findIndex((tab) => tab.id === command.id);
    if (index < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== command.id);
    return {
      ...state,
      tabs,
      activeTab:
        state.activeTab === command.id
          ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
          : state.activeTab,
      recent: [state.tabs[index], ...state.recent].slice(0, recentLimit),
    };
  }
  if (op === "reopen") {
    const [closed, ...recent] = state.recent;
    if (!closed) return state;
    return { ...insert(state, closed, state.tabs.length), recent };
  }
  if (op === "activate")
    return state.tabs.some((tab) => tab.id === command.id)
      ? { ...state, activeTab: command.id }
      : state;
  if (op === "tab") {
    const current = state.tabs.find((tab) => tab.id === command.id);
    if (!current) return state;
    // Repository settings merge so that a repository missing from the latest
    // scan keeps what it was given.
    const tab = {
      ...current,
      selection: selections.includes(command.selection)
        ? command.selection
        : current.selection,
      repos:
        command.repos && typeof command.repos === "object"
          ? cleanRepos({ ...current.repos, ...command.repos })
          : current.repos,
    };
    return {
      ...state,
      tabs: state.tabs.map((item) => (item.id === command.id ? tab : item)),
    };
  }
  throw new Error(`Unknown command: ${op}`);
}
function trim(state) {
  const settings = {};
  for (const [key, value] of Object.entries(state.settings))
    if (JSON.stringify(value) !== JSON.stringify(defaults[key]))
      settings[key] = value;
  return { ...state, settings };
}
let queue = Promise.resolve();
async function load() {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return blank();
    throw error;
  }
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    await rename(file, `${file}.corrupt`).catch(() => {});
    return blank();
  }
}
export function read() {
  return load();
}
async function persist(state) {
  await mkdir(directory, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(trim(state), null, 2)}\n`);
  await rename(temp, file);
}
function update(change) {
  const next = queue.then(async () => {
    const current = await read();
    const state = sanitize({
      ...change(current),
      revision: current.revision + 1,
    });
    await persist(state);
    return state;
  });
  queue = next.then(
    () => {},
    () => {},
  );
  return next;
}
export function send(command) {
  return update((state) => apply(state, command));
}
export function write(value) {
  return update(() => sanitize(value));
}
