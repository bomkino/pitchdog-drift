import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Drift.app loads the production bundle from its signed Resources directory.
  // Relative URLs keep the same build valid over both http:// localhost and file://.
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    strictPort: true,
  },
});
