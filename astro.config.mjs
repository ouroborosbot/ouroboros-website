// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ouroboros.bot',
  redirects: {
    '/origin': '/blog/build-ai-agent-from-scratch',
  },
  vite: {
    plugins: [tailwindcss()]
  },
});
