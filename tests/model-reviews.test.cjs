'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  HARNESSES,
  assertPublicHttpUrl,
  compactTranscriptForPublication,
  createPinnedLookup,
  failedToolResult,
  requestPerplexity,
  resolveTransports,
  runtimeEnvironment,
  sanitizeGeminiRequest,
  serializeJson,
  startGeminiCompatibilityShim,
  validateVerdict,
} = require('../scripts/model-reviews.cjs')

const reviews = [
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    vendor: 'Anthropic',
    displayName: 'Claude Opus 5',
    fallback: { key: 'anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    vendor: 'Google',
    displayName: 'Gemini 3.8 Flash',
    fallback: { key: 'gemini', type: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  },
]

function validVerdict(winner = 'Ouroboros') {
  return {
    verdict: winner,
    pullQuote: `${winner} feels like a home, not a terminal.`,
    testimonial: `${winner} gives me named architectural places to persist and recover. I would accept its extra structure over a thinner coding shell.`,
    evaluations: HARNESSES.map(({ name, repo }) => `**${name}** — Specific architectural evaluation with a [source](${repo}).`).join('\n\n'),
  }
}

test('prefers Copilot and falls back only for a missing catalog model', () => {
  const resolved = resolveTransports(reviews, new Set(['claude-opus-5']), {
    anthropic: null,
    gemini: 'gemini-key',
  }, 'copilot-first')

  assert.equal(resolved[0].provider, 'anthropic')
  assert.equal(resolved[0].transport, 'copilot')
  assert.equal(resolved[0].providerConfig, undefined)

  assert.equal(resolved[1].provider, 'gemini')
  assert.equal(resolved[1].transport, 'direct-api')
  assert.deepEqual(resolved[1].providerConfig, {
    type: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: 'gemini-key',
    wireApi: 'completions',
  })
})

test('rejects a model absent from Copilot when no fallback key exists', () => {
  assert.throws(
    () => resolveTransports(reviews, new Set(['claude-opus-5']), { anthropic: null, gemini: null }, 'copilot-first'),
    /gemini-3\.8-flash.*GEMINI_API_KEY/,
  )
})

test('direct API inference ignores Copilot catalog availability and preserves vendor configuration', () => {
  const keys = { anthropic: 'anthropic-key', gemini: 'gemini-key' }
  const catalog = new Set(reviews.map(({ model }) => model))
  for (const mode of [undefined, 'direct-api']) {
    const resolved = resolveTransports(reviews, catalog, keys, mode)
    assert.ok(resolved.every(({ transport }) => transport === 'direct-api'))
    assert.deepEqual(resolved[0].providerConfig, { type: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'anthropic-key' })
    assert.equal(resolved[1].providerConfig.wireApi, 'completions')
    assert.equal(resolved[1].providerConfig.apiKey, 'gemini-key')
  }
})

test('direct API inference requires vendor keys even when Copilot could serve the model', () => {
  assert.throws(
    () => resolveTransports(reviews, new Set(reviews.map(({ model }) => model)), { anthropic: null, gemini: 'gemini-key' }, 'direct-api'),
    /claude-opus-5.*ANTHROPIC_API_KEY/,
  )
})

test('validates the terminal verdict without rewriting model-authored text', () => {
  const verdict = validVerdict()
  assert.equal(validateVerdict(verdict), verdict)
  assert.throws(() => validateVerdict({ ...verdict, verdict: 'Unknown Harness' }), /known harness/)
  assert.throws(
    () => validateVerdict({ ...verdict, evaluations: '**Ouroboros** — Only one.' }),
    /evaluation for OpenClaw/,
  )
})

test('publishes exact Unicode-safe tool-result prefixes, model-visible lengths, and hashes', () => {
  const source = `${'x'.repeat(499)}😀${'y'.repeat(200)}`
  const transcript = [{ round: 1, thinking: '', actions: [{ type: 'fetch', url: 'https://example.com', result: source, resultLength: source.length }] }]
  const compacted = compactTranscriptForPublication(transcript)

  assert.equal(Array.from(compacted[0].actions[0].result).length, 500)
  assert.equal(compacted[0].actions[0].result.endsWith('😀'), true)
  assert.equal(compacted[0].actions[0].resultLength, source.length)
  assert.equal(compacted[0].actions[0].resultTruncated, true)
  assert.match(compacted[0].actions[0].resultSha256, /^[a-f0-9]{64}$/)
  assert.equal(transcript[0].actions[0].result, source)
})

test('serializes unpaired external Unicode as a well-formed replacement character', () => {
  const serialized = serializeJson({ external: '\uD800' })

  assert.equal(JSON.parse(serialized).external, '\uFFFD')
  assert.doesNotMatch(serialized, /\\ud800/i)
})

test('records the same failed-tool text shown to the model', () => {
  assert.equal(failedToolResult('search', new Error('rate limited')), 'Search failed: rate limited')
  assert.equal(failedToolResult('fetch', new Error('404')), 'Fetch failed: 404')
})

test('strips only the Copilot extension field rejected by Gemini', () => {
  const thoughtSignature = { google: { thought_signature: 'keep-me' } }
  const request = {
    model: 'gemini-3.8-flash',
    snippy: { enabled: false },
    messages: [{ role: 'assistant', tool_calls: [{ extra_content: thoughtSignature }] }],
  }

  assert.deepEqual(sanitizeGeminiRequest(request), {
    model: 'gemini-3.8-flash',
    messages: [{ role: 'assistant', tool_calls: [{ extra_content: thoughtSignature }] }],
  })
  assert.ok('snippy' in request)
})

test('retries a rate-limited Perplexity request using Retry-After', async () => {
  const responses = [
    {
      ok: false,
      status: 429,
      headers: { get: () => '0' },
      text: async () => 'rate limited',
    },
    {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'search result' } }] }),
    },
  ]
  let calls = 0

  const result = await requestPerplexity(
    'query',
    'key',
    async () => {
      calls++
      return responses.shift()
    },
    async () => {},
  )

  assert.equal(result, 'search result')
  assert.equal(calls, 2)
})

