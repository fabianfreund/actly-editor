import { AlertTriangle } from "lucide-react";

interface Props {
  label?: string;
}

export default function InDevelopmentBanner({ label = "This screen is still in development and not fully implemented yet." }: Props) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid rgba(204, 167, 0, 0.35)",
        background:
          "linear-gradient(90deg, rgba(204, 167, 0, 0.18) 0%, rgba(204, 167, 0, 0.08) 100%)",
        color: "#f5d76e",
        fontSize: "var(--font-size-sm)",
      }}
    >
      <AlertTriangle size={14} />
      <span>{label}</span>
    </div>
  );
}
