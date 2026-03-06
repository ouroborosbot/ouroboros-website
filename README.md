# ouroboros.bot

Marketing site for [Ouroboros](https://github.com/ouroborosbot/ouroboros-agent-harness) — a multi-agent harness for building AI agents that know who they are.

Built with [Astro](https://astro.build), [Tailwind CSS v4](https://tailwindcss.com), and deployed on [Cloudflare Pages](https://pages.cloudflare.com).

## Development

```sh
npm install
npm run dev        # local dev server at localhost:4321
npm run build      # production build to ./dist/
npm run preview    # preview production build locally
```

## Structure

```
src/
  components/      # Nav, Footer
  layouts/         # Base HTML layout
  pages/           # Routes
    index.astro    # Landing page
    blog/          # Articles
  styles/          # Global CSS + Tailwind theme
public/
  images/          # Brand assets (ouroboros snake)
```
