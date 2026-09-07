/*
  Tiny safe markdown renderer for model-authored output.

  Supported forms:
    `code`       → inline model code
    **bold**     → strong text
    [text](URL)  → external HTTP(S) link
    blank lines  → paragraphs when requested

  HTML is escaped first. Unsupported or unsafe markdown remains visible as plain model text.
*/

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function parseInlineMd(text, options = {}) {
  let html = escapeHtml(text)
  const codeSpans = []

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code)
    return `\x00CODE${codeSpans.length - 1}\x00`
  })

  html = html.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s"'<>]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\x00CODE(\d+)\x00/g, (_, index) => `<code class="model-code">${codeSpans[Number(index)]}</code>`)

  if (options.wrapInParagraphs) {
    html = html
      .split(/\n{2,}/)
      .filter((paragraph) => paragraph.trim().length > 0)
      .map((paragraph) => `<p>${paragraph}</p>`)
      .join('')
  }

  return html
}
