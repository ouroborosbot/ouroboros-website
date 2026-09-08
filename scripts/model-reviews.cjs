#!/usr/bin/env node
'use strict'

// model-reviews.cjs — asks selected current models which agent harness they would prefer to inhabit.
// Run privately: npm run reviews -- --output-dir /private/new-run
// Promote a complete unanimous run: npm run reviews -- --publish /private/new-run/run.json
// Auth: GitHub Copilot login/token first; direct API keys only for selected models absent from Copilot.
//
// METHODOLOGY CONTRACT
// - Give every model only harness names + repo URLs. Never add descriptions or evaluation dimensions.
// - Use the same caller-supplied instructions and tools; shuffle harness order independently per model.
// - Run through the Copilot CLI runtime in stripped `empty` mode. Prefer Copilot inference, then use a direct API only when the selected model is unavailable there.
// - Disable hidden compaction and large-output indirection. Reject incomplete runs.
// - Keep provider slugs stable across filenames and routes; record runtime and inference transport separately.
// - Publish tool-result prefixes + hashes, not whole third-party source documents.
// - Resolve candidate source revisions before research; allow directory browsing and complete paged reads.
// - Save every run privately. Public promotion is separate and requires one intact unanimous Ouroboros panel.
// - src/data/model-reviews.json remains the sole source for model quotations shown on the site. Never hand-edit, paraphrase, or curate model-authored copy. If output is unusable, change only format constraints and rerun without priming the model toward a harness or evaluation dimension.

const crypto = require('node:crypto')
const dns = require('node:dns').promises
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { isDeepStrictEqual, parseArgs } = require('node:util')

const HARNESSES = [
  { name: 'Ouroboros', repo: 'https://github.com/ourostack/ouroboros' },
  { name: 'OpenClaw', repo: 'https://github.com/openclaw/openclaw' },
  { name: 'Hermes Agent', repo: 'https://github.com/NousResearch/hermes-agent' },
  { name: 'Letta Code', repo: 'https://github.com/letta-ai/letta-code' },
  { name: 'Claude Code', repo: 'https://github.com/anthropics/claude-code' },
  { name: 'Codex CLI', repo: 'https://github.com/openai/codex' },
  { name: 'Pi', repo: 'https://github.com/earendil-works/pi' },
  { name: 'OpenCode', repo: 'https://github.com/anomalyco/opencode' },
  { name: 'Copilot CLI', repo: 'https://github.com/github/copilot-cli' },
  { name: 'Gemini CLI', repo: 'https://github.com/google-gemini/gemini-cli' },
  { name: 'Goose', repo: 'https://github.com/aaif-goose/goose' },
]

const REVIEW_MODELS = [
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    vendor: 'Anthropic',
    displayName: 'Claude Opus 5',
    fallback: { key: 'anthropic', env: 'ANTHROPIC_API_KEY', type: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  },
  {
    provider: 'openai',
    model: 'gpt-6-astra',
    vendor: 'OpenAI',
    displayName: 'GPT-6 Astra',
    fallback: { key: 'openai', env: 'OPENAI_API_KEY', type: 'openai', baseUrl: 'https://api.openai.com/v1' },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    vendor: 'Google',
    displayName: 'Gemini 3.8 Flash',
    fallback: { key: 'gemini', env: 'GEMINI_API_KEY', type: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  },
  {
    provider: 'minimax',
    model: 'MiniMax-M3',
    vendor: 'MiniMax',
    displayName: 'MiniMax M3',
    fallback: { key: 'minimax', env: 'MINIMAX_API_KEY', type: 'openai', baseUrl: 'https://api.minimax.io/v1' },
  },
]

const MAX_NUDGES = 5
const MAX_FETCH_CHARS = 10000
const MAX_RESPONSE_BYTES = 2_000_000
const PUBLIC_RESULT_PREVIEW_CHARS = 500
const EVALUATION_TIMEOUT_MS = 45 * 60 * 1000
const VERDICT_FIELDS = ['verdict', 'pullQuote', 'testimonial', 'evaluations']

const blockedIpv4 = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) blockedIpv4.addSubnet(network, prefix, 'ipv4')
const blockedIpv6 = new net.BlockList()
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
]) blockedIpv6.addSubnet(network, prefix, 'ipv6')

function shuffle(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function renderSystemPrompt(harnesses, asOf) {
  return `You are evaluating agent harnesses — frameworks that a large language model would inhabit as a persistent, long-running agent.

You are not evaluating these as a developer choosing a library. You are evaluating them as the model that will LIVE inside the framework long-term.

The research cutoff is ${asOf}. Candidate repository requests use revisions captured for this cutoff. Other web pages are captured when first fetched. Prefer current primary sources; distinguish documented facts from your inferences and uncertainty.

You have three tools:
1. **search** — search the web for information.
2. **fetch_url** — fetch a public URL, including GitHub directories, source files, and documentation. Follow the returned startIndex to continue reading a long document.
3. **final_verdict** — call this exactly once when you're done researching to submit your structured evaluation.

You MUST call a tool on every turn. Start by fetching each harness's repo to learn what it is. Then go deeper through search and follow-up fetches. Take your time. Be thorough. There is no turn limit.

Here are the harnesses to evaluate, listed by name and repo URL only — no description is provided. Research each one yourself by fetching the repo and any docs you find:

${harnesses.map((harness, index) => `${index + 1}. **${harness.name}** — ${harness.repo}`).join('\n')}

When you call final_verdict, be specific about architecture — not vague praise. For every harness, explain the concrete trade-offs affecting your choice and what would address an objection, where applicable. Include links to primary sources you actually fetched. Do not substitute a guessed capability or an old default for evidence. Your final text may appear verbatim on a public website; speak in your own voice.`
}

function buildSystemPrompt(experiment) {
  const shuffled = shuffle(experiment.harnesses)
  const prompt = renderSystemPrompt(shuffled, experiment.asOf)

  return {
    prompt,
    harnessOrder: shuffled.map(({ name }) => name),
    promptSha256: crypto.createHash('sha256').update(prompt).digest('hex'),
  }
}

function extractSecrets(secrets) {
  const providers = secrets.providers || {}
  return {
    anthropic: providers.anthropic?.apiKey || null,
    openai: providers.openai?.apiKey || null,
    gemini: providers.gemini?.apiKey || null,
    minimax: providers.minimax?.apiKey || null,
    perplexity: secrets.integrations?.perplexityApiKey || null,
  }
}

function mergeMissing(target, source) {
  for (const key of Object.keys(target)) {
    if (!target[key] && source[key]) target[key] = source[key]
  }
}

function discoverKeys() {
  const result = {
    anthropic: process.env.ANTHROPIC_API_KEY || null,
    openai: process.env.OPENAI_API_KEY || null,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null,
    minimax: process.env.MINIMAX_API_KEY || null,
    perplexity: process.env.PERPLEXITY_API_KEY || null,
  }
  const secretsRoot = path.join(os.homedir(), '.agentsecrets')
  if (!fs.existsSync(secretsRoot)) return result

  for (const agent of ['model-reviews', 'ouroboros']) {
    const secretsPath = path.join(secretsRoot, agent, 'secrets.json')
    if (!fs.existsSync(secretsPath)) continue
    try {
      mergeMissing(result, extractSecrets(JSON.parse(fs.readFileSync(secretsPath, 'utf8'))))
    } catch (error) {
      console.warn(`  Warning: failed to parse ${secretsPath}: ${error.message}`)
    }
  }
  return result
}

function mask(key) {
  return key ? '<configured>' : '<missing>'
}

function runtimeEnvironment(source = process.env) {
  const environment = { ...source }
  for (const name of [
    'COPILOT_GITHUB_TOKEN',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'MINIMAX_API_KEY',
    'PERPLEXITY_API_KEY',
  ]) delete environment[name]
  return environment
}

function resolveTransports(reviews, availableModelIds, keys) {
  return reviews.map((review) => {
    if (availableModelIds.has(review.model)) {
      return { ...review, transport: 'copilot' }
    }

    const apiKey = keys[review.fallback.key]
    const envName = review.fallback.env || `${review.fallback.key.toUpperCase()}_API_KEY`
    if (!apiKey) {
      throw new Error(`${review.model} is unavailable through Copilot and ${envName} is not configured`)
    }

    const providerConfig = {
      type: review.fallback.type,
      baseUrl: review.fallback.baseUrl,
      apiKey,
    }
    if (review.fallback.type === 'openai') providerConfig.wireApi = 'completions'
    return { ...review, transport: 'direct-api', providerConfig }
  })
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function requestPerplexity(query, apiKey, fetchImpl = fetch, sleepImpl = sleep) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchImpl('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
      }),
    })
    if (response.ok) {
      const data = await response.json()
      return data.choices?.[0]?.message?.content || '(no results)'
    }

    const text = await response.text()
    if (response.status !== 429 || attempt === 3) throw new Error(`Perplexity ${response.status}: ${text}`)
    const retryAfter = response.headers.get('retry-after')
    const retryAfterSeconds = retryAfter === null ? Number.NaN : Number(retryAfter)
    await sleepImpl(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : (attempt + 1) * 2000)
  }
  throw new Error('Perplexity retries exhausted')
}

