import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // SPA mode: the app has no server functions, so it builds to static files plus a
  // shell page that static hosts (Netlify/Vercel) serve for every route.
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
});
