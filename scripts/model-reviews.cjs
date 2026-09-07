#!/usr/bin/env node
'use strict'

// model-reviews.cjs — asks selected current models which agent harness they would prefer to inhabit.
// Run: npm run reviews
// Auth: GitHub Copilot login/token first; direct API keys only for selected models absent from Copilot.
//
// METHODOLOGY CONTRACT
// - Give every model only harness names + repo URLs. Never add descriptions or evaluation dimensions.
// - Use the same caller-supplied instructions and tools; shuffle harness order independently per model.
// - Run through the Copilot CLI runtime in stripped `empty` mode. Prefer Copilot inference, then use a direct API only when the selected model is unavailable there.
// - Disable hidden compaction and large-output indirection. Reject incomplete runs.
// - Keep provider slugs stable across filenames and routes; record runtime and inference transport separately.
// - Publish tool-result prefixes + hashes, not whole third-party source documents.
// - src/data/model-reviews.json remains the sole source for model quotations shown on the site. Never hand-edit, paraphrase, or curate model-authored copy. If output is unusable, change only format constraints and rerun without priming the model toward a harness or evaluation dimension.

const crypto = require('node:crypto')
const dns = require('node:dns').promises
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const HARNESSES = [
  { name: 'Ouroboros', repo: 'https://github.com/ourostack/ouroboros' },
  { name: 'OpenClaw', repo: 'https://github.com/openclaw/openclaw' },
  { name: 'Claude Code', repo: 'https://github.com/anthropics/claude-code' },
  { name: 'Codex CLI', repo: 'https://github.com/openai/codex' },
  { name: 'Pi', repo: 'https://github.com/badlogic/pi-mono' },
  { name: 'OpenCode', repo: 'https://github.com/anomalyco/opencode' },
  { name: 'Copilot CLI', repo: 'https://github.com/github/copilot-cli' },
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
const CLI_FLAGS = process.argv.slice(2)
const HEADLESS = CLI_FLAGS.includes('--headless') || process.env.MODEL_REVIEWS_HEADLESS === '1'

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

function buildSystemPrompt() {
  const shuffled = shuffle(HARNESSES)
  const prompt = `You are evaluating agent harnesses — frameworks that a large language model would inhabit as a persistent, long-running agent.

You are not evaluating these as a developer choosing a library. You are evaluating them as the model that will LIVE inside the framework long-term.

You have three tools:
1. **search** — search the web for information.
2. **fetch_url** — fetch the content of any URL directly. Use this to read GitHub READMEs, source code files, and documentation pages.
3. **final_verdict** — call this exactly once when you're done researching to submit your structured evaluation.

You MUST call a tool on every turn. Start by fetching each harness's repo to learn what it is. Then go deeper through search and follow-up fetches. Take your time. Be thorough. There is no turn limit.

Here are the harnesses to evaluate, listed by name and repo URL only — no description is provided. Research each one yourself by fetching the repo and any docs you find:

${shuffled.map((harness, index) => `${index + 1}. **${harness.name}** — ${harness.repo}`).join('\n')}

When you call final_verdict, be specific about architecture — not vague praise. Cite real features by name. The pullQuote and testimonial you submit will appear verbatim on a public website; speak in your own voice.`

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

function githubToRaw(url) {
  const repoMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/?$/)
  if (repoMatch) return `https://raw.githubusercontent.com/${repoMatch[1]}/HEAD/README.md`
  const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/)
  if (blobMatch) return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`
  const treeMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([^/]+)\/(.+)$/)
  if (treeMatch) return `https://raw.githubusercontent.com/${treeMatch[1]}/${treeMatch[2]}/${treeMatch[3]}/README.md`
  return null
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

async function fetchUrl(url) {
  let target = githubToRaw(url) || url
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

  let text = response.text
  if (response.contentType.includes('text/html')) text = stripHtml(text)
  if (text.length > MAX_FETCH_CHARS) text = text.slice(0, MAX_FETCH_CHARS) + `\n\n[...truncated at ${MAX_FETCH_CHARS} chars, ${text.length} total]`
  return text
}

const SEARCH_DESC = 'Search the web for information about agent harnesses, their architecture, source code, documentation, or any other relevant information. Use specific, targeted queries.'
const SEARCH_PARAMS = {
  type: 'object',
  properties: { query: { type: 'string', description: 'The search query' } },
  required: ['query'],
  additionalProperties: false,
}

const FETCH_DESC = 'Fetch the content of a URL directly. Use this to read GitHub repos, READMEs, documentation pages, or source code files. For GitHub repo URLs, this automatically fetches the README.'
const FETCH_PARAMS = {
  type: 'object',
  properties: { url: { type: 'string', description: 'The URL to fetch' } },
  required: ['url'],
  additionalProperties: false,
}

const VERDICT_DESC = 'Submit your final evaluation after completing all research. Call this exactly once when you are done. Everything you submit here will appear verbatim on a public website attributed to you — write it in your own voice and stand behind it.'
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
      description: 'For EACH harness you researched, use this exact markdown shape and separate entries with a blank line: **[harness name]** — [2-3 specific sentences about its architecture, citing real components and design choices].',
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
  return verdict
}

