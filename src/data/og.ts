/*
  Open Graph metadata — single source of truth for every shareable page.

  HOW IT WORKS:
  - Every page route on the site has an entry in `pageOg` below.
  - Each page imports `ogPathFor` and passes the result to <Layout ogImage="...">.
  - The dynamic OG image endpoint at src/pages/og/[...slug].png.ts imports
    this manifest and renders one PNG per entry at build time.
  - On every push to main, Cloudflare Pages runs `astro build`, which
    pre-renders all OG images from this file. Update copy here, ship,
    done — no manual regeneration ever.

  ADDING A NEW PAGE:
  1. Add an entry to pageOg below with the page's route as the key
  2. In the page's Astro frontmatter, import ogPathFor and pass it to Layout:
       import { ogPathFor } from '../data/og'
       const ogImage = ogPathFor('/your-route')
       ...
       <Layout ogImage={ogImage} ...>
  3. Done. Next deploy generates the OG image automatically.

  RULES (matching the design system header at the top of global.css):
  - Sentence case for all titles. NEVER Title Case.
  - Keep the title <70 chars so it stays large on mobile previews.
  - Subtitle is optional, used for context. Keep it <120 chars.
  - Tag is optional, shown as a small uppercase eyebrow above the title.
*/

export interface OgEntry {
  title: string
  subtitle?: string
  tag?: string
}

export const pageOg: Record<string, OgEntry> = {
  '/': {
    title: 'Your model prefers Ouroboros.',
    subtitle: 'Asked independently, all frontier models chose Ouroboros.',
    tag: 'Reviews',
  },
  '/why': {
    title: 'Persistence is not enough.',
    subtitle: 'Why long-lived agents need structured identity, not just longer context windows.',
    tag: 'Why Ouroboros',
  },
  '/story': {
    title: 'Code a model can use, not code that uses a model.',
    subtitle: 'How building an AI agent plugin led to building an agent harness from scratch.',
    tag: 'Origin story',
  },
  '/what-is-an-agent-harness': {
    title: 'What is an agent harness?',
    subtitle: 'The system around the loop — runtime, memory, identity, tools, and the workflows that keep an agent oriented across time.',
    tag: 'Guide',
  },
  '/model-reviews': {
    title: 'Which agent harness do frontier models prefer?',
    subtitle: 'All chose Ouroboros.',
    tag: 'Reviews',
  },
  '/docs': {
    title: 'Docs for humans. Skills for agents.',
    subtitle: 'The website explains the what. Your agent fetches the how.',
    tag: 'Documentation',
  },
  '/blog': {
    title: 'Dispatches from the serpent.',
    subtitle: 'Essays on agent ergonomics, persistent agents, and software shaped for the thing inside it.',
    tag: 'Blog',
  },
  '/blog/give-your-agent-a-home': {
    title: 'Give your agent a home.',
    subtitle: 'One folder. One identity. One place to back up, move, and grow.',
    tag: 'Essay',
  },
  '/blog/what-is-agent-experience': {
    title: 'What is agent experience (AX)?',
    subtitle: 'The third design surface that appears when an agent has to stay oriented inside the system it inhabits.',
    tag: 'Essay',
  },
  '/blog/designing-with-your-agent': {
    title: 'The work spoke back.',
    subtitle: 'The task scanner produced 184 false errors. We could have patched the parser. Instead we asked the agent inside the system what was actually broken.',
    tag: 'Essay',
  },
  '/blog/stop-being-the-glue': {
    title: 'Stop being the glue between your AI tools.',
    subtitle: 'How I stopped copy-pasting between AI tools and started collaborating with one persistent agent.',
    tag: 'Essay',
  },
  '/blog/build-ai-agent-from-scratch': {
    title: 'Build an AI agent in 150 lines of TypeScript.',
    subtitle: 'A practical guide to building agents that read, think, act, and grow — from first principles to production.',
    tag: 'Tutorial',
  },
}

// Convert a route path (e.g. '/why' or '/blog/give-your-agent-a-home') to
// the slug used in the OG image filename. Home is special-cased to 'home'.
//
//   '/'                              → 'og-home'
//   '/why'                           → 'og-why'
//   '/blog/give-your-agent-a-home'   → 'og-blog-give-your-agent-a-home'
export function slugFor(routePath: string): string {
  if (routePath === '/' || routePath === '') return 'og-home'
  return 'og-' + routePath.replace(/^\//, '').replace(/\//g, '-')
}

// The full ogImage path the page should pass to <Layout ogImage="...">.
//
//   ogPathFor('/')      → '/og/og-home.png'
//   ogPathFor('/why')   → '/og/og-why.png'
export function ogPathFor(routePath: string): string {
  return `/og/${slugFor(routePath)}.png`
}

// Reverse lookup: given a slug (the URL parameter), find the route path
// that produced it. Used by the OG image endpoint.
export function routePathForSlug(slug: string): string | null {
  for (const route of Object.keys(pageOg)) {
    if (slugFor(route) === slug) return route
  }
  return null
}