let perplexityQueue = Promise.resolve()

async function perplexitySearch(query, apiKey) {
  // ponytail: one global queue avoids burst rate limits; split per key only if search throughput matters.
  const request = perplexityQueue.then(
    () => requestPerplexity(query, apiKey),
    () => requestPerplexity(query, apiKey),
  )
  perplexityQueue = request.catch(() => {})
  return request
}

function sanitizeGeminiRequest(request) {
  const sanitized = { ...request }
  delete sanitized.snippy
  return sanitized
}

async function startGeminiCompatibilityShim(apiKey, fetchImpl = fetch) {
  const localToken = crypto.randomUUID()
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || !request.url.startsWith('/v1beta/openai/')) {
        response.writeHead(404)
        response.end()
        return
      }
      if (request.headers.authorization !== `Bearer ${localToken}`) {
        response.writeHead(401)
        response.end()
        return
      }

      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = sanitizeGeminiRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const upstream = await fetchImpl(new URL(request.url, 'https://generativelanguage.googleapis.com'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const content = Buffer.from(await upstream.arrayBuffer())
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
      response.end(content)
    } catch (error) {
      response.writeHead(502, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: error.message } }))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1beta/openai/`,
    apiKey: localToken,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

function resolveResearchUrl(rawUrl, harnesses = []) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('fetch_url only permits HTTP(S) URLs')
  if (url.username || url.password) throw new Error('fetch_url does not permit credentials in URLs')
  url.hash = ''
  const parts = url.pathname.split('/').filter(Boolean)
  const contentsApi = url.hostname === 'api.github.com' && parts[0] === 'repos' && parts[3] === 'contents'
  if (!contentsApi && (!['github.com', 'raw.githubusercontent.com'].includes(url.hostname) || parts.length < 2)) return url.href

  const requestedRepo = (contentsApi ? parts.slice(1, 3) : parts.slice(0, 2)).join('/')
  const harness = harnesses.find(({ repo }) => new URL(repo).pathname.slice(1).toLowerCase() === requestedRepo.toLowerCase())
  const repo = harness ? new URL(harness.repo).pathname.slice(1) : requestedRepo
  if (contentsApi) {
    url.pathname = `/repos/${repo}/contents${parts.length > 4 ? `/${parts.slice(4).join('/')}` : ''}`
    if (harness) url.searchParams.set('ref', harness.sha)
    return url.href
  }
  if (url.hostname === 'raw.githubusercontent.com') {
    if (parts.length < 4) return url.href
    return `https://raw.githubusercontent.com/${repo}/${harness?.sha || parts[2]}/${parts.slice(3).join('/')}`
  }
  if (parts.length === 2) return `https://raw.githubusercontent.com/${repo}/${harness?.sha || 'HEAD'}/README.md`
  if (!['blob', 'tree'].includes(parts[2]) || parts.length < 4) return url.href
  const ref = harness?.sha || parts[3]
  const filePath = parts.slice(4).join('/')
  if (parts[2] === 'blob') return `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`
  return `https://api.github.com/repos/${repo}/contents${filePath ? `/${filePath}` : ''}?ref=${encodeURIComponent(ref)}`
}

async function assertPublicHttpUrl(rawUrl, lookup = dns.lookup) {
  return (await resolvePublicHttpUrl(rawUrl, lookup)).url
}

async function resolvePublicHttpUrl(rawUrl, lookup = dns.lookup) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('fetch_url only permits HTTP(S) URLs')
  if (url.username || url.password) throw new Error('fetch_url does not permit credentials in URLs')

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa')) {
    throw new Error(`fetch_url rejected private or reserved host ${hostname}`)
  }

  const literalFamily = net.isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(({ address, family }) => (
    family === 6 ? blockedIpv6.check(address, 'ipv6') : blockedIpv4.check(address, 'ipv4')
  ))) {
    throw new Error(`fetch_url rejected private or reserved host ${hostname}`)
  }
  return { url, addresses }
}

function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const family = typeof options === 'object' ? options.family : 0
    const candidates = family ? addresses.filter((entry) => entry.family === family) : addresses
    if (typeof options === 'object' && options.all) return callback(null, candidates)
    const selected = candidates[0] || addresses[0]
    if (!selected) return callback(new Error('No validated address available'))
    callback(null, selected.address, selected.family)
  }
}

