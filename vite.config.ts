import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const macosAacShim = fileURLToPath(new URL("./src/lib/macosAacEncoder.ts", import.meta.url));

export default defineConfig(({ mode }) => ({
  // Drift.app loads the production bundle from its signed Resources directory.
  // Relative URLs keep the same build valid over localhost and file://.
  base: "./",
  plugins: [react()],
  resolve: mode === "macos"
    ? {
        // The browser build keeps Mediabunny's reviewed software AAC extension.
        // The standalone app ships no FFmpeg WASM and uses system WebCodecs only.
        alias: {
          "@mediabunny/aac-encoder": macosAacShim,
        },
      }
    : undefined,
  build: {
    target: "es2022",
    // Source maps include dependency source text. Keep them for browser
    // development, but never place the software-codec source inside Drift.app.
    sourcemap: mode !== "macos",
  },
  server: {
    strictPort: true,
  },
}));