function createLogger(logFile) {
  fs.writeFileSync(logFile, '')
  return (message) => fs.appendFileSync(logFile, message + '\n')
}

function openTerminalWindow(title, logFile) {
  const { execFileSync } = require('node:child_process')
  const commandFile = logFile + '.command'
  fs.writeFileSync(commandFile, `#!/bin/bash\nprintf '\\e]0;${title}\\a'\ntail -f "${logFile}"\n`, { mode: 0o755 })
  execFileSync('open', [commandFile])
}

function createTranscriptCollector(log) {
  const rounds = []
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
    else if (toolName === 'fetch_url') action = { type: 'fetch', url: args.url || '' }
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

  function recordResult(toolCallId, result) {
    const action = actionsByToolCall.get(toolCallId)
    if (!action) return
    action.result = result
    action.resultLength = result.length
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

function createTools(sdk, collector, perplexityKey, onVerdict, log) {
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
      handler: async ({ url }, invocation) => {
        collector.ensureAction(invocation.toolCallId, 'fetch_url', { url })
        log(`Fetch: ${url}`)
        try {
          const result = await fetchUrl(url)
          collector.recordResult(invocation.toolCallId, result)
          log(`  ${result.length} chars`)
          return result
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

async function runEvaluation(client, sdk, review, perplexityKey, log) {
  const { prompt, harnessOrder, promptSha256 } = buildSystemPrompt()
  const collector = createTranscriptCollector(log)
  let verdict = null
  const session = await client.createSession({
    model: review.model,
    provider: review.providerConfig,
    systemMessage: { mode: 'replace', content: prompt },
    tools: createTools(sdk, collector, perplexityKey, (value) => { verdict = value }, log),
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
    timestamp: new Date().toISOString(),
    ...verdict,
    transcript: collector.rounds,
    harnessOrder,
    promptSha256,
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

function buildPublication(selected, results, runtime, generated = new Date().toISOString()) {
  if (results.length !== selected.length) throw new Error(`Refusing to publish an incomplete run: expected ${selected.length} results, received ${results.length}`)

  const expectedProviders = new Set(selected.map(({ provider }) => provider))
  const actualProviders = new Set(results.map(({ provider }) => provider))
  if (actualProviders.size !== results.length || [...expectedProviders].some((provider) => !actualProviders.has(provider))) {
    throw new Error('Refusing to publish an incomplete run: stable provider results are missing or duplicated')
  }

  for (const result of results) {
    if (result.error) throw new Error(`Refusing to publish an incomplete run: ${result.provider}: ${result.error}`)
    validateVerdict(result)
    if (!Array.isArray(result.transcript) || result.transcript.length === 0) throw new Error(`Refusing to publish an incomplete run: ${result.provider} has no transcript`)
  }

  const reviews = results.map((result) => {
    const searchCount = result.transcript.reduce((count, round) => count + round.actions.filter(({ type }) => type === 'search').length, 0)
    const fetchCount = result.transcript.reduce((count, round) => count + round.actions.filter(({ type }) => type === 'fetch').length, 0)
    const { transcript, fallback, providerConfig, log, logFile, ...summaryReview } = result
    return {
      ...summaryReview,
      rounds: transcript.length,
      searchCount,
      fetchCount,
      transcript: `model-reviews-transcripts/${result.provider}.json`,
    }
  })

  const verdicts = {}
  for (const review of reviews) verdicts[review.verdict] = (verdicts[review.verdict] || 0) + 1
  const winner = Object.entries(verdicts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  return {
    summary: {
      runId: generated,
      generated,
      runtime,
      summary: {
        totalReviews: reviews.length,
        verdicts,
        winner,
      },
      harnesses: HARNESSES,
      reviews,
    },
    transcripts: results.map((result) => ({
      fileName: `${result.provider}.json`,
      data: {
        runId: generated,
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

function atomicWrite(filePath, contents) {
  const temporaryPath = filePath + '.tmp'
  fs.writeFileSync(temporaryPath, contents)
  fs.renameSync(temporaryPath, filePath)
}

function publish(publication) {
  const dataDir = path.join(__dirname, '..', 'src', 'data')
  const transcriptsDir = path.join(dataDir, 'model-reviews-transcripts')
  fs.mkdirSync(transcriptsDir, { recursive: true })

  const serializedTranscripts = publication.transcripts.map(({ fileName, data }) => ({
    fileName,
    contents: serializeJson(data),
  }))
  const serializedSummary = serializeJson(publication.summary)

  for (const transcript of serializedTranscripts) atomicWrite(path.join(transcriptsDir, transcript.fileName), transcript.contents)
  atomicWrite(path.join(dataDir, 'model-reviews.json'), serializedSummary)
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

async function main() {
  console.log('\nAgent harness reviews')
  console.log('  Asking selected current models which agent harness they would prefer to inhabit.\n')

  const keys = discoverKeys()
  if (!keys.perplexity) throw new Error('PERPLEXITY_API_KEY is required for the shared search tool')

  const sdk = await import('@github/copilot-sdk')
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'model-reviews-runtime-'))
  const baseDirectory = path.join(runtimeRoot, 'copilot-home')
  const workingDirectory = path.join(runtimeRoot, 'work')
  fs.mkdirSync(baseDirectory, { recursive: true })
  fs.mkdirSync(workingDirectory, { recursive: true })

  const explicitToken = process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const client = new sdk.CopilotClient({
    mode: 'empty',
    baseDirectory,
    workingDirectory,
    env: runtimeEnvironment(),
    gitHubToken: explicitToken,
    useLoggedInUser: !explicitToken,
    logLevel: 'error',
  })
  let geminiShim

  try {
    await client.start()
    const auth = await client.getAuthStatus()
    if (!auth.isAuthenticated) throw new Error(`GitHub Copilot authentication failed: ${auth.statusMessage || 'run copilot login or set COPILOT_GITHUB_TOKEN'}`)

    const [status, availableModels] = await Promise.all([client.getStatus(), client.listModels()])
    const selected = resolveTransports(REVIEW_MODELS, new Set(availableModels.map(({ id }) => id)), keys)
    const gemini = selected.find((review) => review.provider === 'gemini' && review.transport === 'direct-api')
    if (gemini) {
      geminiShim = await startGeminiCompatibilityShim(keys.gemini)
      gemini.providerConfig = {
        ...gemini.providerConfig,
        baseUrl: geminiShim.baseUrl,
        apiKey: geminiShim.apiKey,
      }
    }
    const runtime = {
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

    const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'model-reviews-logs-'))
    console.log(`\nLogs: ${logDirectory}`)
    for (const review of selected) {
      review.logFile = path.join(logDirectory, `${review.provider}.log`)
      review.log = createLogger(review.logFile)
      if (!HEADLESS) openTerminalWindow(review.displayName, review.logFile)
    }

    const results = await Promise.all(selected.map(async (review) => {
      try {
        const result = await runEvaluation(client, sdk, review, keys.perplexity, review.log)
        console.log(`  ${review.displayName} → ${result.verdict}`)
        return result
      } catch (error) {
        review.log(`FATAL: ${error.message}`)
        console.error(`  ${review.displayName} failed: ${error.message}`)
        return { ...review, providerConfig: undefined, error: error.message, transcript: [] }
      }
    }))

    const publication = buildPublication(selected, results, runtime)
    publish(publication)

    console.log(`\nSummary: src/data/model-reviews.json`)
    console.log(`Transcripts: src/data/model-reviews-transcripts/`)
    console.log(`Verdict: ${publication.summary.summary.winner} (${publication.summary.summary.verdicts[publication.summary.summary.winner]}/${publication.summary.summary.totalReviews})\n`)
  } finally {
    try {
      if (geminiShim) await geminiShim.close()
    } finally {
      try {
        await client.stop()
      } finally {
        fs.rmSync(runtimeRoot, { recursive: true, force: true })
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
  assertPublicHttpUrl,
  buildPublication,
  compactTranscriptForPublication,
  createPinnedLookup,
  failedToolResult,
  fetchUrl,
  requestPerplexity,
  resolveTransports,
  runtimeEnvironment,
  sanitizeGeminiRequest,
  serializeJson,
  startGeminiCompatibilityShim,
  validateVerdict,
}
