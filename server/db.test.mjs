import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const home = await mkdtemp(path.join(os.tmpdir(), "polydiff-db-"));
process.env.POLYDIFF_HOME = home;
const db = await import("./db.mjs");
const file = path.join(home, "db.json");
const empty = db.sanitize(null);

test.after(() => rm(home, { recursive: true, force: true }));

test("returns a blank database with default settings", async () => {
  assert.deepEqual(await db.read(), {
    version: 6,
    revision: 0,
    settings: db.defaults,
    activeTab: null,
    tabs: [],
    recent: [],
  });
});

test("round trips a tab and stores only settings that differ", async () => {
  const tab = {
    id: "t1",
    root: "/tmp/workspace",
    repos: { "/tmp/workspace/build": { base: "main", selected: true } },
  };
  await db.write({
    version: 6,
    activeTab: "t1",
    tabs: [tab],
    settings: { wrap: true },
  });
  const state = await db.read();
  assert.deepEqual(state.tabs, [tab]);
  assert.equal(state.settings.wrap, true);
  assert.equal(state.settings.layout, "unified");
  const raw = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(raw.settings, { wrap: true });
  assert.match(await readFile(file, "utf8"), /\n$/);
});

test("drops malformed tabs, duplicate ids, and relative repository paths", () => {
  const state = db.sanitize({
    version: 2,
    activeTab: "missing",
    tabs: [
      { id: "keep", root: "/tmp/a", repos: { "relative/path": { base: "x" } } },
      { id: "keep", root: "/tmp/duplicate" },
      { id: "", root: "/tmp/b" },
      { id: "relative-root", root: "tmp/c" },
      "nonsense",
      null,
    ],
  });
  assert.deepEqual(state.tabs, [{ id: "keep", root: "/tmp/a", repos: {} }]);
  assert.equal(state.activeTab, "keep");
});

test("preserves explicit version 1 selections", () => {
  const state = db.sanitize({
    version: 1,
    activeTab: "a",
    tabs: [
      { id: "a", root: "/tmp/a", repos: { "/tmp/a/one": { selected: true } } },
      { id: "b", root: "/tmp/b", repos: { "/tmp/b/one": { base: "main" } } },
    ],
  });
  assert.equal(state.tabs[0].selection, undefined);
  assert.deepEqual(state.tabs[0].repos, { "/tmp/a/one": { selected: true } });
  assert.equal(state.tabs[1].selection, undefined);
  assert.deepEqual(state.settings, db.defaults);
});

test("retires the custom mode and keeps only the ticks that counted", () => {
  const tabs = [
    {
      id: "a",
      root: "/tmp/a",
      selection: "custom",
      repos: {
        "/tmp/a/one": { selected: false },
        "/tmp/a/two": { base: "main", selected: true },
      },
    },
    {
      id: "b",
      root: "/tmp/b",
      selection: "all",
      repos: { "/tmp/b/one": { target: "release", selected: false } },
    },
  ];
  const state = db.sanitize({ version: 3, tabs, recent: [] });
  assert.equal(state.version, 6);
  assert.equal(state.tabs[0].selection, undefined);
  assert.deepEqual(state.tabs[0].repos, {
    "/tmp/a/two": { base: "main", selected: true },
  });
  // Before version 4, ticks under all or none never applied.
  assert.equal(state.tabs[1].selection, undefined);
  assert.deepEqual(state.tabs[1].repos, {
    "/tmp/b/one": { target: "release" },
  });
  // Unticked repositories need no stored selection.
  const again = db.sanitize({
    ...state,
    tabs: [{ ...state.tabs[1], repos: { "/tmp/b/one": { selected: false } } }],
  });
  assert.deepEqual(again.tabs[0].repos, {});
});

test("discards repository settings that only repeat the defaults", () => {
  const [tab] = db.sanitize({
    version: 2,
    tabs: [
      {
        id: "a",
        root: "/tmp/a",
        repos: {
          "/tmp/a/one": { target: "@working" },
          "/tmp/a/two": { target: "release" },
        },
      },
    ],
  }).tabs;
  assert.deepEqual(tab.repos, { "/tmp/a/two": { target: "release" } });
});

test("clamps numeric settings and ignores unusable values", () => {
  const { settings } = db.sanitize({
    version: 3,
    settings: {
      theme: "sepia",
      expansionLines: 5000,
      scanDepth: 0,
      density: "relaxed",
      sidebarWidth: 900,
      ignore: ["target", "a/b", "", 7, "target"],
    },
  });
  assert.equal(settings.theme, "system");
  assert.equal(settings.expansionLines, 200);
  assert.equal(settings.scanDepth, 1);
  assert.equal(settings.density, "relaxed");
  assert.equal(settings.sidebarWidth, 640);
  assert.deepEqual(settings.ignore, ["target"]);
});

