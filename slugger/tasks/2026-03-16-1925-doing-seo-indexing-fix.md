# Doing: SEO Indexing Fix

**Status**: drafting
**Execution Mode**: direct
**Created**: [pending git timestamp]
**Planning**: ./2026-03-16-1925-planning-seo-indexing-fix.md
**Artifacts**: ./2026-03-16-1925-doing-seo-indexing-fix/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Improve crawler-facing consistency and discovery signals for `https://ouroboros.bot/` by aligning canonical metadata with the live trailing-slash routes, auditing the repo-owned indexing artifacts that can be fixed in code, and preparing the exact manual Google/Bing submission steps that still need to happen outside the repo.

## Completion Criteria
- [ ] All hardcoded canonicals for routes that currently redirect are updated to the final live URL form.
- [ ] Sampled pages emit canonical and matching URL metadata that align with the redirect target and sitemap entries.
- [ ] Repo-owned crawler/indexing artifacts are checked and any repo-fixable inconsistencies are resolved or documented.
- [ ] The final handoff includes an exact Google Search Console and Bing Webmaster checklist for `https://ouroboros.bot/`, including the current sitemap URL.
- [ ] Build-time verification for the changed metadata/pages succeeds.
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

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

### ⬜ Unit 0: Setup/Research
**What**: Install dependencies with `npm ci`, build the site once, confirm the current slashless-to-trailing-slash redirect behavior for the target routes, inspect the root token file at `public/11939a2530214da79d49b3a8908b8c9c.txt`, and capture a baseline artifact listing the exact files and URLs this task will touch.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/baseline-audit.md`
**Acceptance**: Dependencies install cleanly, the baseline artifact names the target source files and live URLs, and the token file is explicitly documented as preserved pending verified purpose.

### ⬜ Unit 1a: Canonical Metadata Validation — Tests
**What**: Add a focused metadata validation test using built-in Node tooling plus `astro build` to assert the generated sitemap and selected built pages agree on trailing-slash canonical URLs. Cover at least `/`, `/docs/`, `/docs/architecture/`, `/docs/getting-started/`, `/story/`, `/why/`, `/what-is-an-agent-harness/`, `/blog/build-ai-agent-from-scratch/`, `/blog/stop-being-the-glue/`, and `/blog/what-is-agent-experience/`. Add any required `package.json` script entry so the test can be run repeatably.
**Output**: A committed failing metadata test and any minimal command wiring needed to run it.
**Acceptance**: The new test exists, runs from the repo root, and fails against the current slashless canonical values before any metadata implementation changes are made.

### ⬜ Unit 1b: Canonical Metadata Validation — Implementation
**What**: Update the canonical-bearing source files so their canonical URLs match the trailing-slash live routes and keep any derived JSON-LD or metadata fields aligned. Target the currently hardcoded canonical values in `src/pages/docs/index.astro`, `src/pages/docs/architecture.astro`, `src/pages/docs/getting-started.astro`, `src/pages/docs/skills-and-prompts.astro`, `src/pages/docs/continuity-and-memory.astro`, `src/pages/docs/bundles-and-psyche.astro`, `src/pages/story.astro`, `src/pages/why.astro`, `src/pages/what-is-an-agent-harness.astro`, `src/pages/blog/build-ai-agent-from-scratch.astro`, `src/pages/blog/stop-being-the-glue.astro`, and `src/pages/blog/what-is-agent-experience.astro`.
**Output**: Canonical metadata updates in the targeted files.
**Acceptance**: The metadata test from Unit 1a passes, the targeted slashless canonical literals are removed or corrected, and no sampled page emits a canonical URL that disagrees with the redirect target.

### ⬜ Unit 1c: Canonical Metadata Validation — Coverage & Refactor
**What**: Re-run the metadata test and `npm run build`, inspect generated output in `dist/` to confirm sitemap and page metadata alignment, and keep the new validation code small enough that every branch and error path introduced for the test harness is exercised by the test suite.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/verification-notes.md`
**Acceptance**: Build and metadata validation both pass, no new warnings are introduced, and the verification artifact records the final checked URLs plus the commands used.

### ⬜ Unit 2a: Verification Artifact Audit
**What**: Trace the current role of `public/11939a2530214da79d49b3a8908b8c9c.txt` as far as the repo and live site can support, document whether it appears to be an ownership or IndexNow-style token, and note any follow-up that still requires external dashboard confirmation.
**Output**: `./2026-03-16-1925-doing-seo-indexing-fix/verification-artifact-audit.md`
**Acceptance**: The artifact records the file contents, where it is served from, whether it is referenced in-repo, and an explicit decision to keep or change it based on evidence.

### ⬜ Unit 2b: Search Submission Handoff
**What**: Prepare a concise operator checklist for post-deploy Google Search Console and Bing Webmaster actions using the current production sitemap entry point and a short list of priority URLs to inspect/request.
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
- [pending git timestamp] Created from planning doc