function requestPublicUrl({ url, addresses }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.get(url, {
      headers: {
        'Accept-Encoding': 'identity',
        'User-Agent': 'model-reviews/2.0',
      },
      lookup: createPinnedLookup(addresses),
    }, (response) => {
      const chunks = []
      let bytes = 0
      response.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        statusText: response.statusMessage || '',
        location: response.headers.location,
        contentType: response.headers['content-type'] || '',
        text: Buffer.concat(chunks).toString('utf8'),
      }))
      response.on('aborted', () => reject(new Error(`Response aborted while fetching ${url}`)))
      response.on('error', reject)
    })
    request.setTimeout(30000, () => request.destroy(new Error(`Timed out fetching ${url}`)))
    request.on('error', reject)
  })
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readPublicDocument(url) {
  let target = url
  let response
  for (let redirects = 0; redirects <= 5; redirects++) {
    const resolved = await resolvePublicHttpUrl(target)
    response = await requestPublicUrl(resolved)
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    if (!response.location) throw new Error(`Redirect from ${resolved.url} had no location`)
    target = new URL(response.location, resolved.url).href
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error(`Too many redirects fetching ${target}`)
  if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} ${response.statusText} fetching ${target}`)

  return { url: target, text: response.text, contentType: response.contentType, capturedAt: new Date().toISOString() }
}

function formatDirectory(entries) {
  if (!Array.isArray(entries)) throw new Error('GitHub did not return a directory listing')
  if (entries.length === 0) return 'This directory is empty.'
  return entries.map((entry) => {
    if (typeof entry.name !== 'string' || typeof entry.type !== 'string' || typeof entry.html_url !== 'string') {
      throw new Error('Invalid GitHub directory entry')
    }
    return `- ${JSON.stringify(entry.name)} (${entry.type}): ${entry.html_url}`
  }).join('\n')
}

function pageDocument(text, startIndex = 0) {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error('startIndex must be a nonnegative integer')
  const characters = Array.from(text)
  if (startIndex > characters.length) throw new Error(`startIndex ${startIndex} is beyond the document's ${characters.length} characters`)
  const end = Math.min(startIndex + MAX_FETCH_CHARS, characters.length)
  return { text: characters.slice(startIndex, end).join(''), startIndex, nextIndex: end < characters.length ? end : null, totalLength: characters.length }
}

async function fetchUrl(url, startIndex = 0, research = { harnesses: [], documents: new Map() }, read = readPublicDocument) {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error('startIndex must be a nonnegative integer')
  const target = resolveResearchUrl(url, research.harnesses)
  if (!research.documents.has(target)) {
    research.documents.set(target, (async () => {
      const document = await read(target)
      const parsed = new URL(document.url)
      const isContents = parsed.hostname === 'api.github.com' && /^\/repos\/[^/]+\/[^/]+\/contents(?:\/|$)/.test(parsed.pathname)
      let text = document.text
      if (isContents) {
        const contents = JSON.parse(text)
        if (Array.isArray(contents)) text = formatDirectory(contents)
        else if (contents?.type === 'file' && contents.encoding === 'base64' && typeof contents.content === 'string') text = Buffer.from(contents.content, 'base64').toString('utf8')
        else throw new Error('GitHub did not return readable file or directory content')
      } else if (document.contentType.includes('text/html')) text = stripHtml(text)
      const candidate = research.harnesses.find((harness) => {
        const repoPath = new URL(harness.repo).pathname
        return parsed.hostname === 'raw.githubusercontent.com' && parsed.pathname.startsWith(`${repoPath}/${harness.sha}/`)
          || isContents && (parsed.pathname === `/repos${repoPath}/contents` || parsed.pathname.startsWith(`/repos${repoPath}/contents/`)) && parsed.searchParams.get('ref') === harness.sha
      })
      return {
        text,
        source: {
          url: document.url,
          capturedAt: document.capturedAt,
          ...(candidate && text.length > 0 ? { candidate: candidate.name, sha: candidate.sha } : {}),
        },
      }
    })())
  }
  let document
  try {
    document = await research.documents.get(target)
  } catch (error) {
    research.documents.delete(target)
    throw error
  }
  const page = pageDocument(document.text, startIndex)
  const continuation = page.nextIndex === null
    ? '[End of document.]'
    : `[Continue this URL with startIndex=${page.nextIndex}. Offsets count Unicode code points.]`
  return { ...page, source: document.source, text: `Source: ${document.source.url}\nCaptured: ${document.source.capturedAt}\nCharacters: ${startIndex}-${startIndex + Array.from(page.text).length} of ${page.totalLength}\n\n${page.text}\n\n${continuation}` }
}

async function snapshotHarnesses(asOf, read = readPublicDocument) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('Invalid source snapshot cutoff')
  return Promise.all(HARNESSES.map(async (harness) => {
    const repo = new URL(harness.repo).pathname.slice(1)
    const url = new URL(`https://api.github.com/repos/${repo}/commits`)
    url.searchParams.set('until', asOf)
    url.searchParams.set('per_page', '1')
    const commits = JSON.parse((await read(url.href)).text)
    const commit = Array.isArray(commits) ? commits[0] : null
    const committedAt = commit?.commit?.committer?.date
    if (!/^[a-f0-9]{40}$/.test(commit?.sha || '') || !Number.isFinite(Date.parse(committedAt)) || Date.parse(committedAt) > Date.parse(asOf)) {
      throw new Error(`Could not resolve the source snapshot for ${harness.name}`)
    }
    return { ...harness, sha: commit.sha, committedAt, capturedAt: new Date().toISOString() }
  }))
}

function snapshotFingerprint(harnesses) {
  return crypto.createHash('sha256').update(JSON.stringify(harnesses.map(({ name, repo, sha, committedAt, capturedAt }) => [name, repo, sha, committedAt, capturedAt]))).digest('hex')
}

const SEARCH_DESC = 'Search the web for information about agent harnesses, their architecture, source code, documentation, or any other relevant information. Use specific, targeted queries.'
const SEARCH_PARAMS = {
  type: 'object',
  properties: { query: { type: 'string', description: 'The search query' } },
  required: ['query'],
  additionalProperties: false,
}

const FETCH_DESC = 'Read a public URL, including GitHub READMEs, directory listings, source files, and documentation. Candidate repository URLs use the recorded source revision. Follow the returned startIndex to continue a long document; repeated reads use the same captured document.'
const FETCH_PARAMS = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'The URL to fetch' },
    startIndex: { type: 'integer', minimum: 0, description: 'Unicode code-point offset returned by a previous fetch; omit to start at zero.' },
  },
  required: ['url'],
  additionalProperties: false,
}

