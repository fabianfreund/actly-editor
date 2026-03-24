import { useMemo } from "react";
import { X, Pencil, Eye, Save, RotateCcw, FileText, LoaderCircle } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getFileName } from "../services/projectFiles";
import { useFilePreviewStore } from "../store/filePreview";

const EDITOR_EXTENSIONS = [
  EditorView.lineWrapping,
];

export default function FilePreviewModal() {
  const {
    isOpen,
    path,
    title,
    content,
    savedContent,
    mode,
    isMarkdown,
    loading,
    saving,
    error,
    close,
    setMode,
    setDraft,
    revertDraft,
    save,
  } = useFilePreviewStore();

  const isDirty = content !== savedContent;

  const editorExtensions = useMemo(
    () => (isMarkdown ? [...EDITOR_EXTENSIONS, markdown()] : EDITOR_EXTENSIONS),
    [isMarkdown]
  );

  if (!isOpen || !path) return null;

  const handleClose = () => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    close();
  };

  const handleRevert = () => {
    if (isDirty && !window.confirm("Revert your unsaved edits?")) return;
    revertDraft();
  };

  const handleSave = async () => {
    const ok = await save();
    if (ok && isMarkdown) setMode("preview");
  };

  return (
    <div className="file-preview-backdrop" onClick={handleClose}>
      <div className="file-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="file-preview-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div className="file-preview-icon">
              <FileText size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="file-preview-title">{title ?? getFileName(path)}</div>
              <div className="file-preview-path">{path}</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isMarkdown && (
              <>
                <button
                  className={`btn ${mode === "preview" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setMode("preview")}
                  style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}
                >
                  <Eye size={14} />
                  Preview
                </button>
                <button
                  className={`btn ${mode === "edit" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setMode("edit")}
                  style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}
                >
                  <Pencil size={14} />
                  Edit
                </button>
              </>
            )}
            {!isMarkdown && (
              <span className="badge" style={{ background: "var(--bg-overlay)", color: "var(--text-secondary)" }}>
                Text editor
              </span>
            )}
            <button className="btn btn-ghost" onClick={handleRevert} disabled={!isDirty || saving} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
              <RotateCcw size={14} />
              Revert
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!isDirty || saving || loading} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
              {saving ? <LoaderCircle size={14} className="spin-icon" /> : <Save size={14} />}
              Save
            </button>
            <button className="btn btn-ghost" onClick={handleClose} style={{ padding: "2px 6px" }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {error && <div className="file-preview-error">{error}</div>}

        <div className="file-preview-body">
          {loading ? (
            <div className="file-preview-empty">
              <LoaderCircle size={18} className="spin-icon" />
              Loading file…
            </div>
          ) : mode === "preview" && isMarkdown ? (
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <CodeMirror
              value={content}
              height="100%"
              theme="dark"
              extensions={editorExtensions}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                history: true,
                foldGutter: true,
                autocompletion: false,
              }}
              onChange={(value) => setDraft(value)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
