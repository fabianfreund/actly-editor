import { useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";

export default function LivePreview() {
  const [url, setUrl] = useState("http://localhost:3000");
  const [editingUrl, setEditingUrl] = useState(false);
  const [draftUrl, setDraftUrl] = useState(url);
  const [key, setKey] = useState(0); // increment to force iframe reload

  const handleRefresh = () => setKey((k) => k + 1);

  const handleUrlSubmit = () => {
    setUrl(draftUrl);
    setEditingUrl(false);
    setKey((k) => k + 1);
  };

  return (
    <div className="panel-full">
      <div className="panel-header">
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {editingUrl ? (
            <input
              autoFocus
              className="input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlSubmit();
                if (e.key === "Escape") setEditingUrl(false);
              }}
              style={{ width: 200, padding: "2px 6px", fontSize: "var(--font-size-xs)" }}
            />
          ) : (
            <button
              className="btn btn-ghost"
              style={{ fontSize: "var(--font-size-xs)", padding: "2px 6px" }}
              onClick={() => {
                setDraftUrl(url);
                setEditingUrl(true);
              }}
            >
              {url}
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleRefresh} style={{ padding: "2px 6px" }} title="Refresh">
            <RefreshCw size={12} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            style={{ padding: "2px 6px" }}
            title="Open in browser"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <iframe
          key={key}
          src={url}
          style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
          title="Live Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
