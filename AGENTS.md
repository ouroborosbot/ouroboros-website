# AGENTS.md

Instructions for any AI agent (Claude Code, Codex CLI, etc.) or human contributor working on this repo. Read this before editing.

This file is the contract. The design system header at the top of `src/styles/global.css` is the deeper source of truth for visual rules. The script comment block at the top of `scripts/model-reviews.cjs` is the deeper source of truth for the model-reviews data pipeline. When in doubt, read those.

## What this site is

`ouroboros.bot` — the marketing + docs + reviews site for the Ouroboros agent harness. Astro 5 + Tailwind v4 + Cloudflare Pages.

- **Sibling repo:** `ouroborosbot/ouroboros` — the actual harness source. Don't import from it; the site is independent.
- **Deploy:** push to `main` → Cloudflare Pages runs `astro build` → live.

---

## Hard rules — read these first

### 1. NO ITALIC ANYWHERE

Italic Cormorant Garamond is hard to read at every size below true display scale and looks bad. The only allowed italic on the site is:

- `.prose-ouro em` — HTML semantic `<em>` emphasis (1–3 words inside long-form prose)
- `.prose-ouro blockquote` — intentional editorial styling

Cormorant ships in this site as **Regular (400) only**. Even hero H1s use Cormorant non-italic. Use the `.heading-hero`, `.heading-section`, `.heading-sub` utility classes from `global.css` — don't inline new heading sizes.

### 2. SENTENCE CASE FOR ALL TITLES AND HEADLINES

Page `<title>` tags, H1s, H2s, H3s, blog post titles, doc titles, nav links, footer links — **all sentence case**. Never Title Case.

- Capitalize only the first word and proper nouns (Ouroboros, Anthropic, OpenAI, AI, AX, TypeScript, Google, etc.)
- After em-dash `—` or pipe `|` separators, lowercase the next word unless it's a proper noun
- Example: `"Your model prefers Ouroboros — Ouroboros"` ✓, not `"Your Model Prefers Ouroboros"` ✗

Eyebrow labels styled ALL CAPS via CSS (`uppercase` + `tracking`) are fine — the source text is still sentence case, the transformation is presentational.

### 3. CORMORANT IS THE DISPLAY FONT EVERYWHERE

Headers, nav, hero claims — all use Cormorant via the `.heading-*` utility classes in `global.css`. The site should feel like one designer designed it. If you find yourself writing a one-off heading style, that's a sign the utility classes need a new variant — add it to `global.css`, then use it.

### 4. VERBATIM MODEL QUOTES — NEVER CURATE

The model-reviews script output (`src/data/model-reviews.json` + `src/data/model-reviews-transcripts/*.json`) is the **sole source of truth** for any model voice that appears anywhere on the site. Site templates pull from this raw output directly.

**The rules:**

- **Never hand-edit a quote** in the JSON. Verbatim from the model or it doesn't ship.
- **Never hand-pick which sentence** of a longer testimonial to highlight on a card. That's curation, even if the words are verbatim.
- **Never paraphrase** a model's quote and present it as a quote.
- **Never copy** winning language from a previous run back into the prompt as an "example" — that's priming.
- **Never list dimensions** to evaluate on (e.g. "consider identity, memory, relationships") — that primes the answer.
- **Never give the model descriptions** of the things it's evaluating. The script gives only name + repo URL; the model has to research from scratch.

**When the output isn't good enough:** tighten the prompt and re-run. The fix lives in `scripts/model-reviews.cjs`, never in the data.

**Format constraints are OK** in the prompt (e.g. "use this markdown shape", "do not begin with X") because they're about shape, not content.

The whole pitch of `/model-reviews` is independence and verifiability — curating quotes destroys that pitch.

### 5. MARKETING CLAIMS DERIVE FROM THE DATA

Site copy that says "all frontier models chose Ouroboros" must derive from `modelReviews.summary.{winner,verdicts,totalReviews}` — never hardcode the claim string. If a future re-run produces different verdict counts the page must update with it automatically.

Pattern (used in `index.astro`, `model-reviews.astro`, `why.astro`):

```ts
const winner = modelReviews.summary?.winner ?? '<fallback>'
const totalReviews = modelReviews.summary?.totalReviews ?? reviews.length
const winnerCount = modelReviews.summary?.verdicts?.[winner] ?? totalReviews
const allChose = winnerCount === totalReviews
const claim = allChose
  ? `all frontier models chose ${winner}`
  : `${winnerCount} of ${totalReviews} frontier models chose ${winner}`
```

