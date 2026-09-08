import childProcess from 'node:child_process'
import dns from 'node:dns/promises'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { mock } from 'node:test'
import * as sdk from '@github/copilot-sdk'

const { root, options, models, harnesses, publicDirectory } = JSON.parse(process.env.MODEL_REVIEWS_TEST_SETUP)
const counts = { starts: 0, sessions: 0, disconnects: 0, stops: 0, terminals: 0 }
const requests = []
const searchRequests = []
mock.method(os, 'homedir', () => root)
for (const key of ['COPILOT_GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'MINIMAX_API_KEY', 'PERPLEXITY_API_KEY']) {
  if (options.missingKeys) delete process.env[key]
  else process.env[key] = `fixture-only-${key}`
}
if (options.headlessEnv) process.env.MODEL_REVIEWS_HEADLESS = '1'
else delete process.env.MODEL_REVIEWS_HEADLESS
mock.method(childProcess, 'execFileSync', (command) => {
  if (command !== 'open') throw new Error(`Unexpected fixture subprocess: ${command}`)
  counts.terminals++
})

// Run the real CLI entrypoint while directing its public filesystem adapter into the test's tree.
const realDataDirectory = path.resolve(path.dirname(process.argv[1]), '..', 'src', 'data')
const redirect = (value) => typeof value === 'string' && (value === realDataDirectory || value.startsWith(`${realDataDirectory}${path.sep}`))
  ? path.join(publicDirectory, path.relative(realDataDirectory, value))
  : value
for (const method of ['existsSync', 'mkdirSync', 'mkdtempSync', 'copyFileSync', 'writeFileSync', 'renameSync', 'unlinkSync', 'rmSync']) {
  const original = fs[method]
  mock.method(fs, method, (...args) => original(...args.map(redirect)))
}
process.once('exit', () => fs.writeFileSync(path.join(root, 'runtime-receipt.json'), JSON.stringify({ counts, requests, searchRequests })))

mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }])
mock.method(https, 'get', (url, config, callback) => {
  requests.push({ url: String(url), headers: config.headers })
  const request = new EventEmitter()
  request.setTimeout = () => request
  request.destroy = (error) => { if (error) request.emit('error', error); return request }
  process.nextTick(() => {
    const metadata = url.hostname === 'api.github.com'
    const body = metadata
      ? JSON.stringify([{ sha: 'a'.repeat(40), commit: { committer: { date: new Date(Date.now() - 3600000).toISOString() } } }])
      : '# Public source\nThis candidate documents an implementation and its trade-offs.'
    const response = Readable.from([Buffer.from(body)])
    response.statusCode = options.sourceFailure ? 503 : 200
    response.statusMessage = options.sourceFailure ? 'Unavailable' : 'OK'
    response.headers = { 'content-type': metadata ? 'application/json' : 'text/plain' }
    callback(response)
  })
  return request
})
mock.method(globalThis, 'fetch', async (url, config) => {
  if (url !== 'https://api.perplexity.ai/chat/completions') throw new Error(`Unexpected fixture request: ${url}`)
  searchRequests.push({ url, method: config.method, body: JSON.parse(config.body), authorized: config.headers.Authorization === `Bearer ${process.env.PERPLEXITY_API_KEY}` })
  return options.searchFailure
    ? new Response('fixture search failure', { status: 503 })
    : new Response(JSON.stringify({ choices: [{ message: { content: 'A fixture search result with public source links.' } }] }), { status: 200 })
})
mock.method(sdk.CopilotClient.prototype, 'start', async () => { counts.starts++ })
mock.method(sdk.CopilotClient.prototype, 'getAuthStatus', async () => ({ isAuthenticated: options.auth !== false, statusMessage: 'fixture authentication denied' }))
mock.method(sdk.CopilotClient.prototype, 'getStatus', async () => ({ version: 'fixture-runtime', protocolVersion: 3 }))
mock.method(sdk.CopilotClient.prototype, 'listModels', async () => models.filter(({ provider }) => !options.directGemini || provider !== 'gemini').map(({ model }) => ({ id: model })))
mock.method(sdk.CopilotClient.prototype, 'stop', async () => { counts.stops++ })
mock.method(sdk.CopilotClient.prototype, 'createSession', async (configuration) => {
  counts.sessions++
  return {
    disconnect: async () => { counts.disconnects++ },
    sendAndWait: async () => {
      configuration.onEvent({ type: 'assistant.message', data: { messageId: configuration.model, content: 'Inspecting the candidate sources.' } })
      if (options.toolFailureEvent) {
        configuration.onEvent({ type: 'tool.execution_start', data: { toolCallId: 'invalid', toolName: 'fetch_url' } })
        configuration.onEvent({ type: 'tool.execution_complete', data: { toolCallId: 'invalid', success: false } })
      }
      if (options.sessionFailure) throw new Error(`fixture provider failure ${process.env.PERPLEXITY_API_KEY}`)
      if (options.compacted) configuration.onEvent({ type: 'session.compaction_start', data: {} })
      if (options.noVerdict) return
      const call = async (name, args, suffix) => {
        const toolCallId = `${configuration.model}-${suffix}`
        configuration.onEvent({ type: 'tool.execution_start', data: { toolCallId, toolName: name, arguments: args } })
        return configuration.tools.find((tool) => tool.name === name).handler(args, { toolCallId })
      }
      if (options.search) await call('search', { query: 'documented agent architecture' }, 'search')
      if (options.badFetch) await call('fetch_url', { url: harnesses[0].repo, startIndex: -1 }, 'bad-offset')
      for (const harness of harnesses) await call('fetch_url', { url: harness.repo }, harness.name)
      const verdict = options.dissent && configuration.model === 'MiniMax-M3' ? 'OpenClaw' : 'Ouroboros'
      await call('final_verdict', {
        verdict,
        pullQuote: `${verdict} is the choice in this deterministic fixture.`,
        testimonial: `${verdict} has a documented design with an honest trade-off.${options.contaminatedQuote ? ` ${process.env.PERPLEXITY_API_KEY}` : ''}`,
        evaluations: harnesses.map(({ name, repo }) => `**${name}** \u2014 A documented architectural trade-off from the [source](${repo}).`).join('\n\n'),
      }, 'verdict')
    },
  }
})