test("migrates additive exclusions and retires automatic selection", () => {
  const state = db.sanitize({
    version: 2,
    settings: { ignore: ["target", "node_modules"] },
    tabs: [{ id: "a", root: "/tmp/a", selection: "all" }],
  });
  assert.equal(state.version, 6);
  assert.deepEqual(state.settings.ignore, [...db.defaults.ignore, "target"]);
  assert.equal(state.tabs[0].selection, undefined);
  const custom = Array.from({ length: 100 }, (_, index) => `cache-${index}`);
  assert.deepEqual(
    db.sanitize({ version: 2, settings: { ignore: custom } }).settings.ignore,
    [...db.defaults.ignore, ...custom],
  );
});

test("persists removing every default exclusion and resizing the sidebar", async () => {
  await db.write({ ...empty, settings: { ignore: [], sidebarWidth: 420 } });
  const state = await db.read();
  assert.deepEqual(state.settings.ignore, []);
  assert.equal(state.settings.sidebarWidth, 420);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).settings, {
    sidebarWidth: 420,
    ignore: [],
  });
});

test("reset restores preferences and preserves open and recently closed tabs", () => {
  let state = db.apply(empty, { op: "open", root: "/tmp/a" });
  state = db.apply(state, { op: "open", root: "/tmp/b" });
  state = db.apply(state, { op: "close", id: state.activeTab });
  state = db.apply(state, {
    op: "settings",
    settings: { ignore: [], theme: "dark", sidebarWidth: 500 },
  });
  const reset = db.apply(state, { op: "reset-settings" });
  assert.deepEqual(reset.settings, db.defaults);
  assert.deepEqual(reset.tabs, state.tabs);
  assert.deepEqual(reset.recent, state.recent);
  assert.equal(reset.activeTab, state.activeTab);
});

test("moves a corrupt database aside and starts clean", async () => {
  await writeFile(file, "{ this is not json");
  assert.deepEqual((await db.read()).tabs, []);
  assert.ok(await stat(`${file}.corrupt`));
});

test("serializes concurrent writes and advances the revision", async () => {
  const write = (id) =>
    db.write({ activeTab: id, tabs: [{ id, root: `/tmp/${id}` }] });
  await Promise.all([write("a"), write("b"), write("c")]);
  const state = await db.read();
  assert.equal(state.activeTab, "c");
  assert.equal(state.revision, 3);
});

test("open creates a tab every time unless asked to focus one", () => {
  const first = db.apply(empty, { op: "open", root: "/tmp/workspace" });
  assert.equal(first.tabs.length, 1);
  assert.deepEqual(first.tabs[0].repos, {});
  assert.equal(first.tabs[0].selection, undefined);
  assert.equal(first.activeTab, first.tabs[0].id);
  const second = db.apply(first, { op: "open", root: "/tmp/workspace" });
  assert.equal(second.tabs.length, 2);
  assert.notEqual(second.tabs[0].id, second.tabs[1].id);
  const focused = db.apply(second, {
    op: "open",
    root: "/tmp/workspace",
    focus: true,
  });
  assert.equal(focused.tabs.length, 2);
  assert.equal(focused.activeTab, second.tabs[0].id);
  assert.throws(() => db.apply(empty, { op: "open", root: "relative" }));
});

test("duplicate copies the settings and lands beside its source", () => {
  const state = db.apply(
    {
      ...empty,
      tabs: [
        {
          id: "a",
          root: "/tmp/a",
          repos: { "/tmp/a/one": { base: "main" } },
        },
        { id: "b", root: "/tmp/b", repos: {} },
      ],
      activeTab: "a",
    },
    { op: "duplicate", id: "a" },
  );
  assert.deepEqual(
    state.tabs.map((tab) => tab.root),
    ["/tmp/a", "/tmp/a", "/tmp/b"],
  );
  assert.equal(state.tabs[1].selection, undefined);
  assert.deepEqual(state.tabs[1].repos, { "/tmp/a/one": { base: "main" } });
  assert.equal(state.activeTab, state.tabs[1].id);
});

test("close remembers the tab so reopen can restore it", () => {
  const opened = db.apply(empty, { op: "open", root: "/tmp/a" });
  const id = opened.activeTab;
  const closed = db.apply(opened, { op: "close", id });
  assert.deepEqual(closed.tabs, []);
  assert.equal(closed.activeTab, null);
  assert.equal(closed.recent[0].id, id);
  const reopened = db.apply(closed, { op: "reopen" });
  assert.equal(reopened.tabs[0].id, id);
  assert.deepEqual(reopened.recent, []);
  assert.deepEqual(db.apply(reopened, { op: "reopen" }), reopened);
});

