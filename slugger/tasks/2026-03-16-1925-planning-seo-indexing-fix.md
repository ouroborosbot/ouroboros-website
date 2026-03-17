# Planning: SEO Indexing Fix

**Status**: approved
**Created**: 2026-03-16 21:16

## Goal
Improve crawler-facing consistency and discovery signals for `https://ouroboros.bot/` by aligning canonical metadata with the live trailing-slash routes, auditing the repo-owned indexing artifacts that can be fixed in code, and preparing the exact manual Google/Bing submission steps that still need to happen outside the repo.

## Scope

### In Scope
- Normalize hardcoded canonical URLs and any matching metadata inputs that currently point at slashless URLs while production redirects to trailing-slash routes.
- Verify that the generated sitemap, `robots.txt`, and sampled page metadata agree on the final live URL form for homepage, docs, story, why, and blog/article routes.
- Audit the existing repo-owned verification/indexing artifact at `public/11939a2530214da79d49b3a8908b8c9c.txt` and document what it is being used for today.
- Provide a concrete post-deploy submission checklist for Google Search Console and Bing Webmaster Tools, including the exact sitemap URL already exposed by the site.

### Out of Scope
- Private account setup, ownership verification clicks, or sitemap submission performed inside Google Search Console or Bing Webmaster Tools.
- Content rewrites, backlink work, keyword strategy, or promises about search ranking improvements outside crawl/indexing hygiene.
- Repo workflow documentation, branch/worktree policy changes, or other process changes unrelated to search indexing.
- New analytics, monitoring, or third-party integrations unless the user asks for them separately.

## Completion Criteria
- [ ] All hardcoded canonicals for routes that currently redirect are updated to the final live URL form.
- [ ] Sampled pages emit canonical and matching URL metadata that align with the redirect target and sitemap entries.
- [ ] Repo-owned crawler/indexing artifacts are checked and any repo-fixable inconsistencies are resolved or documented.
- [ ] The final handoff includes an exact Google Search Console and Bing Webmaster checklist for `https://ouroboros.bot/`, including the current sitemap URL.
- [ ] Build-time verification for the changed metadata/pages succeeds.

## Code Coverage Requirements
This task is expected to be mostly metadata and content-configuration work.
- No new executable runtime logic is planned.
- If the implementation stays limited to literal metadata/string updates, build verification is sufficient and no new automated coverage is required.
- If implementation introduces new helper logic or automation code, add focused tests for the new branches and failure paths.

## Open Questions
- None currently.

## Decisions Made
- Treat trailing-slash live URLs as canonical because production returns `307` redirects from slashless routes to trailing-slash routes and the generated sitemap emits trailing-slash URLs.
- Keep the task focused on repo-fixable crawl/indexing hygiene plus user-facing submission instructions, rather than treating general discoverability as something code alone can solve.
- Use the dedicated worktree `/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix` on branch `slugger/seo-indexing-fix`.
- Supersede the abandoned `codex/seo-indexing-fix` planning draft while preserving its useful crawl, redirect, and sitemap findings.

## Context / References
- [/Users/arimendelow/Projects/ouroboros-website-codex-seo-indexing-fix/codex/tasks/2026-03-16-1925-planning-seo-indexing-fix.md](/Users/arimendelow/Projects/ouroboros-website-codex-seo-indexing-fix/codex/tasks/2026-03-16-1925-planning-seo-indexing-fix.md)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/astro.config.mjs](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/astro.config.mjs)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/public/robots.txt](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/public/robots.txt)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/public/11939a2530214da79d49b3a8908b8c9c.txt](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/public/11939a2530214da79d49b3a8908b8c9c.txt)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/layouts/Layout.astro](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/layouts/Layout.astro)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/docs/index.astro](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/docs/index.astro)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/story.astro](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/story.astro)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/why.astro](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/why.astro)
- [/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/what-is-an-agent-harness.astro](/Users/arimendelow/Projects/ouroboros-website-slugger-seo-indexing-fix/src/pages/what-is-an-agent-harness.astro)
- Live checks already observed:
  - `https://ouroboros.bot/robots.txt` allows crawling and points to `https://ouroboros.bot/sitemap-index.xml`
  - `https://ouroboros.bot/sitemap-index.xml` points to `https://ouroboros.bot/sitemap-0.xml`
  - `https://ouroboros.bot/sitemap-0.xml` lists trailing-slash URLs
  - `https://ouroboros.bot/docs` and `https://ouroboros.bot/blog` return `307` to trailing-slash routes
  - Googlebot and Bingbot both receive normal `200` HTML responses from the homepage
  - The site/repo are new enough that delayed indexing is still plausible even if the crawl path is healthy

## Notes
- The canonical mismatch is real cleanup work, but it is likely an indexing-hygiene improvement rather than the sole explanation for the site not appearing in search yet.
- `sitemap.xml` currently returns `404`; the crawlable sitemap entry point is `sitemap-index.xml`, which is the URL already advertised in `robots.txt`.
- The existing `11939a2530214da79d49b3a8908b8c9c.txt` file should be treated as intentional until verified otherwise, since the live site serves it successfully.

## Progress Log
- 2026-03-16 21:16 Replaced the abandoned `codex/` planning draft with a repo-compliant planning doc on `slugger/seo-indexing-fix`.
- 2026-03-16 21:25 Approved for doing-doc conversion.
