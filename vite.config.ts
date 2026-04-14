import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  base: "/manage/",
  plugins: [react(), tailwindcss()],
  define: {
    // Prefer CI-provided build version (branch+sha/tag) so UI version auto-refreshes on deploy.
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
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  css: {
    modules: {
      localsConvention: "camelCase",
      generateScopedName: "[name]__[local]___[hash:base64:5]",
    },
    preprocessorOptions: {
      scss: {
        additionalData: '@use "@/styles/variables.scss" as *;',
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        manage: path.resolve(__dirname, "manage.html"),
      },
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-i18n": ["i18next", "react-i18next", "goey-toast"],
          "vendor-echarts": ["echarts", "echarts-for-react"],
          "vendor-animation": ["framer-motion", "gsap"],
          "vendor-charts": ["chart.js", "react-chartjs-2"],
          "vendor-markdown": ["react-markdown", "react-syntax-highlighter", "remark-gfm"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
