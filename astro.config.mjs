import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  vite: {
    build: {
      sourcemap: false
    }
  },

  adapter: cloudflare()
});