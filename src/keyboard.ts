import { useEffect, useRef } from "react";

// Single-key shortcuts stay out of the way while someone is typing, and only
// the workspace in front of you listens for them.
export function useKeyboard(
  enabled: boolean,
  handler: (event: KeyboardEvent) => void,
) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const listen = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable='true']," +
            "[role='dialog'], [role='menu'], [role='listbox']",
        )
      )
        return;
      latest.current(event);
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [enabled]);
}
export const shortcuts = [
  { keys: "j / k", action: "Next or previous file" },
  { keys: "n / p", action: "Next or previous hunk" },
  { keys: "o", action: "Expand or fold the current file" },
  { keys: "e", action: "Expand or fold every file" },
  { keys: "r", action: "Mark the current file reviewed" },
  { keys: "f", action: "Search inside the diffs" },
  { keys: "/", action: "Filter repositories and files" },
  { keys: "Shift + R", action: "Rescan and reload now" },
  { keys: "[ / ]", action: "Previous or next tab" },
  { keys: "Alt + Shift + ← / →", action: "Move the current tab" },
  { keys: "?", action: "Show this list" },
];
