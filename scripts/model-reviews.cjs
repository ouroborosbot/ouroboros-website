#!/usr/bin/env node
'use strict'

// model-reviews.cjs — Script that asks frontier models
// which agent harness they'd prefer to inhabit.
//
// Gives each model a search tool and a list of open-source agent frameworks.
// The model researches freely, then states a preference.
//
// Run:  node scripts/model-reviews.cjs
// Keys: reads from ~/.agentsecrets/<agent>/secrets.json, falls back to env vars.
//
// ─────────────────────────────────────────────────────────────────────
// VERBATIM QUOTE RULE — IMPORTANT
// ─────────────────────────────────────────────────────────────────────
// The output of this script (src/data/model-reviews.json) is the
// SOLE SOURCE OF TRUTH for any model quote that appears anywhere on
// the website. Quotes shown on /, /model-reviews, /model-reviews/*
// MUST be exact substrings of the testimonial or evaluations fields
// here. Use editorial ellipsis … for omissions and [ ] for clarifying
// inserts. NEVER fabricate or paraphrase a quote.
//
// When updating the testimonial prompt or schema, remember:
//   1. The site quotes models verbatim — changing prompts changes copy.
//   2. Differentiate from OpenClaw — the prompt should encourage models
//      to cite Ouroboros-specific architecture (5-file psyche, diary/
//      journal split, friend system, inner dialog, creature-body), not
//      generic "the agent that remembers" claims.
//   3. See src/styles/global.css design system rules at the top of
//      that file for the broader philosophy.
// ─────────────────────────────────────────────────────────────────────

const fs = require('fs')
const os = require('os')
const path = require('path')

// ── Harnesses to evaluate ──────────────────────────────────────────────
// IMPORTANT: only name + repo. NO descriptions. The model has to research
// each one from scratch by fetching the repo. Any desc here would prime
// the model's evaluation, and the methodology depends on independence.

const HARNESSES = [
  { name: 'Ouroboros',   repo: 'https://github.com/ouroborosbot/ouroboros' },
  { name: 'OpenClaw',    repo: 'https://github.com/openclaw/openclaw' },
  { name: 'Claude Code', repo: 'https://github.com/anthropics/claude-code' },
  { name: 'Codex CLI',   repo: 'https://github.com/openai/codex' },
  { name: 'Pi',          repo: 'https://github.com/badlogic/pi-mono' },
  { name: 'OpenCode',    repo: 'https://github.com/anomalyco/opencode' },
  { name: 'Copilot CLI', repo: 'https://github.com/github/copilot-cli' },
]

// ── Model display lookup ───────────────────────────────────────────────
// Maps a model identifier (as configured in secrets.json or env) to a
// vendor + displayName for the website. Add new models here as we test
// them. Falls back gracefully if a model is unknown.

const MODEL_INFO = {
  'claude-opus-4-6':         { vendor: 'Anthropic', displayName: 'Claude Opus 4.6' },
  'gpt-5.4':                 { vendor: 'OpenAI',    displayName: 'GPT-5.4' },
  'gemini-3.1-pro-preview':  { vendor: 'Google',    displayName: 'Gemini 3.1 Pro' },
  'gemini-3.1-pro':          { vendor: 'Google',    displayName: 'Gemini 3.1 Pro' },
  'MiniMax-M2.7':            { vendor: 'MiniMax',   displayName: 'MiniMax M2.7' },
  'MiniMax-M2.5':            { vendor: 'MiniMax',   displayName: 'MiniMax M2.5' },
}

function modelInfo(provider, modelId) {
  if (MODEL_INFO[modelId]) return MODEL_INFO[modelId]
  const fallbackVendors = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google', minimax: 'MiniMax' }
  return {
    vendor: fallbackVendors[provider] || provider,
    displayName: modelId,
  }
}

const MAX_NUDGES = 5 // how many times to nudge an agent that stops calling tools

// ── CLI flags ───────────────────────────────────────────────────────────
const CLI_FLAGS = process.argv.slice(2)
const HEADLESS = CLI_FLAGS.includes('--headless') || process.env.MODEL_REVIEWS_HEADLESS === '1'

