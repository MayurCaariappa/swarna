import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  define: {
    // The version shown in the app comes from package.json ("version").
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    // Start downloading Manrope with the page itself (not after the CSS asks for
    // it), so the first paint already uses it — no font flash on refresh.
    {
      name: "preload-manrope",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(_html, ctx) {
          const font = Object.keys(ctx.bundle ?? {}).find((f) =>
            /manrope-latin-wght-normal.*\.woff2$/.test(f),
          );
          return font
            ? [
                {
                  tag: "link",
                  attrs: {
                    rel: "preload",
                    href: `/${font}`,
                    as: "font",
                    type: "font/woff2",
                    crossorigin: "",
                  },
                  injectTo: "head-prepend",
                },
              ]
            : [];
        },
      },
    },
    VitePWA({
      // Our own service worker (src/sw.ts) so we can add Web Push handlers to it later.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // 'prompt' = don't silently swap versions; show "New version available" instead.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon-180x180.png",
        "logo.svg",
      ],
      manifest: {
        name: "Swarna",
        short_name: "Swarna",
        description: "A private period & pill tracker for two.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
      },
      devOptions: { enabled: false },
    }),
  ],
});