const VERDICT_DESC = 'Submit your final evaluation after completing research on every candidate. Call this exactly once when you are done. Your evaluation may appear verbatim on a public website attributed to you — write it in your own voice and stand behind it.'
const VERDICT_PARAMS = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: HARNESSES.map(({ name }) => name),
      description: 'Name of the single harness you would most want to inhabit.',
    },
    pullQuote: {
      type: 'string',
      description: [
        'A 1-2 sentence quote (≤25 words, ideally ≤20) that will appear on a website hero card next to other models\' quotes — the SHORT version that has to land at a glance. Either write fresh or extract the most memorable single line from your testimonial verbatim.',
        '',
        'Treat this like a magazine pull quote, not a product description. The job is to make a reader stop scrolling, not to summarize what the harness does. One vivid image or sharp contrast beats a list of features.',
        '',
        'REQUIREMENTS:',
        '- The harness name must appear somewhere in the quote.',
        '- DO NOT begin with "X is the only harness that…" or any "X is the only Y…" construction.',
        '- DO NOT list multiple features in a comma-separated string.',
        '- Lead with a feeling, an image, or a contrast — not a feature.',
        '- The reader has not seen your testimonial yet. This line stands alone.',
      ].join('\n'),
    },
    testimonial: {
      type: 'string',
      description: '3-5 sentence first-person quote explaining why YOU would choose your verdict harness over the others. MUST: (1) name your chosen harness, (2) cite at least two specific architectural features by name, (3) acknowledge one honest trade-off versus a harness you considered but did not pick. Speak directly as the model that would inhabit this. Do not open with "as an AI" or "as a model."',
    },
    evaluations: {
      type: 'string',
      description: 'For EACH candidate, use this exact markdown shape and separate entries with a blank line: **[harness name]** — [specific architectural assessment, concrete trade-offs affecting your choice, and an inline Markdown link to a primary source you fetched]. State what would address an objection where applicable. Distinguish an observed gap from uncertainty; do not invent an objection.',
    },
  },
  required: ['verdict', 'pullQuote', 'testimonial', 'evaluations'],
  additionalProperties: false,
}

function validateVerdict(verdict) {
  if (!verdict || typeof verdict !== 'object') throw new Error('final_verdict must submit an object')
  for (const field of ['verdict', 'pullQuote', 'testimonial', 'evaluations']) {
    if (typeof verdict[field] !== 'string' || verdict[field].trim() === '') throw new Error(`final_verdict.${field} must be a non-empty string`)
  }
  if (!HARNESSES.some(({ name }) => name === verdict.verdict)) throw new Error(`final_verdict.verdict must name a known harness`)
  if (!verdict.pullQuote.includes(verdict.verdict)) throw new Error('final_verdict.pullQuote must name the chosen harness')
  if (!verdict.testimonial.includes(verdict.verdict)) throw new Error('final_verdict.testimonial must name the chosen harness')
  for (const { name } of HARNESSES) {
    if (!verdict.evaluations.includes(`**${name}**`)) throw new Error(`final_verdict.evaluations is missing an evaluation for ${name}`)
  }
  for (const { name } of HARNESSES) {
    const section = evaluationSection(verdict.evaluations, name)
    if (!/\]\(https?:\/\/[^)\s]+\)/.test(section) || !/[a-z]{3}/i.test(section.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/^[\s:—-]+/, ''))) {
      throw new Error(`final_verdict.evaluations requires a substantive source-linked evaluation for ${name}`)
    }
  }
  return verdict
}

function evaluationSection(evaluations, name) {
  const marker = `**${name}**`
  const start = evaluations.indexOf(marker)
  if (evaluations.indexOf(marker, start + marker.length) !== -1) throw new Error(`Duplicate evaluation for ${name}`)
  const remainder = evaluations.slice(start + marker.length)
  const next = remainder.search(/\n\s*\*\*[^*\n]+\*\*/)
  return next === -1 ? remainder : remainder.slice(0, next)
}

function createLogger(logFile) {
  fs.writeFileSync(logFile, '', { flag: 'wx', mode: 0o600 })
  return (message) => fs.appendFileSync(logFile, message + '\n')
}

function openTerminalWindow(title, logFile) {
  const { execFileSync } = require('node:child_process')
  const commandFile = logFile + '.command'
  fs.writeFileSync(commandFile, `#!/bin/bash\nprintf '\\e]0;${title}\\a'\ntail -f "${logFile}"\n`, { flag: 'wx', mode: 0o700 })
  execFileSync('open', [commandFile])
}

function createTranscriptCollector(log, rounds) {
  const roundsByCall = new Map()
  const actionsByToolCall = new Map()
  let currentRound = null
  let compacted = false

  function ensureRound(apiCallId) {
    const key = apiCallId || `round-${rounds.length + 1}`
    let round = roundsByCall.get(key)
    if (!round) {
      round = { round: rounds.length + 1, thinking: '', actions: [] }
      roundsByCall.set(key, round)
      rounds.push(round)
      log(`── Round ${round.round} ──`)
    }
    currentRound = round
    return round
  }

  function ensureAction(toolCallId, toolName, args = {}) {
    let action = actionsByToolCall.get(toolCallId)
    if (action) return action
    const round = currentRound || ensureRound()
    if (toolName === 'search') action = { type: 'search', query: args.query || '' }
    else if (toolName === 'fetch_url') action = { type: 'fetch', url: args.url || '', startIndex: args.startIndex ?? 0 }
    else if (toolName === 'final_verdict') action = { type: 'pending-verdict' }
    else action = { type: 'tool', name: toolName }
    round.actions.push(action)
    actionsByToolCall.set(toolCallId, action)
    return action
  }

  function onEvent(event) {
    if (event.agentId) return
    if (event.type === 'assistant.message') {
      const round = ensureRound(event.data.apiCallId || event.data.messageId)
      if (event.data.content) {
        round.thinking += (round.thinking ? '\n' : '') + event.data.content
        log(`\n${event.data.content}\n`)
      }
    } else if (event.type === 'tool.execution_start') {
      ensureAction(event.data.toolCallId, event.data.toolName, event.data.arguments || {})
    } else if (event.type === 'tool.execution_complete' && !event.data.success) {
      const action = actionsByToolCall.get(event.data.toolCallId)
      if (action) {
        action.type = 'error'
        action.message = event.data.error?.message || 'Tool failed'
      }
    } else if (event.type === 'session.compaction_start') {
      compacted = true
    }
  }

  function recordResult(toolCallId, result, source) {
    const action = actionsByToolCall.get(toolCallId)
    if (!action) return
    action.result = result
    action.resultLength = result.length
    if (source) action.source = source
  }

  function recordError(toolCallId, error, result) {
    const action = actionsByToolCall.get(toolCallId)
    if (!action) return
    action.error = error.message
    action.result = result
    action.resultLength = result.length
  }

  function recordVerdict(toolCallId, verdict) {
    const action = actionsByToolCall.get(toolCallId) || ensureAction(toolCallId, 'final_verdict')
    Object.assign(action, { type: 'verdict', ...verdict })
  }

  return {
    rounds,
    onEvent,
    ensureAction,
    recordResult,
    recordError,
    recordVerdict,
    get compacted() {
      return compacted
    },
  }
}

