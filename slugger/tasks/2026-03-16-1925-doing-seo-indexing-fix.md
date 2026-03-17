# Doing: SEO Indexing Fix

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-16 21:27
**Planning**: ./2026-03-16-1925-planning-seo-indexing-fix.md
**Artifacts**: ./2026-03-16-1925-doing-seo-indexing-fix/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Improve crawler-facing consistency and discovery signals for `https://ouroboros.bot/` by aligning canonical metadata with the live trailing-slash routes, auditing the repo-owned indexing artifacts that can be fixed in code, and preparing the exact manual Google/Bing submission steps that still need to happen outside the repo.

## Completion Criteria
- [x] All hardcoded canonicals for routes that currently redirect are updated to the final live URL form.
- [x] Sampled pages emit canonical and matching URL metadata that align with the redirect target and sitemap entries.
- [x] Repo-owned crawler/indexing artifacts are checked and any repo-fixable inconsistencies are resolved or documented.
- [x] The final handoff includes an exact Google Search Console and Bing Webmaster checklist for `https://ouroboros.bot/`, including the current sitemap URL.
- [x] Build-time verification for the changed metadata/pages succeeds.
- [x] 100% test coverage on all new code
- [x] All tests pass
- [x] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Setup/Research
**What**: Install dependencies with `npm ci`, build the site once, confirm the current slashless-to-trailing-slash redirect behavior for the target routes, inspect the root token file at `public/11939a2530214da79d49b3a8908b8c9c.txt`, and capture a baseline artifact listing the exact source files, live URLs, redirects, and sitemap entries this task will touch.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/baseline-audit.md`
**Acceptance**: Dependencies install cleanly, the baseline artifact names the target source files and live URLs, and the token file is explicitly documented as preserved pending verified purpose.

### ✅ Unit 1a: Canonical Metadata Validation — Tests
**What**: Add a focused metadata validation test at `tests/seo-metadata.test.mjs` using built-in Node tooling plus `astro build` to assert `dist/sitemap-index.xml`, `dist/sitemap-0.xml`, and selected built pages agree on trailing-slash canonical URLs. Cover at least `/`, `/docs/`, `/docs/architecture/`, `/docs/getting-started/`, `/story/`, `/why/`, `/what-is-an-agent-harness/`, `/blog/build-ai-agent-from-scratch/`, `/blog/stop-being-the-glue/`, and `/blog/what-is-agent-experience/`. Add a `package.json` script so the test can be run repeatably from the repo root.
**Output**: A committed failing metadata test in `tests/seo-metadata.test.mjs` and command wiring in `package.json`.
**Acceptance**: `npm run test:seo-metadata` exists, runs from the repo root, and fails against the current slashless canonical values before any metadata implementation changes are made.

### ✅ Unit 1b: Canonical Metadata Validation — Implementation
**What**: Update the canonical-bearing source files so their canonical URLs match the trailing-slash live routes and keep any derived JSON-LD or metadata fields aligned. Target the currently hardcoded canonical values in `src/pages/docs/index.astro`, `src/pages/docs/architecture.astro`, `src/pages/docs/getting-started.astro`, `src/pages/docs/skills-and-prompts.astro`, `src/pages/docs/continuity-and-memory.astro`, `src/pages/docs/bundles-and-psyche.astro`, `src/pages/story.astro`, `src/pages/why.astro`, `src/pages/what-is-an-agent-harness.astro`, `src/pages/blog/build-ai-agent-from-scratch.astro`, `src/pages/blog/stop-being-the-glue.astro`, and `src/pages/blog/what-is-agent-experience.astro`. Do not refactor `src/layouts/Layout.astro` or `src/components/DocsPageShell.astro` unless a literal URL update proves insufficient.
**Output**: Canonical metadata updates in the targeted files.
**Acceptance**: The metadata test from Unit 1a passes, the targeted slashless canonical literals are removed or corrected, and no sampled page emits a canonical URL that disagrees with the redirect target.

### ✅ Unit 1c: Canonical Metadata Validation — Coverage & Refactor
**What**: Re-run `npm run test:seo-metadata` and `npm run build`, inspect `dist/sitemap-index.xml`, `dist/sitemap-0.xml`, and the generated HTML files for the sampled routes to confirm sitemap and page metadata alignment, and keep the new validation code small enough that every branch and error path introduced for the test harness is exercised by the test suite.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/verification-notes.md`
**Acceptance**: Build and metadata validation both pass, no new warnings are introduced, and the verification artifact records the final checked URLs plus the commands used.

### ✅ Unit 2a: Verification Artifact Audit
**What**: Trace the current role of `public/11939a2530214da79d49b3a8908b8c9c.txt` using three concrete checks only: the file contents in-repo, the live response from `https://ouroboros.bot/11939a2530214da79d49b3a8908b8c9c.txt`, and a repo-wide search for the token string or related verification references. Document whether the evidence supports treating it as an ownership or IndexNow-style token and note any follow-up that still requires external dashboard confirmation.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/verification-artifact-audit.md`
**Acceptance**: The artifact records the file contents, where it is served from, whether it is referenced in-repo, and an explicit decision to keep or change it based on evidence.

### ✅ Unit 2b: Search Submission Handoff
**What**: Prepare a concise operator checklist for post-deploy Google Search Console and Bing Webmaster actions using `https://ouroboros.bot/sitemap-index.xml` and the exact priority URLs `https://ouroboros.bot/`, `https://ouroboros.bot/docs/`, `https://ouroboros.bot/why/`, `https://ouroboros.bot/what-is-an-agent-harness/`, `https://ouroboros.bot/blog/build-ai-agent-from-scratch/`, and `https://ouroboros.bot/blog/what-is-agent-experience/`.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/search-submission-checklist.md`
**Acceptance**: The checklist includes `https://ouroboros.bot/sitemap-index.xml`, names the priority URLs to inspect, and avoids claiming that external dashboard actions were completed from inside the repo.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-16-1925-doing-seo-indexing-fix/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-16 21:27 Created from planning doc
- 2026-03-16 21:28 Granularity pass tightened the artifact and test-file expectations.
- 2026-03-16 21:28 Validation pass pinned the exact dist files and confirmed the implementation should stay in page literals unless evidence forces a shared-component change.
- 2026-03-16 21:29 Ambiguity pass replaced fuzzy audit and handoff language with exact evidence sources and priority URLs.
- 2026-03-16 21:29 Quality pass confirmed unit format, acceptance coverage, and readiness for execution.
- 2026-03-16 21:33 Unit 0 complete: installed dependencies, built the site, captured redirect/sitemap baseline, and documented the verification token status.
- 2026-03-16 21:34 Unit 1a complete: added `npm run test:seo-metadata` and a failing metadata test that exposes the slashless canonical mismatch.
- 2026-03-16 21:36 Unit 1b complete: aligned the in-scope page canonicals with trailing-slash routes and got green metadata validation plus a clean serial build.
- 2026-03-16 21:38 Unit 1c complete: verified `100%` coverage on the new metadata test harness and recorded the successful build/test evidence.
- 2026-03-16 21:39 Unit 2a complete: audited the root verification token and documented why it should stay unchanged pending external dashboard confirmation.
- 2026-03-16 21:40 Unit 2b complete: added the concrete Google/Bing submission checklist and priority URLs for post-deploy inspection.
