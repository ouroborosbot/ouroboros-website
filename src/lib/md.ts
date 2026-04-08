/*
  Tiny markdown parser for rendering model output on the site.

  Models love to drop inline code refs like `src/arc/obligations.ts` and
  `psyche/SOUL.md` into testimonials and evaluations. Without parsing,
  those literal backticks show on the page. This helper handles the
  small subset of markdown the models actually use:

    `code`     → <code class="model-code">code</code>
    **bold**   → <strong>bold</strong>
    \n\n       → paragraph break (when wrapInParagraphs: true)

  HTML in the input is escaped first, so model output cannot inject
  arbitrary HTML. Treat all model output as untrusted text that gets
  selectively allowed to use code/bold styling.

  Used by:
  - src/pages/model-reviews.astro (testimonials, evaluations)
  - src/pages/model-reviews/[provider].astro (hero quote, verdict round)

  See AGENTS.md "verbatim model quotes" rule — this helper RENDERS the
  model output, it never edits it. Verbatim still in.
*/

export interface ParseOptions {
  /** Wrap the output in <p>...</p> with paragraph breaks on blank lines. Default: false. */
  wrapInParagraphs?: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function parseInlineMd(text: string, opts: ParseOptions = {}): string {
  let html = escapeHtml(text)

  // Stash code spans first so their contents are protected from the
  // bold pass below. We use a sentinel that can't appear in real text.
  const codeSpans: string[] = []
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code)
    return `\x00CODE${codeSpans.length - 1}\x00`
  })

  // Bold (won't match inside code spans because they were stashed)
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')

  // Restore code spans with the .model-code class so they render
  // consistently regardless of the parent context (prose-ouro, plain
  // blockquote, transcript card, etc).
  html = html.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
    return `<code class="model-code">${codeSpans[parseInt(i, 10)]}</code>`
  })

  if (opts.wrapInParagraphs) {
    // Split on blank lines, wrap each paragraph in <p>.
    const paragraphs = html.split(/\n{2,}/).filter((p) => p.trim().length > 0)
    html = paragraphs.map((p) => `<p>${p}</p>`).join('')
  }

  return html
}