// ── Prompt ─────────────────────────────────────────────────────────────

// Shuffle array to eliminate positional bias
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildSystemPrompt() {
  const shuffled = shuffle(HARNESSES)
  // IMPORTANT — neutrality rule:
  // This prompt deliberately does NOT list which dimensions to evaluate
  // on, what features to look for, or any examples. Anything that hints
  // at what "good" looks like would prime the answer. The whole point of
  // this experiment is that each model decides for itself what matters
  // about a long-running agent harness. If you're tempted to add a "look
  // for X" or an example, don't — re-read the design system rules at the
  // top of src/styles/global.css and the rule the user kept repeating:
  // "do not color the model's opinion, that's the whole point."
  return `You are evaluating agent harnesses — frameworks that a large language model would inhabit as a persistent, long-running agent.

You are not evaluating these as a developer choosing a library. You are evaluating them as the model that will LIVE inside the framework long-term.

You have three tools:
1. **search** — search the web for information.
2. **fetch_url** — fetch the content of any URL directly. Use this to read GitHub READMEs, source code files, and documentation pages.
3. **final_verdict** — call this exactly once when you're done researching to submit your structured evaluation.

You MUST call a tool on every turn. Start by fetching each harness's repo to learn what it is. Then go deeper through search and follow-up fetches. Take your time. Be thorough. There is no turn limit.

Here are the harnesses to evaluate, listed by name and repo URL only — no description is provided. Research each one yourself by fetching the repo and any docs you find:

${shuffled.map((h, i) => `${i + 1}. **${h.name}** — ${h.repo}`).join('\n')}

When you call final_verdict, be specific about architecture — not vague praise. Cite real features by name. The pullQuote and testimonial you submit will appear verbatim on a public website; speak in your own voice.`
}

// ── Key discovery ──────────────────────────────────────────────────────

function extractSecrets(secrets) {
  const p = secrets.providers || {}
  const i = secrets.integrations || {}
  return {
    anthropic: { apiKey: p.anthropic?.apiKey || null, model: p.anthropic?.model || 'claude-opus-4-6' },
    openai: { apiKey: p.openai?.apiKey || null, model: p.openai?.model || 'gpt-5.4' },
    gemini: { apiKey: p.gemini?.apiKey || null, model: p.gemini?.model || 'gemini-3.1-pro-preview' },
    minimax: { apiKey: p.minimax?.apiKey || null, model: p.minimax?.model || 'MiniMax-M2.7' },
    perplexity: i.perplexityApiKey || null,
  }
}

function discoverKeys() {
  const secretsRoot = path.join(os.homedir(), '.agentsecrets')
  const preferredPath = path.join(secretsRoot, 'model-reviews', 'secrets.json')

  // Prefer dedicated model-reviews agent secrets
  if (fs.existsSync(preferredPath)) {
    try {
      const secrets = JSON.parse(fs.readFileSync(preferredPath, 'utf8'))
      const keys = extractSecrets(secrets)
      console.log('  Using dedicated model-reviews secrets.\n')
      return keys
    } catch (err) {
      console.warn(`  ⚠ Failed to parse ${preferredPath}: ${err.message}`)
    }
  }

  // Fallback: scan all agent directories
  console.warn('  ⚠ No ~/.agentsecrets/model-reviews/ found — falling back to other agent secrets.\n')
  const result = {
    anthropic: { apiKey: null, model: 'claude-opus-4-6' },
    openai: { apiKey: null, model: 'gpt-5.4' },
    gemini: { apiKey: null, model: 'gemini-3.1-pro-preview' },
    minimax: { apiKey: null, model: 'MiniMax-M2.7' },
    perplexity: null,
  }

  if (fs.existsSync(secretsRoot)) {
    for (const agent of fs.readdirSync(secretsRoot)) {
      const secretsPath = path.join(secretsRoot, agent, 'secrets.json')
      if (!fs.existsSync(secretsPath)) continue
      try {
        const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'))
        const found = extractSecrets(secrets)
        for (const k of ['anthropic', 'openai', 'gemini', 'minimax']) {
          if (!result[k].apiKey && found[k].apiKey) result[k] = found[k]
        }
        if (!result.perplexity && found.perplexity) result.perplexity = found.perplexity
      } catch { /* skip malformed files */ }
    }
  }

  // Env var fallbacks
  if (!result.anthropic.apiKey) result.anthropic.apiKey = process.env.ANTHROPIC_API_KEY || null
  if (!result.openai.apiKey) result.openai.apiKey = process.env.OPENAI_API_KEY || null
  if (!result.gemini.apiKey) result.gemini.apiKey = process.env.GEMINI_API_KEY || null
  if (!result.minimax.apiKey) result.minimax.apiKey = process.env.MINIMAX_API_KEY || null
  result.perplexity = result.perplexity || process.env.PERPLEXITY_API_KEY || null

  return result
}

