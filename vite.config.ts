import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite resolves root-relative replacements from the project root. Keeping this
// as a plain string avoids adding Node type packages solely for one config path.
const macosAacShim = "/src/lib/macosAacEncoder.ts";

export default defineConfig(({ mode }) => ({
  // Drift.app loads the production bundle from its signed Resources directory.
  // Relative URLs keep the same build valid over localhost and file://.
  base: "./",
  plugins: [react()],
  define: {
    __DRIFT_BUILD_CHANNEL__: JSON.stringify(mode === "v2-dev" ? "v2-dev" : "release"),
  },
  resolve: mode === "macos"
    ? {
        alias: {
          "@mediabunny/aac-encoder": macosAacShim,
        },
      }
    : undefined,
  ssr: mode === "linux-fixture" ? { noExternal: true } : undefined,
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
