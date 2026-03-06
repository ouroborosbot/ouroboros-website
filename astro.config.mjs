// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ouroboros.bot',
  integrations: [sitemap()],
  redirects: {
    '/origin': '/blog/build-ai-agent-from-scratch',
  },
  vite: {
    plugins: [tailwindcss()]
  },
});
