import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TaskTemplate } from "../registries/tasks.registry";

interface TaskTemplateSuggestionsProps {
  query: string;
  templates: TaskTemplate[];
  selectedIndex: number;
  onSelect: (template: TaskTemplate) => void;
  anchorRef: React.RefObject<HTMLInputElement | null>;
}

export default function TaskTemplateSuggestions({
  query,
  templates,
  selectedIndex,
  onSelect,
  anchorRef,
}: TaskTemplateSuggestionsProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const frameRef = useRef<number>(0);

  const filtered = templates.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  const visible = query.trim().length > 0 && filtered.length > 0;

  useEffect(() => {
    if (!visible) return;

    const prevRectRef = { current: rect };

    const rectsEqual = (a: DOMRect, b: DOMRect) =>
      a.top === b.top &&
      a.left === b.left &&
      a.bottom === b.bottom &&
      a.right === b.right &&
      a.width === b.width &&
      a.height === b.height;

    const updateRect = () => {
      const anchorEl = anchorRef.current;
      if (!anchorEl) return;
      const newRect = anchorEl.getBoundingClientRect();
      if (!prevRectRef.current || !rectsEqual(prevRectRef.current, newRect)) {
        prevRectRef.current = newRect;
        setRect(newRect);
      }
    };

    const onScrollOrResize = () => updateRect();

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    updateRect();

    let observer: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    if (anchorRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateRect);
      observer.observe(anchorRef.current);
    }

    if (anchorRef.current && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(updateRect);
      mutationObserver.observe(anchorRef.current, { attributes: true, childList: true, subtree: true });
    }

    // Fallback RAF loop if no observer is available (and deprecated for perf)
    if (!observer && !mutationObserver) {
      const poll = () => {
        updateRect();
        frameRef.current = requestAnimationFrame(poll);
      };
      frameRef.current = requestAnimationFrame(poll);
    }

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (observer) observer.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [visible, anchorRef]);

  if (!visible || !rect) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        overflow: "hidden",
      }}
    >
      {filtered.map((template, i) => (
        <div
          key={template.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(template)}
          style={{
            padding: "7px 10px",
            cursor: "pointer",
            background: i === selectedIndex ? "var(--bg-active)" : "transparent",
            borderLeft: i === selectedIndex ? "2px solid var(--accent)" : "2px solid transparent",
            borderBottom: i < filtered.length - 1 ? "1px solid var(--border-default)" : "none",
          }}
        >
          <div
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--text-primary)",
              marginBottom: 2,
            }}
          >
            {template.title}
          </div>
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {template.description.split("\n")[0]}
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}