The brand name in nav links, page titles, and section eyebrows is fine — those are brand identifiers, not claims about the data.

### 6. OG CARDS — SINGLE SOURCE OF TRUTH, DYNAMIC AT BUILD TIME

OG cards are generated dynamically at build time from a single manifest. There is **no manual regeneration step**.

- `src/data/og.ts` exports `pageOg` mapping page route → `{ title, subtitle, tag }` plus `ogPathFor()` and `slugFor()` helpers.
- `src/pages/og/[...slug].png.ts` reads the manifest and renders one PNG per entry via Satori + Resvg at build time.
- Every page imports `ogPathFor` and passes the result to `<Layout ogImage={ogPathFor('/route')}>`. Never hardcode an OG path string.
- On every push, Cloudflare runs `astro build` → all OG PNGs regenerate from the manifest → live.

**Adding a new page:**

1. Add an entry to `pageOg` in `src/data/og.ts`
2. In the page frontmatter: `import { ogPathFor } from '../data/og'`
3. Pass `ogImage={ogPathFor('/your-route')}` to `<Layout>`
4. Done. Next deploy generates the OG.

**Anti-patterns to never reintroduce:**

- A separate `scripts/generate-og.ts` writing static PNGs by hand
- Static PNG files committed in `public/og/`
- Hardcoded `ogImage="/og/og-X.png"` strings in pages
- Two `pages` arrays defining the same metadata in different files

**The tag (eyebrow) must make sense in isolation** — someone seeing the OG card on Twitter/Slack with no page context. Don't reuse a section eyebrow from inside the page if it'd be confusing without that context. When in doubt, omit the tag.

### 7. POSITIONING IS ARCHITECTURAL, NOT GENERIC

Differentiator copy must reference real Ouroboros architecture (5-file structured psyche, automatic associative recall, friend records with trust gating, inner dialog, creature-body layout, diary/journal split, etc). "The agent that remembers" is meaningless — every agent has memory. See the `project_competitive_positioning.md` memory file (Ouroboros vs OpenClaw, verified against source).

### 8. DECK-SLIDE DENSITY

Each section should land in ~2 seconds at a glance. One main idea per section. Minimal text supporting one clear hierarchy. Generous but bounded whitespace — don't billboard 4 words across a 1000px canvas, and don't smush text into the corner of a `max-w` container. If a section needs a paragraph of explanation to make sense, the headline isn't doing its job.

### 9. MOBILE-FIRST

Every layout must work on a 700px-tall mobile viewport before it works on desktop. Test on mobile sizes first. Never use single-column flowing text — always use grids/cards/multi-column layouts.

### 10. LINKS LOOK LIKE LINKS

Color, underline, arrow, or button — links must be visibly clickable. Hover-only affordance is not enough.

### 11. NO DUPLICATE TEXT

Don't show the same information twice in different formats (e.g. `"Claude Opus 4.6"` and `"claude-opus-4-6"` next to each other). Pick one.

### 12. EVERGREEN CONTENT, STRUCTURED METADATA

Pages that should stay evergreen (e.g. `/model-reviews`) do not show visible publish/run dates in the UI. Dates go in JSON-LD structured data via `<Fragment slot="head">` for SEO and machine consumers. Click-through to specific runs surfaces dates where relevant.

---

## Writing voice

Ari's writing style guide lives at `~/clawd/skills/writing-style/SKILL.md`. Always consult it when writing or editing copy. The short version:

- Understated > overstated. Let the reader conclude.
- No redundancy — if a point is made, move on.
- No LinkedIn-speak ("Written by X, improved by X, loved by X").
- No announcing transitions — just make them.
- Short sentences for impact, long for flow.
- Banned phrases: "Let me explain", "Here's the beautiful part", "case in point".
- Every ending: understated, not cringy.
- "Would this embarrass me on a billboard?"

---

## Repo layout