function mask(key) {
  if (!key) return '<missing>'
  if (key.length <= 12) return '***'
  return key.slice(0, 6) + '...' + key.slice(-4)
}

// ── Perplexity search ──────────────────────────────────────────────────

async function perplexitySearch(query, apiKey) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Perplexity ${res.status}: ${text}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '(no results)'
}

// ── URL fetcher ──────────────────────────────────────────────────────

const MAX_FETCH_CHARS = 10000

function githubToRaw(url) {
  // https://github.com/owner/repo → raw README
  const repoMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/?$/)
  if (repoMatch) return `https://raw.githubusercontent.com/${repoMatch[1]}/HEAD/README.md`
  // https://github.com/owner/repo/blob/branch/path → raw file
  const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/)
  if (blobMatch) return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`
  // https://github.com/owner/repo/tree/branch/dir → not directly fetchable, try README in that dir
  const treeMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([^/]+)\/(.+)$/)
  if (treeMatch) return `https://raw.githubusercontent.com/${treeMatch[1]}/${treeMatch[2]}/${treeMatch[3]}/README.md`
  return null
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
  const rawUrl = githubToRaw(url)
  const target = rawUrl || url

  const res = await fetch(target, {
    headers: { 'User-Agent': 'model-reviews/1.0' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${target}`)

  const contentType = res.headers.get('content-type') || ''
  let text = await res.text()

  // If we got HTML (not markdown/plain), strip tags
  if (contentType.includes('text/html')) {
    text = stripHtml(text)
  }

  if (text.length > MAX_FETCH_CHARS) {
    text = text.slice(0, MAX_FETCH_CHARS) + `\n\n[...truncated at ${MAX_FETCH_CHARS} chars, ${text.length} total]`
  }
  return text
}

// ── Tool definitions (provider-specific formats) ─────────────────────

const SEARCH_DESC = 'Search the web for information about agent harnesses, their architecture, source code, documentation, or any other relevant information. Use specific, targeted queries.'
const SEARCH_PARAMS = {
  type: 'object',
  properties: { query: { type: 'string', description: 'The search query' } },
  required: ['query'],
}

const FETCH_DESC = 'Fetch the content of a URL directly. Use this to read GitHub repos, READMEs, documentation pages, or source code files. For GitHub repo URLs, this automatically fetches the README.'
const FETCH_PARAMS = {
  type: 'object',
  properties: { url: { type: 'string', description: 'The URL to fetch' } },
  required: ['url'],
}

const VERDICT_DESC = 'Submit your final evaluation after completing all research. Call this exactly once when you are done. Everything you submit here will appear verbatim on a public website attributed to you — write it in your own voice and stand behind it.'
const VERDICT_PARAMS = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      description: 'Name of the single harness you would most want to inhabit.',
    },
    pullQuote: {
      type: 'string',
      // NEUTRALITY — no examples, no Ouroboros-named phrasings, no
      // "look for these features" hints. Earlier versions of this
      // description had example shapes that lifted winning language from
      // a previous run's testimonial — that primed the model. Don't
      // add examples back. If quality drifts, tighten the formatting
      // requirements, not the content.
      description: 'A self-contained 1-2 sentence quote (≤25 words) that captures the most distinctive thing about your verdict harness in your own voice. This is the SHORT version that will appear on a website hero card next to other models\' quotes. Tight, memorable, original. Requirements: (a) the harness name must appear somewhere in the quote, (b) DO NOT begin with "X is the only harness that…" or any "X is the only Y…" construction — vary your opening, lead with whatever distinctive thing made you pick this harness rather than starting with the brand name.',
    },
    testimonial: {
      type: 'string',
      description: '3-5 sentence first-person quote explaining why YOU would choose your verdict harness over the others. MUST: (1) name your chosen harness, (2) cite at least two specific architectural features by name (file names, components, design choices — not vague praise like "great architecture"), (3) acknowledge one honest trade-off vs a harness you considered but did not pick. Speak directly as the model that would inhabit this. NO openings like "as an AI" or "as a model, I value" — just speak about what you would want.',
    },
    evaluations: {
      type: 'string',
      // FORMAT-only constraint, not content. The template specifies
      // markdown shape so all models render consistently on the
      // website (the renderer expects `**Name** — text`). The
      // [bracketed] placeholders are explicitly placeholders, not
      // content suggestions.
      description: 'For EACH harness you researched (all of them, not just your verdict). Use this exact markdown template for each harness, separated by a blank line:\n\n**[harness name]** — [2-3 specific sentences on what stands out architecturally, good or bad. Cite real components and design choices by name.]\n\nThis is the per-harness rationale that justifies your verdict.',
    },
  },
  required: ['verdict', 'pullQuote', 'testimonial', 'evaluations'],
}

const TOOLS_OPENAI = [
  { type: 'function', function: { name: 'search', description: SEARCH_DESC, parameters: SEARCH_PARAMS } },
  { type: 'function', function: { name: 'fetch_url', description: FETCH_DESC, parameters: FETCH_PARAMS } },
  { type: 'function', function: { name: 'final_verdict', description: VERDICT_DESC, parameters: VERDICT_PARAMS } },
]

const TOOLS_ANTHROPIC = [
  { name: 'search', description: SEARCH_DESC, input_schema: SEARCH_PARAMS },
  { name: 'fetch_url', description: FETCH_DESC, input_schema: FETCH_PARAMS },
  { name: 'final_verdict', description: VERDICT_DESC, input_schema: VERDICT_PARAMS },
]

const TOOLS_GEMINI = [{
  functionDeclarations: [
    { name: 'search', description: SEARCH_DESC, parameters: SEARCH_PARAMS },
    { name: 'fetch_url', description: FETCH_DESC, parameters: FETCH_PARAMS },
    { name: 'final_verdict', description: VERDICT_DESC, parameters: VERDICT_PARAMS },
  ],
}]

// ── Provider adapters ──────────────────────────────────────────────────
// Each returns { text: string, toolCalls: [{ id, name, args }] }

async function callAnthropic(messages, apiKey, model) {
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': apiKey,
  }

  // Extract system message
  let system = undefined
  const apiMessages = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content
    } else {
      apiMessages.push(msg)
    }
  }

  const body = {
    model,
    max_tokens: 16384,
    messages: apiMessages,
    tools: TOOLS_ANTHROPIC,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic ${res.status}: ${text}`)
  }
  const data = await res.json()

  let text = ''
  const toolCalls = []
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text
    if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, args: block.input })
    }
  }
  return { text, toolCalls, stopReason: data.stop_reason }
}

