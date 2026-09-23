import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// Static marketing site (Phase 12). Separate from the Expo app — shares brand,
// not code. Cheap to host on Cloudflare Pages (same account as the Workers API).
// Set `site` to your real domain before deploy; the sitemap + canonical URLs use it.
export default defineConfig({
  site: "https://tryingtogether.app",
  output: "static",
  integrations: [sitemap()],
});
