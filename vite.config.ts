/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serviceWorkerPlugin } from "./scripts/sw-build.mjs";

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  build: {
    // The chunk graph lets the bundle budget check follow imports.
    manifest: true,
    // Two pages, no router: the app and the explainer each get an entry.
    rollupOptions: {
      input: { main: "index.html", how: "how.html" },
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
});
