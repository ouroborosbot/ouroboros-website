# Baseline Audit

## Environment

- Worktree: `/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix`
- Branch: `slugger/seo-indexing-fix`
- Node: `v22.22.0`
- Dependency install: `npm ci` completed successfully
- Local build: `npm run build` completed successfully on 2026-03-16

## Target Source Files

These files currently hardcode slashless canonical URLs and are in scope for the metadata cleanup:

- `src/pages/docs/index.astro`
- `src/pages/docs/architecture.astro`
- `src/pages/docs/getting-started.astro`
- `src/pages/docs/skills-and-prompts.astro`
- `src/pages/docs/continuity-and-memory.astro`
- `src/pages/docs/bundles-and-psyche.astro`
- `src/pages/story.astro`
- `src/pages/why.astro`
- `src/pages/what-is-an-agent-harness.astro`
- `src/pages/blog/build-ai-agent-from-scratch.astro`
- `src/pages/blog/stop-being-the-glue.astro`
- `src/pages/blog/what-is-agent-experience.astro`

## Live Redirect Baseline

The current production site serves the homepage directly and redirects the targeted slashless routes to trailing-slash URLs:

- `/` -> `200`
- `/docs` -> `307` to `/docs/`
- `/docs/architecture` -> `307` to `/docs/architecture/`
- `/docs/getting-started` -> `307` to `/docs/getting-started/`
- `/story` -> `307` to `/story/`
- `/why` -> `307` to `/why/`
- `/what-is-an-agent-harness` -> `307` to `/what-is-an-agent-harness/`
- `/blog/build-ai-agent-from-scratch` -> `307` to `/blog/build-ai-agent-from-scratch/`
- `/blog/stop-being-the-glue` -> `307` to `/blog/stop-being-the-glue/`
- `/blog/what-is-agent-experience` -> `307` to `/blog/what-is-agent-experience/`

## Sitemap Baseline

Production sitemap entry points are healthy:

- `https://ouroboros.bot/sitemap-index.xml` returns `200` and points to `https://ouroboros.bot/sitemap-0.xml`
- `https://ouroboros.bot/sitemap-0.xml` returns `200` and lists trailing-slash URLs for the in-scope docs, story, why, and blog/article pages

Local build output matches that structure:

- `dist/sitemap-index.xml`
- `dist/sitemap-0.xml`
- Generated trailing-slash HTML routes under `dist/docs/`, `dist/story/`, `dist/why/`, and `dist/blog/`

## Verification Token Baseline

- Repo file: `public/11939a2530214da79d49b3a8908b8c9c.txt`
- Repo contents: `11939a2530214da79d49b3a8908b8c9c`
- Live URL: `https://ouroboros.bot/11939a2530214da79d49b3a8908b8c9c.txt`
- Live response: `200` with the same token content
- Repo-wide search found no in-repo references beyond this task documentation

Current evidence supports treating this file as intentional and preserved pending external dashboard confirmation of whether it is an ownership token, an IndexNow token, or another verification artifact.

## Immediate Execution Notes

- Unit 1a should create a repeatable metadata validation test against `dist/sitemap-index.xml`, `dist/sitemap-0.xml`, and selected generated HTML pages.
- Unit 1b should prefer literal canonical URL updates in page files over shared-layout refactors.