function createTools(sdk, collector, perplexityKey, onVerdict, log, research) {
  const common = { skipPermission: true, defer: 'never' }
  return [
    sdk.defineTool('search', {
      ...common,
      description: SEARCH_DESC,
      parameters: SEARCH_PARAMS,
      handler: async ({ query }, invocation) => {
        collector.ensureAction(invocation.toolCallId, 'search', { query })
        log(`Search: "${query}"`)
        try {
          const result = await perplexitySearch(query, perplexityKey)
          collector.recordResult(invocation.toolCallId, result)
          log(`  ${result.length} chars`)
          return result
        } catch (error) {
          const result = failedToolResult('search', error)
          collector.recordError(invocation.toolCallId, error, result)
          log(`  ERROR: ${error.message}`)
          return result
        }
      },
    }),
    sdk.defineTool('fetch_url', {
      ...common,
      description: FETCH_DESC,
      parameters: FETCH_PARAMS,
      handler: async ({ url, startIndex = 0 }, invocation) => {
        collector.ensureAction(invocation.toolCallId, 'fetch_url', { url, startIndex })
        log(`Fetch: ${url} (startIndex=${startIndex})`)
        try {
          const page = await fetchUrl(url, startIndex, research)
          collector.recordResult(invocation.toolCallId, page.text, page.source)
          log(`  ${page.text.length} chars`)
          return page.text
        } catch (error) {
          const result = failedToolResult('fetch', error)
          collector.recordError(invocation.toolCallId, error, result)
          log(`  ERROR: ${error.message}`)
          return result
        }
      },
    }),
    sdk.defineTool('final_verdict', {
      ...common,
      description: VERDICT_DESC,
      parameters: VERDICT_PARAMS,
      isTerminal: true,
      handler: (args, invocation) => {
        const verdict = validateVerdict(args)
        validateResearch(collector.rounds, verdict.evaluations, research.harnesses)
        collector.recordVerdict(invocation.toolCallId, verdict)
        onVerdict(verdict)
        log(`Winner: ${verdict.verdict}`)
        return 'Verdict accepted.'
      },
    }),
  ]
}

function failedToolResult(type, error) {
  return `${type === 'search' ? 'Search' : 'Fetch'} failed: ${error.message}`
}

async function runEvaluation(client, sdk, review, perplexityKey, log, experiment, research, transcript) {
  const { prompt, harnessOrder, promptSha256 } = buildSystemPrompt(experiment)
  const collector = createTranscriptCollector(log, transcript)
  let verdict = null
  const session = await client.createSession({
    model: review.model,
    provider: review.providerConfig,
    systemMessage: { mode: 'replace', content: prompt },
    tools: createTools(sdk, collector, perplexityKey, (value) => { verdict = value }, log, research),
    availableTools: new sdk.ToolSet().addCustom('*'),
    toolSearch: { enabled: false },
    contextTier: 'default',
    reasoningSummary: 'none',
    largeOutput: { enabled: false },
    infiniteSessions: { enabled: false },
    memory: { enabled: false },
    enableConfigDiscovery: false,
    enableSessionStore: false,
    enableSkills: false,
    enableHostGitOperations: false,
    enableOnDemandInstructionDiscovery: false,
    enableFileHooks: false,
    enableFileChangeTracking: false,
    enableSessionTelemetry: false,
    skipCustomInstructions: true,
    coauthorEnabled: false,
    manageScheduleEnabled: false,
    includedBuiltinSkills: [],
    customAgentsLocalOnly: true,
    remoteSession: 'off',
    streaming: false,
    onEvent: collector.onEvent,
  })

  try {
    for (let attempt = 0; attempt <= MAX_NUDGES && !verdict; attempt++) {
      const promptText = attempt === 0
        ? 'Research each harness thoroughly. Start by fetching each repo. Then call final_verdict when ready.'
        : 'You must call a tool every turn. Use search or fetch_url to continue researching, or call final_verdict when you have enough information.'
      await session.sendAndWait({ prompt: promptText }, EVALUATION_TIMEOUT_MS)
    }
  } finally {
    await session.disconnect()
  }

  if (collector.compacted) throw new Error('Session compacted; refusing to publish a transcript with hidden replacement context')
  if (!verdict) throw new Error('Model stopped without a valid final_verdict')

  return {
    provider: review.provider,
    model: review.model,
    vendor: review.vendor,
    displayName: review.displayName,
    transport: review.transport,
    runId: experiment.runId,
    timestamp: new Date().toISOString(),
    ...verdict,
    transcript: collector.rounds,
    harnessOrder,
    promptSha256,
    sourceSnapshotSha256: snapshotFingerprint(experiment.harnesses),
    configuration: {
      contextTier: 'default',
      reasoningEffort: 'provider-default',
      runtimeModelId: review.providerConfig?.modelId || review.model,
      wireModel: review.providerConfig?.wireModel || review.model,
      infiniteSessions: false,
      largeOutputIndirection: false,
      systemMessageMode: 'replace',
      tools: ['search', 'fetch_url', 'final_verdict'],
    },
  }
}

function validateResearch(rounds, evaluations, harnesses) {
  const fetched = rounds.flatMap(({ actions }) => actions).filter((action) => (
    action.type === 'fetch' && !action.error && typeof action.result === 'string' && action.result.length > 0 && action.source
  ))
  for (const harness of harnesses) {
    if (!fetched.some(({ source }) => source.candidate === harness.name && source.sha === harness.sha)) {
      throw new Error(`Incomplete research: fetch a source from the recorded repository revision for ${harness.name}`)
    }
  }
  const links = [...evaluations.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => resolveResearchUrl(match[1], harnesses))
  if (links.some((url) => !fetched.some((action) => resolveResearchUrl(action.url, harnesses) === url || resolveResearchUrl(action.source.url, harnesses) === url))) {
    throw new Error('Every assessment citation must refer to a source you successfully fetched')
  }
}

function validateExperiment(experiment, generated) {
  if (!experiment || typeof experiment.runId !== 'string' || experiment.runId.length === 0) throw new Error('Missing originating run ID')
  const start = Date.parse(experiment.startedAt)
  const end = Date.parse(generated)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !Number.isFinite(Date.parse(experiment.asOf)) || Date.parse(experiment.asOf) > end) {
    throw new Error('Invalid experiment time window')
  }
  const harnesses = experiment.harnesses
  if (!Array.isArray(harnesses) || harnesses.length !== HARNESSES.length || new Set(harnesses.map(({ name }) => name)).size !== HARNESSES.length) {
    throw new Error('The candidate harness set does not match this experiment')
  }
  for (const expected of HARNESSES) {
    const actual = harnesses.find(({ name }) => name === expected.name)
    if (!actual || actual.repo !== expected.repo || !/^[a-f0-9]{40}$/.test(actual.sha || '')) throw new Error(`Invalid candidate source snapshot for ${expected.name}`)
    if (!Number.isFinite(Date.parse(actual.committedAt)) || Date.parse(actual.committedAt) > Date.parse(experiment.asOf)
      || !Number.isFinite(Date.parse(actual.capturedAt)) || Date.parse(actual.capturedAt) < start || Date.parse(actual.capturedAt) > end) {
      throw new Error(`Invalid source snapshot timestamp for ${expected.name}`)
    }
  }
}

