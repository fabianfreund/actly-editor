import { create } from "zustand";
import { isMarkdownFile, readProjectFile, writeProjectFile } from "../services/projectFiles";

export type FilePreviewMode = "preview" | "edit";

interface FilePreviewState {
  isOpen: boolean;
  path: string | null;
  title: string | null;
  content: string;
  savedContent: string;
  mode: FilePreviewMode;
  isMarkdown: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  openFile: (path: string, title?: string | null) => Promise<void>;
  close: () => void;
  setMode: (mode: FilePreviewMode) => void;
  setDraft: (content: string) => void;
  reload: () => Promise<void>;
  revertDraft: () => void;
  save: () => Promise<boolean>;
}

const DEFAULT_STATE = {
  isOpen: false,
  path: null,
  title: null,
  content: "",
  savedContent: "",
  mode: "preview" as FilePreviewMode,
  isMarkdown: false,
  loading: false,
  saving: false,
  error: null as string | null,
};

export const useFilePreviewStore = create<FilePreviewState>((set, get) => ({
  ...DEFAULT_STATE,

  openFile: async (path, title) => {
    const markdown = isMarkdownFile(path);
    set({
      isOpen: true,
      path,
      title: title ?? null,
      mode: markdown ? "preview" : "edit",
      isMarkdown: markdown,
      loading: true,
      saving: false,
      error: null,
    });

    try {
      const content = await readProjectFile(path);
      set({
        content,
        savedContent: content,
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        content: "",
        savedContent: "",
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  close: () => set({ ...DEFAULT_STATE }),

  setMode: (mode) => set({ mode }),

  setDraft: (content) => set({ content }),

  reload: async () => {
    const path = get().path;
    if (!path) return;

    set({ loading: true, error: null });
    try {
      const content = await readProjectFile(path);
      set({ content, savedContent: content, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  revertDraft: () => {
    const { savedContent, isMarkdown } = get();
    set({ content: savedContent, mode: isMarkdown ? "preview" : "edit", error: null });
  },

  save: async () => {
    const { path, content } = get();
    if (!path) return false;

    set({ saving: true, error: null });
    try {
      await writeProjectFile(path, content);
      set({ savedContent: content, saving: false, error: null });
      return true;
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  },
}));