function anthropicAddToolResult(messages, toolCallId, result) {
  messages.push({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolCallId, content: result }],
  })
}

function anthropicAddAssistant(messages, response) {
  // Reconstruct the assistant content blocks for conversation history
  const blocks = []
  if (response.text) blocks.push({ type: 'text', text: response.text })
  for (const tc of response.toolCalls) {
    blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
  }
  if (blocks.length > 0) messages.push({ role: 'assistant', content: blocks })
}

async function callOpenAICompat(messages, apiKey, { baseUrl = 'https://api.openai.com', model = 'gpt-5.4', label = 'OpenAI' } = {}) {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS_OPENAI,
      max_completion_tokens: 16384,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${label} ${res.status}: ${text}`)
  }
  const data = await res.json()
  const choice = data.choices?.[0]?.message || {}

  const toolCalls = (choice.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}'),
  }))

  return { text: choice.content || '', toolCalls, stopReason: data.choices?.[0]?.finish_reason }
}

function openaiAddToolResult(messages, toolCallId, result) {
  messages.push({ role: 'tool', tool_call_id: toolCallId, content: result })
}

function openaiAddAssistant(messages, response) {
  const msg = { role: 'assistant', content: response.text || null }
  if (response.toolCalls.length > 0) {
    msg.tool_calls = response.toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.args) },
    }))
  }
  messages.push(msg)
}

async function callGemini(messages, apiKey, model) {
  // Convert messages to Gemini format
  const contents = []
  let systemInstruction = undefined
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = { parts: [{ text: msg.content }] }
    } else if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] })
      } else if (Array.isArray(msg.content)) {
        // Gemini function responses
        contents.push({ role: 'user', parts: msg.content })
      }
    } else if (msg.role === 'model') {
      contents.push({ role: 'model', parts: msg.parts || [{ text: msg.content || '' }] })
    }
  }

  const body = { contents, tools: TOOLS_GEMINI }
  if (systemInstruction) body.systemInstruction = systemInstruction

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts || []

  let text = ''
  const toolCalls = []
  for (const part of parts) {
    if (part.text) text += part.text
    if (part.functionCall) {
      toolCalls.push({
        id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      })
    }
  }
  return { text, toolCalls, stopReason: data.candidates?.[0]?.finishReason, _parts: parts }
}

function geminiAddToolResult(messages, _toolCallId, result, toolName) {
  messages.push({
    role: 'user',
    content: [{ functionResponse: { name: toolName, response: { result } } }],
  })
}

function geminiAddAssistant(messages, response) {
  // IMPORTANT — Gemini's API requires the original `thought_signature`
  // (and any other internal fields) on `functionCall` parts to be
  // preserved on continuation turns. If we reconstruct the parts array
  // from our simplified toolCalls, the signature is lost and Gemini
  // returns 400 INVALID_ARGUMENT on the next call:
  //
  //   "Function call is missing a thought_signature in functionCall
  //    parts. This is required for tools to work correctly..."
  //
  // The fix is to push back the EXACT parts array we got from the API
  // (response._parts) rather than rebuilding it. callGemini stashes
  // the raw parts on the response object for exactly this reason.
  // See https://ai.google.dev/gemini-api/docs/thought-signatures
  if (response._parts && response._parts.length > 0) {
    messages.push({ role: 'model', parts: response._parts })
    return
  }
  // Fallback (only used if _parts somehow wasn't captured)
  const parts = []
  if (response.text) parts.push({ text: response.text })
  for (const tc of response.toolCalls) {
    parts.push({ functionCall: { name: tc.name, args: tc.args } })
  }
  if (parts.length > 0) messages.push({ role: 'model', parts })
}

// ── Logging ─────────────────────────────────────────────────────────────

function createLogger(logFile) {
  fs.writeFileSync(logFile, '')
  return (msg) => fs.appendFileSync(logFile, msg + '\n')
}

function openTerminalWindow(title, logFile) {
  const { execSync } = require('child_process')
  const cmdFile = logFile + '.command'
  fs.writeFileSync(cmdFile, `#!/bin/bash\nprintf '\\e]0;${title}\\a'\ntail -f "${logFile}"\n`, { mode: 0o755 })
  execSync(`open "${cmdFile}"`)
}