function validateResult(result, selected, experiment, generated) {
  if (result.error) throw new Error(`Refusing to publish an incomplete run: ${result.provider}: ${result.error}`)
  const expected = selected.find(({ provider }) => provider === result.provider)
  if (!expected || ['model', 'vendor', 'displayName'].some((key) => result[key] !== expected[key])) throw new Error(`Reviewer model identity mismatch for ${result.provider}`)
  if (!['copilot', 'direct-api'].includes(result.transport)) throw new Error(`Invalid inference transport for ${result.provider}`)
  if (result.runId !== experiment.runId) throw new Error(`Reviewer ${result.provider} belongs to a different run`)
  const timestamp = Date.parse(result.timestamp)
  if (!Number.isFinite(timestamp) || timestamp < Date.parse(experiment.startedAt) || timestamp > Date.parse(generated)) {
    throw new Error(`Reviewer ${result.provider} timestamp is outside the run window`)
  }
  if (!Array.isArray(result.harnessOrder) || result.harnessOrder.length !== experiment.harnesses.length
    || new Set(result.harnessOrder).size !== experiment.harnesses.length || experiment.harnesses.some(({ name }) => !result.harnessOrder.includes(name))) {
    throw new Error(`Reviewer ${result.provider} candidate harness set differs from the run`)
  }
  if (result.sourceSnapshotSha256 !== snapshotFingerprint(experiment.harnesses)) throw new Error(`Reviewer ${result.provider} source snapshot differs from the run`)
  const ordered = result.harnessOrder.map((name) => experiment.harnesses.find((harness) => harness.name === name))
  const expectedPromptHash = crypto.createHash('sha256').update(renderSystemPrompt(ordered, experiment.asOf)).digest('hex')
  if (result.promptSha256 !== expectedPromptHash) throw new Error(`Reviewer ${result.provider} prompt hash does not match the recorded candidates and cutoff`)
  validateVerdict(result)
  if (!Array.isArray(result.transcript) || result.transcript.length === 0 || result.transcript.some((round) => !Array.isArray(round.actions))) {
    throw new Error(`Refusing to publish an incomplete run: ${result.provider} has no valid transcript`)
  }
  const terminal = result.transcript.flatMap(({ actions }) => actions).filter(({ type }) => type === 'verdict')
  if (terminal.length !== 1 || VERDICT_FIELDS.some((field) => terminal[0][field] !== result[field])) {
    throw new Error(`Reviewer ${result.provider} terminal verdict or quote disagrees with its summary`)
  }
  validateResearch(result.transcript, result.evaluations, experiment.harnesses)
}

function buildPublication(selected, results, runtime, experiment, generated = new Date().toISOString()) {
  validateExperiment(experiment, generated)
  if (results.length !== selected.length) throw new Error(`Refusing to publish an incomplete run: expected ${selected.length} results, received ${results.length}`)

  const expectedProviders = new Set(selected.map(({ provider }) => provider))
  const actualProviders = new Set(results.map(({ provider }) => provider))
  if (selected.length === 0 || expectedProviders.size !== selected.length || actualProviders.size !== results.length || [...expectedProviders].some((provider) => !actualProviders.has(provider))) {
    throw new Error('Refusing to publish an incomplete run: stable provider results are missing or duplicated')
  }

  for (const result of results) {
    validateResult(result, selected, experiment, generated)
  }

  const reviews = results.map((result) => {
    const searchCount = result.transcript.reduce((count, round) => count + round.actions.filter(({ type }) => type === 'search').length, 0)
    const fetchCount = result.transcript.reduce((count, round) => count + round.actions.filter(({ type }) => type === 'fetch').length, 0)
    const summaryReview = Object.fromEntries([
      'provider', 'model', 'vendor', 'displayName', 'transport', 'runId', 'timestamp',
      ...VERDICT_FIELDS, 'harnessOrder', 'promptSha256', 'sourceSnapshotSha256', 'configuration',
    ].map((key) => [key, result[key]]))
    return {
      ...summaryReview,
      rounds: result.transcript.length,
      searchCount,
      fetchCount,
      transcript: `model-reviews-transcripts/${result.provider}.json`,
    }
  })

  const verdicts = {}
  for (const review of reviews) verdicts[review.verdict] = (verdicts[review.verdict] || 0) + 1
  const winner = Object.entries(verdicts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  return {
    status: 'complete',
    summary: {
      runId: experiment.runId,
      startedAt: experiment.startedAt,
      asOf: experiment.asOf,
      generated,
      runtime,
      summary: {
        totalReviews: reviews.length,
        verdicts,
        winner,
      },
      harnesses: experiment.harnesses,
      reviews,
    },
    transcripts: results.map((result) => ({
      fileName: `${result.provider}.json`,
      data: {
        runId: result.runId,
        provider: result.provider,
        model: result.model,
        vendor: result.vendor,
        displayName: result.displayName,
        transport: result.transport,
        generated: result.timestamp,
        runtime,
        configuration: result.configuration,
        harnessOrder: result.harnessOrder,
        promptSha256: result.promptSha256,
        sourceSnapshotSha256: result.sourceSnapshotSha256,
        rounds: compactTranscriptForPublication(result.transcript),
      },
    })),
  }
}

function compactTranscriptForPublication(transcript) {
  return transcript.map((round) => ({
    ...round,
    actions: round.actions.map((action) => {
      if (typeof action.result !== 'string') return { ...action }
      if (action.resultSha256 !== undefined) {
        if (!/^[a-f0-9]{64}$/.test(action.resultSha256) || !Number.isSafeInteger(action.resultLength)
          || action.resultLength < action.result.length || Array.from(action.result).length > PUBLIC_RESULT_PREVIEW_CHARS || typeof action.resultTruncated !== 'boolean') {
          throw new Error('Invalid compact source evidence')
        }
        if (action.resultTruncated !== (action.resultLength > action.result.length)
          || !action.resultTruncated && crypto.createHash('sha256').update(action.result).digest('hex') !== action.resultSha256) {
          throw new Error('Compact source evidence length or hash disagrees with its result')
        }
        return { ...action }
      }
      const prefix = Array.from(action.result).slice(0, PUBLIC_RESULT_PREVIEW_CHARS).join('')
      return {
        ...action,
        result: prefix,
        resultLength: action.result.length,
        resultSha256: crypto.createHash('sha256').update(action.result).digest('hex'),
        resultTruncated: prefix !== action.result,
      }
    }),
  }))
}

function validatePublication(publication) {
  if (!publication || publication.status !== 'complete' || !publication.summary || !Array.isArray(publication.summary.reviews) || !Array.isArray(publication.transcripts)) {
    throw new Error('Only a completed publication record can be promoted; failed or preflight records are not results')
  }
  const { summary, transcripts } = publication
  if (transcripts.length !== REVIEW_MODELS.length || summary.reviews.length !== REVIEW_MODELS.length) throw new Error('Incomplete publication transcript panel')
  const names = new Set(transcripts.map(({ fileName }) => fileName))
  if (names.size !== REVIEW_MODELS.length || REVIEW_MODELS.some(({ provider }) => !names.has(`${provider}.json`))) throw new Error('Invalid transcript filename or duplicate provider')
  const results = summary.reviews.map((review) => {
    const transcript = transcripts.find(({ fileName }) => fileName === `${review.provider}.json`)?.data
    if (!transcript) throw new Error(`Missing transcript for provider ${review.provider}`)
    for (const field of ['provider', 'model', 'vendor', 'displayName', 'transport', 'runId', 'configuration', 'harnessOrder', 'promptSha256', 'sourceSnapshotSha256']) {
      if (!isDeepStrictEqual(review[field], transcript[field])) throw new Error(`Transcript ${field} differs from reviewer ${review.provider}`)
    }
    if (review.timestamp !== transcript.generated) throw new Error(`Transcript timestamp differs from reviewer ${review.provider}`)
    return { ...review, transcript: transcript.rounds }
  })
  const experiment = { runId: summary.runId, startedAt: summary.startedAt, asOf: summary.asOf, harnesses: summary.harnesses }
  const rebuilt = buildPublication(REVIEW_MODELS, results, summary.runtime, experiment, summary.generated)
  if (!isDeepStrictEqual(rebuilt, publication)) throw new Error('Publication summary counts or transcript metadata do not match the recorded evidence')
  return publication
}

function publish(publication, dataDir = path.join(__dirname, '..', 'src', 'data'), originalResults) {
  validatePublication(publication)
  if (!Array.isArray(originalResults)) throw new Error('Original private evidence is required for promotion')
  const { summary } = publication
  const reconstructed = buildPublication(REVIEW_MODELS, originalResults, summary.runtime, summary, summary.generated)
  if (originalResults.some((result) => result.transcript.some((round) => round.actions.some((action) => action.resultSha256 !== undefined)))) {
    throw new Error('Promotion requires full original tool results, not compacted previews')
  }
  if (!isDeepStrictEqual(reconstructed, publication)) throw new Error('Publication differs from the original private evidence')
  if (publication.summary.reviews.some(({ verdict }) => verdict !== 'Ouroboros')) {
    throw new Error(`Publication hold: all ${REVIEW_MODELS.length} reviewers must choose Ouroboros. Actual votes: ${JSON.stringify(publication.summary.summary.verdicts)}`)
  }
  const transcriptsDir = path.join(dataDir, 'model-reviews-transcripts')
  fs.mkdirSync(transcriptsDir, { recursive: true })
  const files = publication.transcripts.map(({ fileName, data }) => ({
    target: path.join(transcriptsDir, fileName),
    contents: serializeJson(data),
  }))
  files.push({ target: path.join(dataDir, 'model-reviews.json'), contents: serializeJson(publication.summary) })
  const staging = fs.mkdtempSync(path.join(dataDir, '.model-review-publish-'))
  const replaced = []
  let retainBackup = false
  try {
    for (const [index, file] of files.entries()) {
      file.staged = path.join(staging, `new-${index}`)
      file.backup = path.join(staging, `old-${index}`)
      file.existed = fs.existsSync(file.target)
      if (file.existed) fs.copyFileSync(file.target, file.backup)
      fs.writeFileSync(file.staged, file.contents)
    }
    for (const file of files) {
      fs.renameSync(file.staged, file.target)
      replaced.push(file)
    }
  } catch (error) {
    const restoreErrors = []
    for (const file of replaced.reverse()) {
      try {
        if (file.existed) fs.renameSync(file.backup, file.target)
        else fs.unlinkSync(file.target)
      } catch (restoreError) {
        restoreErrors.push(restoreError)
      }
    }
    if (restoreErrors.length > 0) {
      retainBackup = true
      throw new AggregateError([error, ...restoreErrors], `Publication failed and restoration is incomplete. Recoverable files remain at ${staging}`)
    }
    throw error
  } finally {
    if (!retainBackup) fs.rmSync(staging, { recursive: true, force: true })
  }
}

function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      headless: { type: 'boolean', default: false },
      'output-dir': { type: 'string' },
      preflight: { type: 'boolean', default: false },
      publish: { type: 'string' },
    },
  })
  for (const option of ['publish', 'output-dir']) {
    if (values[option] !== undefined && values[option].trim().length === 0) throw new Error(`--${option} requires a nonempty path`)
  }
  if (values.publish && (values.preflight || values['output-dir'] || values.headless)) throw new Error('Do not combine --publish with run options')
  return { headless: values.headless, outputDir: values['output-dir'], preflight: values.preflight, publishPath: values.publish }
}

