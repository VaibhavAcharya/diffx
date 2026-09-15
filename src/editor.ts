export const editors = [
  { value: "vscode", label: "VS Code" },
  { value: "cursor", label: "Cursor" },
  { value: "windsurf", label: "Windsurf" },
  { value: "zed", label: "Zed" },
  { value: "jetbrains", label: "JetBrains IDEs" },
  { value: "sublime", label: "Sublime Text" },
] as const;
export type EditorName = (typeof editors)[number]["value"] | "none";

export function joinPath(directory: string, name: string) {
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory}${separator}${name.split("/").join(separator)}`;
}
// Editors open files through their own URL scheme, so the browser hands the
// path over and nothing runs on the server.
export function editorUrl(editor: EditorName, file: string, line: number) {
  const absolute = file.replace(/\\/g, "/");
  const encoded = encodeURI(
    absolute.startsWith("/") ? absolute : `/${absolute}`,
  );
  if (editor === "jetbrains")
    return `jetbrains://idea/navigate/reference?path=${encodeURIComponent(absolute)}:${line}`;
  if (editor === "sublime")
    return `subl://open?url=file://${encoded}&line=${line}`;
  return `${editor}://file${encoded}:${line}`;
}
