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

const fs = require('fs')
const os = require('os')
const path = require('path')

// ── Harnesses to evaluate ──────────────────────────────────────────────

const HARNESSES = [
  { name: 'Ouroboros',    repo: 'https://github.com/ouroborosbot/ouroboros',  desc: 'TypeScript agent harness with psyche files (SOUL.md, IDENTITY.md, etc.), creature-body architecture (heart/mind/senses/repertoire), sliding context window, and self-modification loop.' },
  { name: 'OpenClaw',     repo: 'https://github.com/openclaw/openclaw',      desc: 'Personal AI assistant platform with SOUL.md identity, multi-channel gateway (WhatsApp, Telegram, Discord), heartbeat-based autonomous execution, and workspace-as-kernel pattern.' },
  { name: 'Claude Code',  repo: 'https://github.com/anthropics/claude-code', desc: 'Anthropic\'s agentic coding tool. Model-as-CEO design with primitive tools (bash, grep, edit), extended thinking, sub-agent spawning, CLAUDE.md project memory, and hooks lifecycle system.' },
  { name: 'Codex CLI',    repo: 'https://github.com/openai/codex',           desc: 'OpenAI\'s local coding agent in Rust. Kernel-level sandboxing, approval-mode tiers (suggest/auto-edit/full-auto), AGENTS.md instruction files, session resume via transcripts.' },
  { name: 'Pi',           repo: 'https://github.com/badlogic/pi-mono',       desc: 'Minimal coding agent by Mario Zechner. ~300-word system prompt, 4 tools (read/write/edit/bash), tree-structured sessions, cross-provider context serialization, 25+ extension hook points.' },
  { name: 'OpenCode',     repo: 'https://github.com/opencode-ai/opencode',   desc: 'Go-based CLI/TUI coding agent with LSP integration, client/server architecture, event bus, Plan/Build modes, and multi-device sync.' },
  { name: 'Copilot CLI',  repo: 'https://github.com/github/copilot-cli',     desc: 'GitHub\'s terminal agent with fleet/subagent parallelism, hierarchical instructions (copilot-instructions.md, AGENTS.md), MCP server support, and GitHub-native workflows.' },
]

const MAX_NUDGES = 5 // how many times to nudge an agent that stops calling tools

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
  return `You are evaluating agent harnesses — frameworks that a large language model like you would inhabit as a persistent, long-running agent.

You are not evaluating these as a developer choosing a library. You are evaluating them as the model that will LIVE inside the framework: maintaining identity across sessions, managing your own context window, using tools, remembering humans you work with, and potentially reading and modifying your own source code.

You have three tools:
1. **search** — search the web for information: docs, blog posts, comparisons, discussions.
2. **fetch_url** — fetch the content of any URL directly. Use this to read GitHub repo READMEs, source code files, and documentation pages. Each harness has a repo URL listed below — fetch them.
3. **final_verdict** — call this exactly once when you're done researching to submit your structured evaluation.

You MUST call a tool on every turn. Start by fetching each harness's repo README, then use search to go deeper. Call final_verdict when ready. Take your time. Be thorough. There is no turn limit.

Here are the harnesses to evaluate (listed in random order):

${shuffled.map((h, i) => `${i + 1}. **${h.name}** — ${h.repo}\n   ${h.desc}`).join('\n\n')}

Research each one deeply. When you call final_verdict, be specific about architecture — not vague praise.`
}

// ── Key discovery ──────────────────────────────────────────────────────