test('backs off when a rate-limited Perplexity response omits Retry-After', async () => {
  const delays = []
  const responses = [
    {
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => 'rate limited',
    },
    {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'search result' } }] }),
    },
  ]

  await requestPerplexity('query', 'key', async () => responses.shift(), async (milliseconds) => delays.push(milliseconds))

  assert.deepEqual(delays, [2000])
})

test('keeps the Gemini shim loopback-authenticated and strips the extension before forwarding', async () => {
  let forwarded
  const shim = await startGeminiCompatibilityShim('upstream-key', async (_url, options) => {
    forwarded = JSON.parse(options.body)
    return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  try {
    const unauthorized = await fetch(`${shim.baseUrl}chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippy: { enabled: false } }),
    })
    assert.equal(unauthorized.status, 401)

    const authorized = await fetch(`${shim.baseUrl}chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${shim.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippy: { enabled: false }, messages: [{ extra_content: { google: { thought_signature: 'keep' } } }] }),
    })
    assert.equal(authorized.status, 200)
    assert.deepEqual(forwarded, { messages: [{ extra_content: { google: { thought_signature: 'keep' } } }] })
  } finally {
    await shim.close()
  }
})

test('rejects model-selected private and loopback fetch targets', async () => {
  await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1/admin'), /private or reserved/)
  await assert.rejects(
    () => assertPublicHttpUrl('https://metadata.example.test/', async () => [{ address: '169.254.169.254', family: 4 }]),
    /private or reserved/,
  )
  await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), /HTTP\(S\)/)
})

test('allows a public model-selected fetch target', async () => {
  const url = await assertPublicHttpUrl('https://docs.example.test/path', async () => [{ address: '93.184.216.34', family: 4 }])
  assert.equal(url.href, 'https://docs.example.test/path')
})

test('pins the validated address for the actual HTTP connection', async () => {
  const lookup = createPinnedLookup([{ address: '93.184.216.34', family: 4 }])
  const resolved = await new Promise((resolve, reject) => {
    lookup('docs.example.test', {}, (error, address, family) => error ? reject(error) : resolve({ address, family }))
  })
  assert.deepEqual(resolved, { address: '93.184.216.34', family: 4 })

  const all = await new Promise((resolve, reject) => {
    lookup('docs.example.test', { all: true }, (error, addresses) => error ? reject(error) : resolve(addresses))
  })
  assert.deepEqual(all, [{ address: '93.184.216.34', family: 4 }])
})

test('does not pass provider or search keys into the Copilot runtime process', () => {
  const env = runtimeEnvironment({
    PATH: '/usr/bin',
    COPILOT_GITHUB_TOKEN: 'copilot',
    ANTHROPIC_API_KEY: 'anthropic',
    OPENAI_API_KEY: 'openai',
    GEMINI_API_KEY: 'gemini',
    GOOGLE_API_KEY: 'google',
    MINIMAX_API_KEY: 'minimax',
    PERPLEXITY_API_KEY: 'perplexity',
  })

  assert.deepEqual(env, { PATH: '/usr/bin' })
})
