import type { ReactNode } from "react";

interface FormattedTextProps {
  text: string;
  rootPath?: string | null;
  muted?: boolean;
}

const INLINE_CODE_STYLE: React.CSSProperties = {
  display: "inline-block",
  padding: "0 6px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.07)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.92em",
  lineHeight: 1.5,
};

const PATH_STYLE: React.CSSProperties = {
  ...INLINE_CODE_STYLE,
  color: "var(--text-secondary)",
};

function shortenPath(path: string, rootPath?: string | null): string {
  if (rootPath && path.startsWith(rootPath)) {
    const relative = path.slice(rootPath.length).replace(/^\/+/, "");
    return relative || ".";
  }
  return path.replace(/^\/Users\/[^/]+\//, "~/");
}

function renderInline(text: string, rootPath?: string | null): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|(?:\/Users\/[^\s)]+|~\/[^\s)]+))/g);

  return parts
    .filter(Boolean)
    .map((part, index) => {
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, path] = linkMatch;
        const cleanLabel = label.replace(/^`|`$/g, "");
        return (
          <span key={`link-${index}`} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={INLINE_CODE_STYLE}>{cleanLabel}</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.92em" }}>
              {shortenPath(path, rootPath)}
            </span>
          </span>
        );
      }

      const codeMatch = part.match(/^`([^`]+)`$/);
      if (codeMatch) {
        return (
          <span key={`code-${index}`} style={INLINE_CODE_STYLE}>
            {codeMatch[1]}
          </span>
        );
      }

      if (part.startsWith("/Users/") || part.startsWith("~/")) {
        return (
          <span key={`path-${index}`} style={PATH_STYLE}>
            {shortenPath(part, rootPath)}
          </span>
        );
      }

      return <span key={`text-${index}`}>{part}</span>;
    });
}

export function FormattedText({ text, rootPath }: FormattedTextProps) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, index) => (
        <span key={`line-${index}`}>
          {renderInline(line, rootPath)}
          {index < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}
