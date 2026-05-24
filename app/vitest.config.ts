import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vite.config.ts because the Tauri-specific server config
// (port 1420, HMR over WS, src-tauri/** ignore) is irrelevant for tests.
// We only need the @/* alias to match the app's import style.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
