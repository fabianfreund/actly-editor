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

    const update = () => {
      if (anchorRef.current) {
        setRect(anchorRef.current.getBoundingClientRect());
      }
      frameRef.current = requestAnimationFrame(update);
    };
    frameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameRef.current);
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
