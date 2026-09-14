import { useRef, useState, type ReactNode } from "react";

export function ResizableSidebar({
  width,
  onResize,
  children,
}: {
  width: number;
  onResize: (width: number) => void;
  children: ReactNode;
}) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ x: number; width: number; current: number } | null>(
    null,
  );
  const clamp = (value: number) =>
    Math.max(220, Math.min(640, window.innerWidth - 360, value));
  return (
    <div className="desktop-sidebar" style={{ width: dragWidth ?? width }}>
      {children}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="Sidebar width"
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={640}
        aria-valuenow={dragWidth ?? width}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const actual =
            event.currentTarget.parentElement!.getBoundingClientRect().width;
          drag.current = { x: event.clientX, width: actual, current: actual };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const next = clamp(
            drag.current.width + event.clientX - drag.current.x,
          );
          drag.current.current = next;
          setDragWidth(next);
        }}
        onPointerUp={(event) => {
          if (!drag.current) return;
          onResize(drag.current.current);
          drag.current = null;
          setDragWidth(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragWidth(null);
        }}
        onKeyDown={(event) => {
          const current =
            event.currentTarget.parentElement!.getBoundingClientRect().width;
          const sizes: Record<string, number> = {
            ArrowLeft: current - 20,
            ArrowRight: current + 20,
            Home: 220,
            End: 640,
          };
          const next = sizes[event.key];
          if (next === undefined) return;
          event.preventDefault();
          onResize(clamp(next));
        }}
      />
    </div>
  );
}
