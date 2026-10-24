import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

// SINGLEFILE=1 baut eine einzelne HTML-Datei (Demo-Vorschau, ohne App-Installation).
// Normaler Build: installierbare Web-App (PWA) mit Offline-Hülle.
export default defineConfig({
  plugins: process.env.SINGLEFILE
    ? [react(), viteSingleFile()]
    : [
        react(),
        VitePWA({
          registerType: "autoUpdate",
          includeAssets: ["favicon.svg", "apple-touch-icon.png"],
          manifest: {
            name: "PaceMeet",
            short_name: "PaceMeet",
            description: "Gemeinsam statt allein: Leute in deiner Nähe zum Laufen und Radfahren finden.",
            lang: "de",
            start_url: "/",
            scope: "/",
            display: "standalone",
            orientation: "portrait",
            theme_color: "#eb4221",
            background_color: "#f3f4f7",
            categories: ["sports", "social", "health"],
            icons: [
              { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
              { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
              { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            ],
          },
          workbox: {
            // Nur die App selbst wird zwischengespeichert. Daten, Karten und Anmeldung kommen immer frisch aus dem Netz.
            globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
            maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
            navigateFallback: "index.html",
            navigateFallbackDenylist: [/^\/auth/],
            // Push-Nachrichten anzeigen (siehe public/push-sw.js)
            importScripts: ["push-sw.js"],
          },
        }),
      ],
});
