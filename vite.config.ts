import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// Frontend en mode SPA : le build produit des fichiers statiques (dist/client) servis par
// n'importe quel serveur web ; toutes les données passent par l'API Django (/api).
const DJANGO_URL = process.env.DJANGO_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      spa: { enabled: true },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ],
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: {
    host: "::",
    port: 8080,
    // En développement, /api et l'admin Django sont relayés vers le serveur Django : même origine,
    // donc cookie de session et protection CSRF fonctionnent sans configuration CORS.
    proxy: {
      "/api": { target: DJANGO_URL, changeOrigin: false },
      "/django-admin": { target: DJANGO_URL, changeOrigin: false },
      "/static/admin": { target: DJANGO_URL, changeOrigin: false },
      "/robots.txt": { target: DJANGO_URL, changeOrigin: false },
      "/sitemap.xml": { target: DJANGO_URL, changeOrigin: false },
      "/seo": { target: DJANGO_URL, changeOrigin: false },
    },
  },
});
