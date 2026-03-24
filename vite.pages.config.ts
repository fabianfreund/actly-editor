import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  base: "/actly-editor/",
  root: path.resolve(__dirname, "pages"),
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "dist-pages"),
    emptyOutDir: true,
  },
});