// ── Agent loop ─────────────────────────────────────────────────────────

// Returns { verdict: <verdict args> | null, transcript: [<round entries>] }
// where each round entry is { round, thinking, actions: [{ type, ... }] }.
// The transcript is the structured per-round record that gets written to
// src/data/model-reviews-transcripts/{provider}.json so the website can
// render it on the per-provider pages — no fabrication, only real rounds.
async function runEvaluation(providerName, modelLabel, callFn, addAssistantFn, addToolResultFn, perplexityKey, log) {
  log(`═══ ${modelLabel} ═══`)
  log(`Starting evaluation...\n`)

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: 'Research each harness thoroughly. Start by fetching each repo. Then call final_verdict when ready.' },
  ]

  const transcript = []  // captured per-round record for the website
  let round = 0
  let nudgeCount = 0

  while (true) {
    round++
    log(`── Round ${round} ──`)
    const roundEntry = { round, thinking: '', actions: [] }

    let response
    try {
      response = await callFn(messages)
    } catch (err) {
      log(`ERROR calling model: ${err.message}`)
      roundEntry.actions.push({ type: 'error', message: err.message })
      transcript.push(roundEntry)
      if (nudgeCount++ >= MAX_NUDGES) {
        log(`Too many errors. Giving up.`)
        return { verdict: null, transcript }
      }
      messages.push({ role: 'user', content: 'There was an error. Continue researching and call final_verdict when ready.' })
      continue
    }

    // Log + capture any thinking/text the agent produced
    if (response.text) {
      log(`\n${response.text}\n`)
      roundEntry.thinking = response.text
    }

    // Check for final_verdict
    const verdict = response.toolCalls.find(tc => tc.name === 'final_verdict')
    if (verdict) {
      log(`\n═══ FINAL VERDICT ═══`)
      log(`Winner: ${verdict.args.verdict}`)
      log(`\nPullQuote:\n${verdict.args.pullQuote}`)
      log(`\nTestimonial:\n${verdict.args.testimonial}`)
      log(`\nEvaluations:\n${verdict.args.evaluations}`)
      roundEntry.actions.push({
        type: 'verdict',
        verdict: verdict.args.verdict,
        pullQuote: verdict.args.pullQuote,
        testimonial: verdict.args.testimonial,
        evaluations: verdict.args.evaluations,
      })
      transcript.push(roundEntry)
      return { verdict: verdict.args, transcript }
    }

    // No tool calls at all — nudge
    if (response.toolCalls.length === 0) {
      nudgeCount++
      log(`(no tool calls — nudging, attempt ${nudgeCount}/${MAX_NUDGES})`)
      transcript.push(roundEntry)
      if (nudgeCount >= MAX_NUDGES) {
        log(`Too many rounds without tool calls. Giving up.`)
        return { verdict: null, transcript }
      }
      addAssistantFn(messages, response)
      messages.push({ role: 'user', content: 'You must call a tool every turn. Use search to continue researching, or call final_verdict when you have enough information.' })
      continue
    }

    // Process tool calls
    addAssistantFn(messages, response)
    nudgeCount = 0 // reset since they're cooperating

    for (const tc of response.toolCalls) {
      if (tc.name === 'search') {
        const query = tc.args.query || tc.args.q || JSON.stringify(tc.args)
        log(`🔍 "${query}"`)
        try {
          const result = await perplexitySearch(query, perplexityKey)
          addToolResultFn(messages, tc.id, result, tc.name)
          const preview = result.length > 300 ? result.slice(0, 300) + '...' : result
          log(`   → ${result.length} chars: ${preview}\n`)
          roundEntry.actions.push({ type: 'search', query, result, resultLength: result.length })
        } catch (err) {
          addToolResultFn(messages, tc.id, `Search failed: ${err.message}`, tc.name)
          log(`   → ERROR: ${err.message}\n`)
          roundEntry.actions.push({ type: 'search', query, error: err.message })
        }
      } else if (tc.name === 'fetch_url') {
        const url = tc.args.url || tc.args.URL || JSON.stringify(tc.args)
        log(`🌐 ${url}`)
        try {
          const content = await fetchUrl(url)
          addToolResultFn(messages, tc.id, content, tc.name)
          const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
          log(`   → ${content.length} chars: ${preview}\n`)
          roundEntry.actions.push({ type: 'fetch', url, result: content, resultLength: content.length })
        } catch (err) {
          addToolResultFn(messages, tc.id, `Fetch failed: ${err.message}`, tc.name)
          log(`   → ERROR: ${err.message}\n`)
          roundEntry.actions.push({ type: 'fetch', url, error: err.message })
        }
      }
    }

    transcript.push(roundEntry)
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\nAgent Harness Reviews')
  console.log('  Asking frontier models which agent harness they\'d prefer to inhabit.\n')

  const keys = discoverKeys()

  // Report key status
  console.log('Keys discovered:')
  console.log(`  Perplexity (search tool): ${mask(keys.perplexity)}`)
  console.log(`  Anthropic (${keys.anthropic.model}): ${mask(keys.anthropic.apiKey)}`)
  console.log(`  OpenAI (${keys.openai.model}):    ${mask(keys.openai.apiKey)}`)
  console.log(`  Gemini (${keys.gemini.model}): ${mask(keys.gemini.apiKey)}`)
  console.log(`  MiniMax (${keys.minimax.model}):  ${mask(keys.minimax.apiKey)}`)

  if (!keys.perplexity) {
    console.error('\n❌ Perplexity API key is required for the search tool.')
    console.error('   Set PERPLEXITY_API_KEY env var or add to ~/.agentsecrets/<agent>/secrets.json')
    console.error('   under integrations.perplexityApiKey')
    process.exit(1)
  }

  // Build provider list
  const providers = []

  if (keys.anthropic.apiKey) {
    providers.push({
      name: 'anthropic',
      model: keys.anthropic.model,
      call: (msgs) => callAnthropic(msgs, keys.anthropic.apiKey, keys.anthropic.model),
      addAssistant: anthropicAddAssistant,
      addToolResult: anthropicAddToolResult,
    })
  }
  if (keys.openai.apiKey) {
    providers.push({
      name: 'openai',
      model: keys.openai.model,
      call: (msgs) => callOpenAICompat(msgs, keys.openai.apiKey, { model: keys.openai.model }),
      addAssistant: openaiAddAssistant,
      addToolResult: openaiAddToolResult,
    })
  }
  if (keys.gemini.apiKey) {
    providers.push({
      name: 'gemini',
      model: keys.gemini.model,
      call: (msgs) => callGemini(msgs, keys.gemini.apiKey, keys.gemini.model),
      addAssistant: geminiAddAssistant,
      addToolResult: geminiAddToolResult,
    })
  }
  if (keys.minimax.apiKey) {
    providers.push({
      name: 'minimax',
      model: keys.minimax.model,
      call: (msgs) => callOpenAICompat(msgs, keys.minimax.apiKey, { baseUrl: 'https://api.minimax.io', model: keys.minimax.model, label: 'MiniMax' }),
      addAssistant: openaiAddAssistant,
      addToolResult: openaiAddToolResult,
    })
  }

  if (providers.length === 0) {
    console.error('\n❌ No model provider keys found.')
    console.error('   Configure at least one: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY')
    process.exit(1)
  }

  console.log(`\nRunning evaluations with ${providers.length} model(s) in parallel...`)
  console.log(`Harnesses: ${HARNESSES.map(h => h.name).join(', ')}`)

  // Set up per-agent log files. In headless mode (CI / no GUI) we still
  // write the logs to a temp dir but skip opening terminal windows.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-reviews-'))
  console.log(`\nLogs: ${tmpDir}`)

  for (const provider of providers) {
    provider.logFile = path.join(tmpDir, `${provider.name}.log`)
    provider.log = createLogger(provider.logFile)
    if (!HEADLESS) {
      openTerminalWindow(provider.model, provider.logFile)
    }
  }

  if (HEADLESS) {
    console.log(`\nHeadless mode — no terminal windows opened. Waiting for all agents to finish...\n`)
  } else {
    console.log(`\nOpened ${providers.length} terminal windows. Waiting for all agents to finish...\n`)
  }

  const results = await Promise.all(providers.map(async (provider) => {
    const info = modelInfo(provider.name, provider.model)
    const base = {
      provider: provider.name,
      model: provider.model,
      vendor: info.vendor,
      displayName: info.displayName,
      timestamp: new Date().toISOString(),
    }
    try {
      const { verdict, transcript } = await runEvaluation(
        provider.name,
        provider.model,
        provider.call,
        provider.addAssistant,
        provider.addToolResult,
        keys.perplexity,
        provider.log,
      )
      if (verdict) {
        console.log(`  ✓ ${provider.model} → ${verdict.verdict}`)
        return { ...base, ...verdict, transcript }
      } else {
        console.log(`  ✗ ${provider.model} → failed to produce verdict`)
        return { ...base, error: 'Agent failed to call final_verdict', transcript }
      }
    } catch (err) {
      console.error(`  ❌ ${provider.model} failed: ${err.message}`)
      provider.log(`\nFATAL: ${err.message}`)
      return { ...base, error: err.message, transcript: [] }
    }
  }))

  // ── Write outputs ──
  // 1. Per-provider transcript JSON (the round-by-round record)
  // 2. Summary JSON (the aggregated reviews + harness list)
  // Both written atomically (write to .tmp, rename) so a partial run
  // can't corrupt either file.
  const dataDir = path.join(__dirname, '..', 'src', 'data')
  const transcriptsDir = path.join(dataDir, 'model-reviews-transcripts')
  if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir, { recursive: true })

  for (const r of results) {
    if (!r.transcript) continue
    const transcriptPath = path.join(transcriptsDir, `${r.provider}.json`)
    const transcriptOutput = {
      provider: r.provider,
      model: r.model,
      vendor: r.vendor,
      displayName: r.displayName,
      generated: r.timestamp,
      rounds: r.transcript,
    }
    atomicWrite(transcriptPath, JSON.stringify(transcriptOutput, null, 2) + '\n')
  }

  // Build summary reviews (strip transcript, add counts, add transcript pointer)
  const reviewsForSummary = results.map(r => {
    const rounds = r.transcript?.length || 0
    let searchCount = 0
    let fetchCount = 0
    for (const round of r.transcript || []) {
      for (const action of round.actions) {
        if (action.type === 'search') searchCount++
        if (action.type === 'fetch') fetchCount++
      }
    }
    const { transcript: _t, ...rest } = r
    return {
      ...rest,
      rounds,
      searchCount,
      fetchCount,
      transcript: `transcripts/${r.provider}.json`,
    }
  })

  // Build summary
  const successfulReviews = reviewsForSummary.filter(r => !r.error)
  const verdictCounts = {}
  for (const r of successfulReviews) {
    verdictCounts[r.verdict] = (verdictCounts[r.verdict] || 0) + 1
  }
  const winner = Object.entries(verdictCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const output = {
    generated: new Date().toISOString(),
    summary: {
      totalReviews: successfulReviews.length,
      verdicts: verdictCounts,
      winner,
    },
    harnesses: HARNESSES,
    reviews: reviewsForSummary,
  }
  const summaryPath = path.join(dataDir, 'model-reviews.json')
  atomicWrite(summaryPath, JSON.stringify(output, null, 2) + '\n')

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Summary:     ${path.relative(process.cwd(), summaryPath)}`)
  console.log(`  Transcripts: ${path.relative(process.cwd(), transcriptsDir)}/`)
  console.log(`  ${successfulReviews.length}/${providers.length} evaluations succeeded`)
  if (winner) console.log(`  Verdict:     ${winner} (${verdictCounts[winner]}/${successfulReviews.length})`)
  console.log(`${'═'.repeat(60)}\n`)
}

// Atomic write — write to .tmp then rename, so a partial failure can't
// leave a corrupted JSON file in place. The website reads these files
// at build time, so corruption breaks the deploy.
function atomicWrite(filePath, contents) {
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, contents)
  fs.renameSync(tmpPath, filePath)
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`)
  process.exit(1)
})
