import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests: `npm test` (watch) · `npm run test:coverage` (one run + report).
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify("test") },
  resolve: {
    alias: {
      // The PWA plugin's virtual module only exists in a real Vite build.
      "virtual:pwa-register/react": new URL("./src/test/pwaRegister.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "supabase/**/*.test.ts"],
    env: { TZ: "Europe/London" },
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Everything in the app, plus the server helpers the Edge Function uses.
      // (The Edge Function's own index.ts is Deno-only and isn't run here.)
      include: ["src/**/*.{ts,tsx}", "supabase/functions/_shared/**/*.ts"],
      exclude: ["**/*.test.*", "src/test/**", "src/**/*.d.ts"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