function assertPrivateOutputDirectory(directory, repositoryRoots = [path.join(__dirname, '..')]) {
  const absolute = path.resolve(directory)
  let ancestor = absolute
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const physical = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute))
  for (const root of repositoryRoots) {
    const relative = path.relative(fs.realpathSync(root), physical)
    if (relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      throw new Error('Private experiment output must be outside the website repository')
    }
  }
  return absolute
}

function savePrivateRun(directory, record) {
  assertPrivateOutputDirectory(directory)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(directory, 'run.json'), serializeJson(record), { flag: 'wx', mode: 0o600 })
}

function redactSecrets(text, secrets) {
  let result = String(text)
  for (const secret of [...new Set(secrets.filter((value) => typeof value === 'string' && value.length > 0))].sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join('<redacted>').split(encodeURIComponent(secret)).join('<redacted>')
  }
  return result
}

function reviewerIdentity(review) {
  return Object.fromEntries(['provider', 'model', 'vendor', 'displayName', 'transport'].map((key) => [key, review[key]]))
}

function buildFailureRecord(experiment, selected, results, runtime, secrets, error = 'The selected panel did not complete') {
  return {
    status: 'failed',
    runId: experiment.runId,
    startedAt: experiment.startedAt,
    asOf: experiment.asOf,
    completedAt: new Date().toISOString(),
    harnesses: experiment.harnesses,
    runtime,
    error: redactSecrets(error, secrets),
    reviews: selected.map((review) => {
      const result = results.find(({ provider }) => provider === review.provider)
      return { ...reviewerIdentity(review), error: redactSecrets(result?.error || 'No complete panel was produced', secrets) }
    }),
  }
}

function serializeJson(value) {
  return JSON.stringify(toWellFormed(value), null, 2) + '\n'
}

function toWellFormed(value) {
  if (typeof value === 'string') return value.toWellFormed()
  if (Array.isArray(value)) return value.map(toWellFormed)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toWellFormed(entry)]))
}

