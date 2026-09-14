#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { scan, diff, fileContents } from "../server/git.mjs";
import { chooseDirectory } from "../server/picker.mjs";
import * as db from "../server/db.mjs";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: polydiff [directory] [--no-open]\n\nBrowse changes across local Git repositories and worktrees.",
  );
  process.exit(0);
}
const unknown = args.find((arg) => arg.startsWith("-") && arg !== "--no-open");
if (unknown) {
  console.error(`Unknown option: ${unknown}`);
  process.exit(1);
}
const requestedRoot = args.find((arg) => !arg.startsWith("-"));
const initialRoot = path.resolve(requestedRoot || process.cwd());
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
try {
  await stat(path.join(dist, "index.html"));
} catch {
  console.error("Build the app first with pnpm build.");
  process.exit(1);
}
const startRoot = await realpath(initialRoot).catch(() => initialRoot);
if (requestedRoot || !(await db.read()).tabs.length)
  await db.send({ op: "open", root: startRoot, focus: true });
const token = randomBytes(24).toString("hex");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
let origin;
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}
const server = createServer(async (req, res) => {
  const json = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    )
      return json(403, { error: "Forbidden origin." });
    const url = new URL(req.url, origin);
    if (
      req.method !== "GET" &&
      !(req.method === "POST" && url.pathname === "/api/state")
    )
      return json(405, { error: "Unsupported method." });
    if (url.pathname.startsWith("/api/")) {
      if (req.headers.authorization !== `Bearer ${token}`)
        return json(403, {
          error: "Invalid session. Open the URL printed by polydiff.",
        });
      if (url.pathname === "/api/workspace") {
        const input = url.searchParams.get("path") || initialRoot;
        const expanded =
          input === "~"
            ? os.homedir()
            : input.startsWith("~/")
              ? path.join(os.homedir(), input.slice(2))
              : input;
        const { settings } = await db.read();
        return json(
          200,
          await scan(await realpath(path.resolve(expanded)), {
            depth: settings.scanDepth,
            budget: settings.scanBudget,
            ignore: settings.ignore,
          }),
        );
      }
      if (url.pathname === "/api/diff") {
        const repo = await realpath(
          url.searchParams.get("repo") || initialRoot,
        );
        return json(
          200,
          await diff(
            repo,
            url.searchParams.get("base") || "HEAD",
            url.searchParams.get("target") || "@working",
          ),
        );
      }
      if (url.pathname === "/api/file") {
        const params = Object.fromEntries(url.searchParams);
        return json(200, await fileContents(params.repo, params));
      }
      if (url.pathname === "/api/state")
        return json(
          200,
          req.method === "POST"
            ? await db.send(await readBody(req))
            : await db.read(),
        );
      if (url.pathname === "/api/choose-directory") {
        const controller = new AbortController();
        req.on("close", () => controller.abort());
        const chosen = await chooseDirectory(
          url.searchParams.get("path") || startRoot,
          controller.signal,
        );
        return json(
          200,
          chosen.path ? { path: await realpath(chosen.path) } : chosen,
        );
      }
      return json(404, { error: "Not found." });
    }
    const relative =
      decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(dist, relative);
    if (!file.startsWith(dist)) return json(403, { error: "Forbidden path." });
    const contents = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(contents);
  } catch (error) {
    json(error.code === "ENOENT" ? 404 : 400, { error: error.message });
  }
});
server.listen(0, "127.0.0.1", () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}/#${token}`;
  console.log(`polydiff · ${initialRoot}\n${url}\nPress Ctrl+C to stop.`);
  if (!args.includes("--no-open")) {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer.exe"
          : "xdg-open";
    const child = spawn(command, [url], { stdio: "ignore" });
    child.on("error", () => console.log("Open the URL above in your browser."));
    child.unref();
  }
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