```
src/
  components/
    HeroCover.astro      ← shared title-card hero used by every top-level page
    Nav.astro            ← top nav (rendered into Layout)
    Footer.astro
    DocsPageShell.astro  ← wrapper for /docs/* sub-pages
    OuroborosRing.astro  ← decorative SVG ring
    SerpentGuidePreview.astro
    PromptCard.astro
  data/
    og.ts                ← OG metadata manifest (single source of truth)
    model-reviews.json   ← script output (DO NOT hand-edit)
    model-reviews-transcripts/*.json ← per-provider transcripts (DO NOT hand-edit)
  layouts/
    Layout.astro         ← root <html><head><body> with nav + footer slots
  pages/
    index.astro          ← /
    why.astro            ← /why
    story.astro          ← /story
    what-is-an-agent-harness.astro
    model-reviews.astro  ← /model-reviews
    model-reviews/[provider].astro ← /model-reviews/{anthropic,openai,gemini,minimax}
    docs/                ← /docs and /docs/* sub-pages (use DocsPageShell)
    blog/                ← /blog and /blog/* posts
    og/[...slug].png.ts  ← dynamic OG image endpoint (build-time pre-render)
    404.astro
  styles/
    global.css           ← @theme tokens, @apply utility classes, design rules header
  og/
    fonts/               ← TTFs for Satori OG generation
scripts/
  model-reviews.cjs      ← runs frontier models against the harness list, writes src/data/
public/
  fonts/                 ← woff2 fonts loaded by global.css
  images/
  og/                    ← EMPTY — OG cards are generated dynamically, never committed
  skills/                ← skills/manifest.json + skill markdown for agent consumption
```

## Conventions

- **Astro file frontmatter:** import Layout (or HeroCover for top-level pages), import `ogPathFor` from `../data/og`, define const `title`/`description`, pass `ogImage={ogPathFor('/route')}` to Layout.
- **Heading sizes:** use `.heading-hero`, `.heading-section`, `.heading-sub` from `global.css`. Don't inline.
- **Eyebrows:** use `.eyebrow` (mono uppercase fang-red tracking) or `.caption-mono` (mono uppercase shadow tracking).
- **Colors:** the dark organic palette is defined in `@theme` in `global.css`. Use the named colors (`text-bone`, `bg-deep`, `text-scale`, `text-fang`, etc.), not raw hex.
- **Animations:** `.animate-fade-up` with `.stagger-1` through `.stagger-5` for staggered reveals. `.reveal` for scroll-triggered.

## Git & commits

- **Never** add `Co-Authored-By: Claude` or any AI attribution to commits or PRs.
- **Never** add "Generated with Claude Code" or similar AI watermarks.
- **Never** skip git hooks (`--no-verify`).
- Conventional commit prefixes: `feat`, `fix`, `style`, `refactor`, `chore`, `data`, `copy`, `docs`.
- Concise one-line summary, then a body explaining **why** more than **what**.
- Email: `ari@mendelow.me` (already configured).

## Adding a new page — checklist

1. Create the `.astro` file in `src/pages/`
2. `import Layout` and `import { ogPathFor } from '../data/og'`
3. Add an entry to `pageOg` in `src/data/og.ts` with the route as the key
4. Pass `ogImage={ogPathFor('/your-route')}` to Layout
5. Use sentence case for the page title
6. Use `.heading-hero` for the H1 (or wrap with `<HeroCover>` for the standard centered title-card pattern)
7. Update nav (`src/components/Nav.astro`) and footer (`src/components/Footer.astro`) if it's a top-level page
8. Run `npm run build` to verify it compiles and the OG image generates
9. Commit, push

## Re-running the model-reviews script

```bash
node scripts/model-reviews.cjs            # interactive (opens 4 macOS terminal windows)
node scripts/model-reviews.cjs --headless # for CI / no GUI
```

Requires `~/.agentsecrets/model-reviews/secrets.json` with provider API keys + Perplexity. After a run completes, both `src/data/model-reviews.json` and `src/data/model-reviews-transcripts/*.json` are atomically written. Commit the result; the site rebuild picks it up automatically. **Never hand-edit either file.** If the output is bad, tighten the prompt in the script and re-run.

## Where to look for deeper context

- `src/styles/global.css` header — design system rules (the canonical version of the hard rules above)
- `scripts/model-reviews.cjs` header — model-reviews data pipeline rules
- `src/data/og.ts` header — OG card rules
- `~/.claude/projects/-Users-arimendelow-Projects-ouroboros-website/memory/` — Ari's private project memory (feedback files, competitive positioning, writing style)
- `src/components/HeroCover.astro` — the standard top-level page hero, used everywhere