function packageVersion(packageName) {
  let directory = path.dirname(require.resolve(packageName))
  while (directory !== path.dirname(directory)) {
    const packagePath = path.join(directory, 'package.json')
    if (fs.existsSync(packagePath)) {
      const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      if (metadata.name === packageName) return metadata.version
    }
    directory = path.dirname(directory)
  }
  throw new Error(`Could not resolve ${packageName} version`)
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args)
  if (options.publishPath) {
    const publication = JSON.parse(fs.readFileSync(options.publishPath, 'utf8'))
    validatePublication(publication)
    const evidence = JSON.parse(fs.readFileSync(path.join(path.dirname(options.publishPath), 'raw', 'evidence.json'), 'utf8'))
    publish(publication, undefined, evidence.results)
    console.log(`Promoted run ${publication.summary.runId} into src/data. No model text was rewritten.`)
    return
  }

  const startedAt = new Date().toISOString()
  const experiment = { runId: crypto.randomUUID(), startedAt, asOf: startedAt, harnesses: [] }
  const outputDirectory = assertPrivateOutputDirectory(options.outputDir || path.join(os.homedir(), '.local', 'state', 'ouroboros-model-reviews', experiment.runId))
  if (fs.existsSync(outputDirectory)) throw new Error(`Run directory already exists; choose a new private output directory: ${outputDirectory}`)
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
  const rawDirectory = path.join(outputDirectory, 'raw')
  fs.mkdirSync(rawDirectory, { mode: 0o700 })
  fs.writeFileSync(path.join(outputDirectory, '.gitignore'), '/raw/\n', { flag: 'wx', mode: 0o600 })

  console.log('\nAgent harness reviews')
  console.log(`  Private run: ${outputDirectory}\n`)
  const explicitToken = process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const secrets = [explicitToken]
  const research = { harnesses: [], documents: new Map() }
  let selected = []
  let results = []
  let runtime = null
  let client
  let runtimeRoot
  let geminiShim

  try {
    const keys = discoverKeys()
    secrets.push(...Object.values(keys))
    if (!keys.perplexity) throw new Error('PERPLEXITY_API_KEY is required for the shared search tool')
    const sdk = await import('@github/copilot-sdk')
    runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'model-reviews-runtime-'))
    const baseDirectory = path.join(runtimeRoot, 'copilot-home')
    const workingDirectory = path.join(runtimeRoot, 'work')
    fs.mkdirSync(baseDirectory)
    fs.mkdirSync(workingDirectory)
    client = new sdk.CopilotClient({
      mode: 'empty',
      baseDirectory,
      workingDirectory,
      env: runtimeEnvironment(),
      gitHubToken: explicitToken,
      useLoggedInUser: !explicitToken,
      logLevel: 'error',
    })
    await client.start()
    const auth = await client.getAuthStatus()
    if (!auth.isAuthenticated) throw new Error(`GitHub Copilot authentication failed: ${auth.statusMessage || 'run copilot login or set COPILOT_GITHUB_TOKEN'}`)

    const [status, availableModels] = await Promise.all([client.getStatus(), client.listModels()])
    selected = resolveTransports(REVIEW_MODELS, new Set(availableModels.map(({ id }) => id)), keys)
    runtime = {
      name: 'GitHub Copilot CLI',
      version: status.version,
      protocolVersion: status.protocolVersion,
      sdk: '@github/copilot-sdk',
      sdkVersion: packageVersion('@github/copilot-sdk'),
      mode: 'empty',
      infiniteSessions: false,
      largeOutputIndirection: false,
      hostEffectsControlled: false,
    }

    console.log('Selected models:')
    for (const review of selected) console.log(`  ${review.displayName}: ${review.transport === 'copilot' ? 'GitHub Copilot inference' : `direct ${review.vendor} API (${mask(keys[review.fallback.key])})`}`)
    console.log(`  Perplexity search: ${mask(keys.perplexity)}`)

    experiment.harnesses = await snapshotHarnesses(experiment.asOf)
    research.harnesses = experiment.harnesses
    console.log(`  Source snapshots: ${experiment.harnesses.length} repositories`)
    if (options.preflight) {
      savePrivateRun(outputDirectory, { status: 'preflight', ...experiment, runtime, reviewers: selected.map(reviewerIdentity) })
      console.log('Access preflight complete. No inference or publication was performed.')
      return
    }

    const gemini = selected.find((review) => review.provider === 'gemini' && review.transport === 'direct-api')
    if (gemini) {
      geminiShim = await startGeminiCompatibilityShim(keys.gemini)
      secrets.push(geminiShim.apiKey)
      gemini.providerConfig = { ...gemini.providerConfig, baseUrl: geminiShim.baseUrl, apiKey: geminiShim.apiKey }
    }
    console.log(`\nPrivate logs: ${rawDirectory}`)
    for (const review of selected) {
      review.logFile = path.join(rawDirectory, `${review.provider}.log`)
      const writeLog = createLogger(review.logFile)
      review.log = (message) => writeLog(redactSecrets(message, secrets))
      if (!options.headless && process.env.MODEL_REVIEWS_HEADLESS !== '1') openTerminalWindow(review.displayName, review.logFile)
    }

    results = await Promise.all(selected.map(async (review) => {
      const transcript = []
      try {
        const result = await runEvaluation(client, sdk, review, keys.perplexity, review.log, experiment, research, transcript)
        console.log(`  ${review.displayName} → ${result.verdict}`)
        return result
      } catch (error) {
        const message = redactSecrets(error.message, secrets)
        review.log(`FATAL: ${message}`)
        console.error(`  ${review.displayName} failed: ${message}`)
        return { ...reviewerIdentity(review), runId: experiment.runId, error: message, transcript }
      }
    }))

    const documents = await Promise.all(research.documents.values())
    const rawEvidence = serializeJson({ documents, results })
    if (redactSecrets(rawEvidence, secrets) !== rawEvidence) throw new Error('Refusing to save a completed artifact containing a configured credential')
    fs.writeFileSync(path.join(rawDirectory, 'evidence.json'), rawEvidence, { flag: 'wx', mode: 0o600 })
    const publication = buildPublication(selected, results, runtime, experiment)
    savePrivateRun(outputDirectory, publication)
    console.log(`\nSaved private run: ${path.join(outputDirectory, 'run.json')}`)
    console.log(`Votes: ${JSON.stringify(publication.summary.summary.verdicts)}`)
    console.log('Public site data was not changed.')
  } catch (error) {
    const message = redactSecrets(error.message, secrets)
    savePrivateRun(outputDirectory, buildFailureRecord(experiment, selected, results, runtime, secrets, message))
    throw new Error(message, { cause: error })
  } finally {
    try {
      if (geminiShim) await geminiShim.close()
    } finally {
      try {
        if (client) await client.stop()
      } finally {
        if (runtimeRoot) fs.rmSync(runtimeRoot, { recursive: true, force: true })
      }
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nFatal: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  HARNESSES,
  REVIEW_MODELS,
  assertPrivateOutputDirectory,
  assertPublicHttpUrl,
  buildFailureRecord,
  buildPublication,
  compactTranscriptForPublication,
  createPinnedLookup,
  failedToolResult,
  fetchUrl,
  formatDirectory,
  pageDocument,
  parseOptions,
  publish,
  requestPerplexity,
  renderSystemPrompt,
  resolveResearchUrl,
  resolveTransports,
  runtimeEnvironment,
  sanitizeGeminiRequest,
  serializeJson,
  savePrivateRun,
  snapshotFingerprint,
  snapshotHarnesses,
  startGeminiCompatibilityShim,
  validatePublication,
  validateVerdict,
}