test("a tab command merges repositories instead of replacing them", () => {
  const start = {
    ...empty,
    activeTab: "a",
    tabs: [
      {
        id: "a",
        root: "/tmp/a",
        repos: {
          "/tmp/a/one": { base: "main" },
          "/tmp/a/two": { target: "release" },
        },
      },
    ],
  };
  const state = db.apply(start, {
    op: "tab",
    id: "a",
    selection: "all",
    repos: { "/tmp/a/two": { selected: false } },
  });
  assert.deepEqual(state.tabs[0].repos, {
    "/tmp/a/one": { base: "main" },
  });
  assert.equal(state.tabs[0].selection, undefined);
  const cleared = db.apply(state, {
    op: "tab",
    id: "a",
    repos: { "/tmp/a/one": {} },
  });
  assert.deepEqual(cleared.tabs[0].repos, {});
});

test("rejects an unknown command", () => {
  assert.throws(() => db.apply(empty, { op: "drop" }), /Unknown command/);
});

test("persists uncommitted scope and retains its hidden base when duplicating and reopening", () => {
  let state = db.apply(empty, { op: "open", root: "/tmp/local" });
  state = db.apply(state, {
    op: "tab",
    id: state.activeTab,
    repos: {
      "/tmp/local/repo": {
        base: "release",
        target: "@uncommitted",
        selected: true,
      },
    },
  });
  state = db.sanitize(
    db.apply(state, { op: "duplicate", id: state.activeTab }),
  );
  const repos = state.tabs[0].repos;
  assert.deepEqual(state.tabs[1].repos, repos);
  state = db.apply(state, { op: "close", id: state.activeTab });
  state = db.sanitize(db.apply(state, { op: "reopen" }));
  assert.deepEqual(state.tabs.at(-1).repos, repos);
});

test("version 4 migration preserves explicit selections in open and closed tabs", () => {
  const tabs = ["changed", "all", "none"].map((selection) => ({
    id: selection,
    root: `/tmp/${selection}`,
    selection,
    repos: {
      [`/tmp/${selection}/one`]: { selected: true, base: "main" },
      [`/tmp/${selection}/two`]: { selected: false, target: "release" },
      [`/tmp/${selection}/three`]: { selected: false },
    },
  }));
  const state = db.sanitize({
    version: 4,
    tabs: tabs.slice(0, 2),
    recent: tabs.slice(2),
  });
  for (const tab of [...state.tabs, ...state.recent]) {
    assert.equal(tab.selection, undefined);
    assert.deepEqual(tab.repos, {
      [`${tab.root}/one`]: { selected: true, base: "main" },
      [`${tab.root}/two`]: { target: "release" },
    });
  }
  assert.deepEqual(db.sanitize(state), state);
});

test("a custom tab name survives a round trip and resets to nothing", () => {
  let state = db.apply(empty, { op: "open", root: "/tmp/a" });
  const id = state.activeTab;
  state = db.apply(state, { op: "rename", id, name: "  API   migration\n" });
  assert.equal(db.sanitize(state).tabs[0].name, "API migration");
  const duplicated = db.apply(state, { op: "duplicate", id });
  assert.equal(duplicated.tabs[1].name, "API migration");
  const cleared = db.sanitize(db.apply(state, { op: "rename", id, name: " " }));
  assert.equal("name" in cleared.tabs[0], false);
  const long = db.sanitize(
    db.apply(state, { op: "rename", id, name: "n".repeat(120) }),
  );
  assert.equal(long.tabs[0].name.length, 64);
});

test("moving a tab reorders the list and ignores positions outside it", () => {
  const order = (state) => state.tabs.map((tab) => tab.root).join(" ");
  const start = {
    ...empty,
    activeTab: "a",
    tabs: ["a", "b", "c"].map((id) => ({ id, root: `/tmp/${id}`, repos: {} })),
  };
  assert.equal(
    order(db.apply(start, { op: "move", id: "c", index: 0 })),
    "/tmp/c /tmp/a /tmp/b",
  );
  assert.equal(
    order(db.apply(start, { op: "move", id: "a", index: 9 })),
    "/tmp/b /tmp/c /tmp/a",
  );
  assert.equal(
    order(db.apply(start, { op: "move", id: "b", index: -4 })),
    "/tmp/b /tmp/a /tmp/c",
  );
  assert.deepEqual(db.apply(start, { op: "move", id: "b", index: 1 }), start);
  assert.deepEqual(
    db.apply(start, { op: "move", id: "missing", index: 0 }),
    start,
  );
});
