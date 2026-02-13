import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";

export default defineConfig({
  plugins: [preact()],
  root: path.resolve(__dirname, "src"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist-renderer"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: [
        "electron",
        "@electron/remote",
        "graceful-fs",
        "form-data",
        "axios",
        "path",
        "fs",
        "os",
        "child_process",
        "node:child_process",
        "@deepnest/svg-preprocessor",
        "@deepnest/calculate-nfp",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/components"),
      "@services": path.resolve(__dirname, "src/services"),
      "@store": path.resolve(__dirname, "src/store"),
      "@utils": path.resolve(__dirname, "src/utils"),
      "@types": path.resolve(__dirname, "src/types"),
    },
  },
  server: {
    // For Electron dev mode
    port: 5173,
  },
});