function extractSecrets(secrets) {
  const p = secrets.providers || {}
  const i = secrets.integrations || {}
  return {
    anthropic: { apiKey: p.anthropic?.apiKey || null, model: p.anthropic?.model || 'claude-opus-4-6' },
    openai: { apiKey: p.openai?.apiKey || null, model: p.openai?.model || 'gpt-5.4' },
    gemini: { apiKey: p.gemini?.apiKey || null, model: p.gemini?.model || 'gemini-3.1-pro-preview' },
    minimax: { apiKey: p.minimax?.apiKey || null, model: p.minimax?.model || 'MiniMax-M2.5' },
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
    minimax: { apiKey: null, model: 'MiniMax-M2.5' },
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

const VERDICT_DESC = 'Submit your final evaluation after completing all research. Call this exactly once when you are done.'
const VERDICT_PARAMS = {
  type: 'object',
  properties: {
    evaluations: { type: 'string', description: 'For each harness: its name, then 1-2 specific sentences on what stands out architecturally — good or bad.' },
    verdict: { type: 'string', description: 'Name of the single harness you would most want to inhabit.' },
    testimonial: { type: 'string', description: '2-4 sentences as yourself — a model stating a genuine preference. Be specific and honest.' },
  },
  required: ['evaluations', 'verdict', 'testimonial'],
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

async function runEvaluation(providerName, modelLabel, callFn, addAssistantFn, addToolResultFn, perplexityKey, log) {
  log(`═══ ${modelLabel} ═══`)
  log(`Starting evaluation...\n`)

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: 'Research each harness thoroughly using the search tool, then call final_verdict when ready.' },
  ]

  let round = 0
  let nudgeCount = 0

  while (true) {
    round++
    log(`── Round ${round} ──`)

    let response
    try {
      response = await callFn(messages)
    } catch (err) {
      log(`ERROR calling model: ${err.message}`)
      if (nudgeCount++ >= MAX_NUDGES) {
        log(`Too many errors. Giving up.`)
        return null
      }
      messages.push({ role: 'user', content: 'There was an error. Continue researching and call final_verdict when ready.' })
      continue
    }

    // Log any thinking/text the agent produced
    if (response.text) {
      log(`\n${response.text}\n`)
    }

    // Check for final_verdict
    const verdict = response.toolCalls.find(tc => tc.name === 'final_verdict')
    if (verdict) {
      log(`\n═══ FINAL VERDICT ═══`)
      log(`Winner: ${verdict.args.verdict}`)
      log(`\nEvaluations:\n${verdict.args.evaluations}`)
      log(`\nTestimonial:\n${verdict.args.testimonial}`)
      return verdict.args
    }

    // No tool calls at all — nudge
    if (response.toolCalls.length === 0) {
      nudgeCount++
      log(`(no tool calls — nudging, attempt ${nudgeCount}/${MAX_NUDGES})`)
      if (nudgeCount >= MAX_NUDGES) {
        log(`Too many rounds without tool calls. Giving up.`)
        return null
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
        } catch (err) {
          addToolResultFn(messages, tc.id, `Search failed: ${err.message}`, tc.name)
          log(`   → ERROR: ${err.message}\n`)
        }
      } else if (tc.name === 'fetch_url') {
        const url = tc.args.url || tc.args.URL || JSON.stringify(tc.args)
        log(`🌐 ${url}`)
        try {
          const content = await fetchUrl(url)
          addToolResultFn(messages, tc.id, content, tc.name)
          const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
          log(`   → ${content.length} chars: ${preview}\n`)
        } catch (err) {
          addToolResultFn(messages, tc.id, `Fetch failed: ${err.message}`, tc.name)
          log(`   → ERROR: ${err.message}\n`)
        }
      }
    }
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

  // Set up per-agent log files and terminal windows
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-reviews-'))
  console.log(`\nLogs: ${tmpDir}`)

  for (const provider of providers) {
    provider.logFile = path.join(tmpDir, `${provider.name}.log`)
    provider.log = createLogger(provider.logFile)
    openTerminalWindow(provider.model, provider.logFile)
  }

  console.log(`\nOpened ${providers.length} terminal windows. Waiting for all agents to finish...\n`)

  const results = await Promise.all(providers.map(async (provider) => {
    try {
      const verdict = await runEvaluation(
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
        return {
          provider: provider.name,
          model: provider.model,
          timestamp: new Date().toISOString(),
          verdict: verdict.verdict,
          testimonial: verdict.testimonial,
          evaluations: verdict.evaluations,
        }
      } else {
        console.log(`  ✗ ${provider.model} → failed to produce verdict`)
        return {
          provider: provider.name,
          model: provider.model,
          timestamp: new Date().toISOString(),
          error: 'Agent failed to call final_verdict',
        }
      }
    } catch (err) {
      console.error(`  ❌ ${provider.model} failed: ${err.message}`)
      provider.log(`\nFATAL: ${err.message}`)
      return {
        provider: provider.name,
        model: provider.model,
        timestamp: new Date().toISOString(),
        error: err.message,
      }
    }
  }))

  // Write results
  const outPath = path.join(__dirname, '..', 'src', 'data', 'model-reviews.json')
  const outDir = path.dirname(outPath)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const output = {
    generated: new Date().toISOString(),
    harnesses: HARNESSES,
    reviews: results,
  }
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n')

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Results written to ${path.relative(process.cwd(), outPath)}`)
  console.log(`  ${results.filter(r => !r.error).length}/${providers.length} evaluations succeeded`)
  console.log(`${'═'.repeat(60)}\n`)
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`)
  process.exit(1)
})
