import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// All Node / Electron modules that must stay external (not bundled by Vite)
const electronExternals = [
  "electron",
  "@electron/remote",
  "graceful-fs",
  "form-data",
  "axios",
  "marked",
  "path",
  "fs",
  "os",
  "url",
  "child_process",
  "node:path",
  "node:fs",
  "node:os",
  "node:url",
  "node:child_process",
  "@deepnest/svg-preprocessor",
  "@deepnest/svg-preprocessor-win32-x64-msvc",
  "@deepnest/calculate-nfp",
];

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  root: path.resolve(__dirname, "src"),
  base: "./",
  optimizeDeps: {
    // Native modules and Electron-only packages must not be optimized for browser dev server.
    exclude: electronExternals,
  },
  build: {
    outDir: path.resolve(__dirname, "dist-renderer"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: electronExternals,
      output: {
        // Keep require() calls for CJS-only Electron modules
        format: "es",
      },
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
    port: 5173,
  },
});
