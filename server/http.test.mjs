import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/diffx.mjs", import.meta.url));

async function start() {
  const home = await mkdtemp(path.join(os.tmpdir(), "diffx-home-"));
  const workspace = await mkdtemp(path.join(os.tmpdir(), "diffx-ws-"));
  const child = spawn(process.execPath, [cli, workspace, "--no-open"], {
    env: { ...process.env, DIFFX_HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const clean = async () => {
    child.kill();
    await rm(home, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  };
  try {
    const server = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error(`diffx did not start. Output: ${output}`)),
        30000,
      );
      const give = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const found = output.match(/http:\/\/127\.0\.0\.1:(\d+)\/#([a-f0-9]+)/);
        if (!found) return;
        clearTimeout(timer);
        resolve({ port: Number(found[1]), token: found[2] });
      });
      child.stderr.on("data", (chunk) => (output += chunk));
      child.on("error", give);
      child.on("exit", (code) =>
        give(
          new Error(
            `diffx exited with ${code}. Run pnpm build first. Output: ${output}`,
          ),
        ),
      );
    });
    return { ...server, stop: clean };
  } catch (error) {
    await clean();
    throw error;
  }
}
function probe(
  port,
  route,
  { token, headers = {}, method = "GET", body } = {},
) {
  return new Promise((resolve, reject) => {
    const call = request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, text }),
        );
      },
    );
    call.on("error", reject);
    if (body) call.write(body);
    call.end();
  });
}

test("guards the API behind the session token and the browser's origin", async (t) => {
  const server = await start();
  t.after(() => server.stop());
  const { port, token } = server;

  await t.test("refuses a request with no token", async () => {
    assert.equal((await probe(port, "/api/state")).status, 403);
  });
  await t.test("refuses a request with the wrong token", async () => {
    const { status } = await probe(port, "/api/state", { token: "guess" });
    assert.equal(status, 403);
  });
  await t.test("accepts the session token", async () => {
    const { status, text } = await probe(port, "/api/state", { token });
    assert.equal(status, 200);
    assert.equal(JSON.parse(text).version, 2);
  });
  await t.test("refuses a cross-origin request", async () => {
    const { status } = await probe(port, "/api/state", {
      token,
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(status, 403);
  });
  // A rebound DNS name reaches the socket with someone else's Host header.
  await t.test("refuses a request for another host", async () => {
    const { status } = await probe(port, "/api/state", {
      token,
      headers: { Host: "evil.example" },
    });
    assert.equal(status, 403);
  });
  await t.test("accepts POST only for state commands", async () => {
    assert.equal(
      (await probe(port, "/api/diff", { token, method: "POST" })).status,
      405,
    );
    assert.equal(
      (await probe(port, "/api/state", { token, method: "PUT" })).status,
      405,
    );
  });
  await t.test("reports an unknown API route", async () => {
    assert.equal((await probe(port, "/api/nope", { token })).status, 404);
  });
});

test("keeps requests inside the directories it is meant to read", async (t) => {
  const server = await start();
  t.after(() => server.stop());
  const { port, token } = server;

  await t.test("will not serve a file outside the bundle", async () => {
    for (const route of [
      "/../../../../etc/passwd",
      "/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    ])
      assert.notEqual((await probe(port, route)).status, 200);
  });
  await t.test("will not expand context outside the repository", async () => {
    const query = new URLSearchParams({
      repo: os.tmpdir(),
      name: "../../../../etc/passwd",
      oldRef: "0".repeat(40),
      newRef: "@working",
    });
    const { status, text } = await probe(port, `/api/file?${query}`, { token });
    assert.equal(status, 400);
    assert.match(JSON.parse(text).error, /Invalid file path/);
  });
});

test("applies a state command and keeps it", async (t) => {
  const server = await start();
  t.after(() => server.stop());
  const { port, token } = server;
  const { status, text } = await probe(port, "/api/state", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "settings", settings: { layout: "split" } }),
  });
  assert.equal(status, 200);
  assert.equal(JSON.parse(text).settings.layout, "split");
  const after = await probe(port, "/api/state", { token });
  assert.equal(JSON.parse(after.text).settings.layout, "split");
});

test("rejects a command it does not know", async (t) => {
  const server = await start();
  t.after(() => server.stop());
  const { status, text } = await probe(server.port, "/api/state", {
    token: server.token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "drop" }),
  });
  assert.equal(status, 400);
  assert.match(JSON.parse(text).error, /Unknown command/);
});
