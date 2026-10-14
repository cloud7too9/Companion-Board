import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Die App läuft unter /dashboard/ – so liefert sie später auch der Board-Server aus (Phase A6).
export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  // Fernseher haben oft einen alten Browser (Chromium ab 69, Safari ab 12): Syntax wie ?. und ?? wird
  // beim Bauen übersetzt. Neue Funktionen (z. B. Object.hasOwn) übersetzt das nicht – die meiden wir im Code.
  build: { target: ["es2018", "chrome69", "safari12", "firefox68"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    // widget-groessen.mjs liegt eine Ebene höher in companion/ (gemeinsam mit dem Server)
    fs: { allow: [path.resolve(__dirname, "..")] },
    // Karten und Live-Änderungen vom Board-Server (npm start in koordinaten-board, Port 3000).
    // Läuft keiner, zeigen die Widgets Beispielkarten.
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
