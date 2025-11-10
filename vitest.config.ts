import { defineConfig } from "vitest/config";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom", // Changed from "node" to "jsdom" for React testing
    setupFiles: ["./vitest.setup.ts"], // Setup file for jsdom initialization
    env: {
      // Load test environment variables
      USE_REAL_SUPABASE: "true",
    },
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    include: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "dist", ".opencode", ".opencode/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        ".next/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
      "@/src": resolve(__dirname, "./src"),
      "@/components": resolve(__dirname, "./src/components"),
      "@/hooks": resolve(__dirname, "./src/hooks"),
    },
  },
});

