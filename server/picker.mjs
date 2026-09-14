import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

const prompt = "Choose a workspace";

function run(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const stop = () => child.kill();
    signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (error) =>
      reject(
        Object.assign(
          new Error(
            error.code === "ENOENT"
              ? `${command} is not available on this system.`
              : error.message,
          ),
          { missing: error.code === "ENOENT" },
        ),
      ),
    );
    child.on("close", (code) => {
      signal?.removeEventListener("abort", stop);
      resolve({
        code,
        out: out.trim(),
        err: err.trim(),
        aborted: !!signal?.aborted,
      });
    });
  });
}
async function directoryOrHome(value) {
  try {
    if (value && (await stat(value)).isDirectory()) return value;
  } catch {
    // Fall through to letting the dialog choose its own starting point.
  }
  return "";
}
async function mac(start, signal) {
  const location = await directoryOrHome(start);
  // Without activating first the dialog opens behind the browser window.
  const script = [
    'tell application "System Events"',
    "activate",
    `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)}${
      location ? ` default location POSIX file ${JSON.stringify(location)}` : ""
    })`,
    "end tell",
  ].join("\n");
  const { code, out, err, aborted } = await run(
    "osascript",
    ["-e", script],
    signal,
  );
  if (code === 0 && out) return { path: out.replace(/\/$/, "") };
  if (aborted || err.includes("-128")) return { canceled: true };
  throw new Error(err || "The folder dialog closed unexpectedly.");
}
async function linux(start, signal) {
  const location = await directoryOrHome(start);
  try {
    const { code, out } = await run(
      "zenity",
      [
        "--file-selection",
        "--directory",
        `--title=${prompt}`,
        ...(location ? [`--filename=${location}/`] : []),
      ],
      signal,
    );
    if (code === 0 && out) return { path: out };
    return { canceled: true };
  } catch (error) {
    if (!error.missing) throw error;
  }
  const { code, out } = await run(
    "kdialog",
    ["--title", prompt, "--getexistingdirectory", location || "."],
    signal,
  );
  if (code === 0 && out) return { path: out };
  return { canceled: true };
}
async function windows(start, signal) {
  const location = await directoryOrHome(start);
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = ${JSON.stringify(prompt)}`,
    ...(location ? [`$dialog.SelectedPath = ${JSON.stringify(location)}`] : []),
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }",
  ].join("; ");
  const { code, out } = await run(
    "powershell",
    ["-NoProfile", "-STA", "-Command", script],
    signal,
  );
  if (code === 0 && out) return { path: out };
  return { canceled: true };
}
export function chooseDirectory(start, signal) {
  if (process.platform === "darwin") return mac(start, signal);
  if (process.platform === "win32") return windows(start, signal);
  return linux(start, signal);
}
