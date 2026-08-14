import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",

  vite: {
    build: {
      sourcemap: false
    }
  },

  adapter: cloudflare()
});