import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode !== "development" && VitePWA({
      registerType: "prompt",
      injectRegister: false,
      workbox: {
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/functions\//],
        runtimeCaching: [
          {
            // Supabase API — network only, never cache
            urlPattern: /^https:\/\/.*supabase\.co\/rest\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // Supabase Auth — network only
            urlPattern: /^https:\/\/.*supabase\.co\/auth\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // Supabase Edge Functions — network only
            urlPattern: /^https:\/\/.*supabase\.co\/functions\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // Supabase Storage (product images, logos) — cache first with 7-day expiry
            urlPattern: /^https:\/\/.*supabase\.co\/storage\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "AnthoSystem",
        short_name: "AnthoSystem",
        description: "Sistema completo para supermercados",
        theme_color: "#16a34a",
        background_color: "#09090b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-tooltip"],
          charts: ["recharts"],
          query: ["@tanstack/react-query"],
          motion: ["framer-motion"],
        },
      },
    },
    target: "esnext",
    minify: "esbuild",
  },
}));
