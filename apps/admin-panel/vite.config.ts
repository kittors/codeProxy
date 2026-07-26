import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { panelMetadataPlugin } from "../../tooling/vite-plugins/panelMetadata";

const packagesDir = path.resolve(__dirname, "..", "..", "packages");

export default defineConfig({
  base: "/manage/",
  plugins: [react(), tailwindcss(), panelMetadataPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VITE_APP_VERSION ??
        process.env.APP_VERSION ??
        process.env.npm_package_version ??
        "dev",
    ),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "../../pages/**/*.test.{ts,tsx}",
      "../../features/**/*.test.{ts,tsx}",
      "../../packages/**/*.test.{ts,tsx}",
    ],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    testTimeout: 10_000,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: /^@app\/(.+)$/, replacement: path.resolve(__dirname, "src", "app") + "/$1" },
      { find: /^@pages\/(.+)$/, replacement: path.resolve(__dirname, "..", "..", "pages") + "/$1" },
      {
        find: /^@features\/(.+)$/,
        replacement: path.resolve(__dirname, "..", "..", "features") + "/$1",
      },
      {
        find: /^@code-proxy\/(ui|api-client|domain|assets|i18n)$/,
        replacement: packagesDir + "/$1/src/index.ts",
      },
      {
        find: /^@code-proxy\/(ui|api-client|domain)\/(.+)$/,
        replacement: packagesDir + "/$1/src/$2",
      },
      {
        find: /^@code-proxy\/assets\/(.+)$/,
        replacement: packagesDir + "/assets/src/$1",
      },
    ],
  },
  server: {
    proxy: {
      "/v0": "http://localhost:8317",
      "/v1": "http://localhost:8317",
      "/v1beta": "http://localhost:8317",
    },
    port: 5173,
  },
  build: {
    outDir: path.resolve(__dirname, "..", "..", "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        manage: path.resolve(__dirname, "manage.html"),
      },
      output: {
        // Function form so Rollup keeps its helper modules (e.g. the preload helper)
        // in the entry chunk. The object form pinned the helper into vendor-markdown,
        // which forced every page load to eagerly download the ~780 KB markdown bundle
        // even though all markdown consumers are lazy-loaded.
        manualChunks: (id: string) => {
          // Pin Vite's preload helper next to the always-preloaded react vendor
          // chunk; left to auto-placement it can land in a heavy lazy chunk and
          // drag it into every page's modulepreload list.
          if (id.includes("vite/preload-helper")) return "vendor-react";
          if (!id.includes("node_modules")) return undefined;
          const match = (...packages: string[]) =>
            packages.some((name) => id.includes(`/node_modules/${name}/`));
          if (match("react", "react-dom", "scheduler", "react-router", "react-router-dom")) {
            return "vendor-react";
          }
          if (match("i18next", "react-i18next", "goey-toast")) return "vendor-i18n";
          if (match("echarts", "echarts-for-react", "zrender")) return "vendor-echarts";
          if (match("framer-motion")) return "vendor-animation";
          if (match("react-markdown", "react-syntax-highlighter", "remark-gfm")) {
            return "vendor-markdown";
          }
          if (match("@radix-ui/react-dropdown-menu")) return "vendor-radix-dropdown";
          return undefined;
        },
      },
    },
  },
});
