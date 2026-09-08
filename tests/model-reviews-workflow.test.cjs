'use strict'

const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { promisify } = require('node:util')
const runner = require('../scripts/model-reviews.cjs')

const startedAt = '2026-09-08T00:00:00.000Z'
const completedAt = '2026-09-08T00:05:00.000Z'
const runtime = { name: 'GitHub Copilot CLI', version: '1.0.83', sdkVersion: '1.0.13', mode: 'empty' }

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'model-review-contract-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

function experimentFixture() {
  return {
    runId: '5d11dc18-caae-4501-9bb7-d56ffcd2921b',
    startedAt,
    asOf: startedAt,
    harnesses: runner.HARNESSES.map((harness, index) => ({
      ...harness,
      sha: (index + 1).toString(16).padStart(40, '0'),
      committedAt: '2026-09-07T23:00:00.000Z',
      capturedAt: startedAt,
    })),
  }
}

function resultFixtures(experiment, winners = []) {
  const harnessOrder = experiment.harnesses.map(({ name }) => name)
  const prompt = runner.renderSystemPrompt(experiment.harnesses, experiment.asOf)
  return runner.REVIEW_MODELS.map((review, index) => {
    const verdict = winners[index] || 'Ouroboros'
    const final = {
      verdict,
      pullQuote: `${verdict} is where I can continue my work.`,
      testimonial: `${verdict} fits my work, with a trade-off against a smaller runtime.`,
      evaluations: experiment.harnesses.map(({ name, repo }) => `**${name}** — A substantive assessment with a specific trade-off and a [source](${repo}).`).join('\n\n'),
    }
    return {
      provider: review.provider,
      model: review.model,
      vendor: review.vendor,
      displayName: review.displayName,
      transport: 'copilot',
      runId: experiment.runId,
      timestamp: '2026-09-08T00:04:00.000Z',
      harnessOrder,
      sourceSnapshotSha256: runner.snapshotFingerprint(experiment.harnesses),
      promptSha256: crypto.createHash('sha256').update(prompt).digest('hex'),
      configuration: { infiniteSessions: false, largeOutputIndirection: false, systemMessageMode: 'replace', tools: ['search', 'fetch_url', 'final_verdict'] },
      ...final,
      transcript: [{
        round: 1,
        thinking: '',
        actions: [
          ...experiment.harnesses.map((harness) => ({
            type: 'fetch',
            url: harness.repo,
            startIndex: 0,
            result: `Captured source for ${harness.name}`,
            source: { url: runner.resolveResearchUrl(harness.repo, experiment.harnesses), candidate: harness.name, sha: harness.sha, capturedAt: startedAt },
          })),
          { type: 'verdict', ...final },
        ],
      }],
    }
  })
}

function publicationFixture(winners) {
  const experiment = experimentFixture()
  return runner.buildPublication(runner.REVIEW_MODELS, resultFixtures(experiment, winners), runtime, experiment, completedAt)
}

test('inference-mode provenance accepts legacy and valid modes without relabeling transport', () => {
  const experiment = experimentFixture()
  const copilotResults = resultFixtures(experiment)
  const directResults = copilotResults.map((result) => ({ ...result, transport: 'direct-api' }))
  assert.equal(runner.buildPublication(runner.REVIEW_MODELS, copilotResults, runtime, experiment, completedAt).summary.runtime.inferenceMode, undefined)
  for (const inferenceMode of ['direct-api', 'copilot-first']) {
    const publication = runner.buildPublication(runner.REVIEW_MODELS, directResults, { ...runtime, inferenceMode }, experiment, completedAt)
    assert.equal(publication.summary.runtime.inferenceMode, inferenceMode)
    assert.equal(runner.validatePublication(publication), publication)
  }
})

test('inference-mode provenance rejects unsupported modes', () => {
  const experiment = experimentFixture()
  const results = resultFixtures(experiment)
  for (const inferenceMode of [null, '', 'unknown']) {
    assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, results, { ...runtime, inferenceMode }, experiment, completedAt), /inference mode/i)
  }
})

test('inference-mode provenance rejects Copilot inference labeled API-only', () => {
  const experiment = experimentFixture()
  assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, resultFixtures(experiment), { ...runtime, inferenceMode: 'direct-api' }, experiment, completedAt), /direct-api.*transport/i)
})

function publishFixture(publication, directory) {
  const winners = publication.summary.reviews.map(({ verdict }) => verdict)
  return runner.publish(publication, directory, resultFixtures(experimentFixture(), winners))
}

test('uses the agreed eleven candidates and current canonical repositories', () => {
  assert.deepEqual(runner.HARNESSES.map(({ name }) => name).sort(), [
    'Claude Code', 'Codex CLI', 'Copilot CLI', 'Gemini CLI', 'Goose', 'Hermes Agent',
    'Letta Code', 'OpenClaw', 'OpenCode', 'Ouroboros', 'Pi',
  ].sort())
  assert.equal(runner.HARNESSES.find(({ name }) => name === 'Pi').repo, 'https://github.com/earendil-works/pi')
  assert.equal(runner.HARNESSES.find(({ name }) => name === 'Goose').repo, 'https://github.com/aaif-goose/goose')
})

test('parses explicit private-run, preflight, and promotion modes without inference', () => {
  assert.deepEqual(runner.parseOptions(['--headless', '--output-dir', '/private/run']), { headless: true, outputDir: '/private/run', preflight: false, publishPath: undefined, inferenceMode: 'direct-api' })
  assert.equal(runner.parseOptions(['--preflight']).preflight, true)
  assert.equal(runner.parseOptions(['--publish', '/private/run/run.json']).publishPath, '/private/run/run.json')
  assert.equal(runner.parseOptions([]).publishPath, undefined)
  assert.throws(() => runner.parseOptions(['--publish']), /argument|value/i)
  assert.throws(() => runner.parseOptions(['--publish', '']), /path|value/i)
  assert.throws(() => runner.parseOptions(['--output-dir', '  ']), /path|value/i)
  assert.throws(() => runner.parseOptions(['--unknown']), /unknown/i)
  assert.throws(() => runner.parseOptions(['--publish', '/run.json', '--preflight']), /combine/i)
  assert.throws(() => runner.parseOptions(['--publish', '/run.json', '--output-dir', '/private/run']), /combine/i)
})

test('inference selection is explicit, validated, and irrelevant to publish-only commands', () => {
  assert.equal(runner.parseOptions([]).inferenceMode, 'direct-api')
  assert.equal(runner.parseOptions(['--inference', 'direct-api']).inferenceMode, 'direct-api')
  assert.equal(runner.parseOptions(['--inference', 'copilot-first']).inferenceMode, 'copilot-first')
  for (const value of ['', ' ', 'automatic', 'unknown']) {
    assert.throws(() => runner.parseOptions(['--inference', value]), /inference.*direct-api.*copilot-first/)
  }
  assert.throws(() => runner.parseOptions(['--publish', '/run.json', '--inference', 'direct-api']), /combine/i)
})

test('pins candidate files and directories without guessing a directory README', () => {
  const { harnesses } = experimentFixture()
  for (const [name, ref, directory] of [['Ouroboros', 'main', 'src'], ['Pi', 'main', 'packages'], ['OpenCode', 'dev', 'packages']]) {
    const harness = harnesses.find((entry) => entry.name === name)
    const repo = new URL(harness.repo).pathname.slice(1)
    assert.equal(runner.resolveResearchUrl(`${harness.repo}/tree/${ref}/${directory}`, harnesses), `https://api.github.com/repos/${repo}/contents/${directory}?ref=${harness.sha}`)
    assert.equal(runner.resolveResearchUrl(`${harness.repo}/blob/${ref}/README.md`, harnesses), `https://raw.githubusercontent.com/${repo}/${harness.sha}/README.md`)
    assert.equal(runner.resolveResearchUrl(harness.repo, harnesses), `https://raw.githubusercontent.com/${repo}/${harness.sha}/README.md`)
    assert.equal(runner.resolveResearchUrl(`https://raw.githubusercontent.com/${repo}/${ref}/README.md`, harnesses), `https://raw.githubusercontent.com/${repo}/${harness.sha}/README.md`)
    const root = runner.resolveResearchUrl(`${harness.repo}/tree/${ref}`, harnesses)
    assert.equal(runner.resolveResearchUrl(root, harnesses), root)
  }
  assert.equal(runner.resolveResearchUrl('https://docs.example.com/guide#section', harnesses), 'https://docs.example.com/guide')
  assert.throws(() => runner.resolveResearchUrl('https://user:password@github.com/ourostack/ouroboros', harnesses), /credentials/)
  assert.throws(() => runner.resolveResearchUrl('file:///private', harnesses), /HTTP/)
  for (const url of ['https://github.com/example', 'https://github.com/example/repo/issues', 'https://github.com/example/repo/blob/main/file.txt', 'https://raw.githubusercontent.com/example/repo', 'https://raw.githubusercontent.com/example/repo/main/file.txt', 'https://api.github.com/repos/example/repo/contents']) {
    assert.equal(runner.resolveResearchUrl(url, harnesses), url.replace('https://github.com/example/repo/blob/main/', 'https://raw.githubusercontent.com/example/repo/main/'))
  }
  assert.equal(runner.resolveResearchUrl('https://github.com/example/repo', harnesses), 'https://raw.githubusercontent.com/example/repo/HEAD/README.md')
  assert.equal(runner.resolveResearchUrl('https://github.com/example/repo/tree/next/lib', harnesses), 'https://api.github.com/repos/example/repo/contents/lib?ref=next')
})

test('returns explicit readable directory entries and handles an empty directory', () => {
  const text = runner.formatDirectory([
    { name: 'a.ts', type: 'file', html_url: 'https://github.com/example/repo/blob/main/a.ts' },
    { name: 'children', type: 'dir', html_url: 'https://github.com/example/repo/tree/main/children' },
  ])
  assert.match(text, /a\.ts/)
  assert.match(text, /https:\/\/github\.com\/example\/repo\/tree\/main\/children/)
  assert.match(runner.formatDirectory([]), /empty/i)
  assert.throws(() => runner.formatDirectory({ message: 'not found' }), /directory/i)
  assert.throws(() => runner.formatDirectory([{ type: 'file' }]), /entry/i)
})

test('pages complete Unicode code points and rejects invalid or beyond-end offsets', () => {
  const text = `${'a'.repeat(9999)}😀b`
  const first = runner.pageDocument(text)
  assert.equal(first.text, `${'a'.repeat(9999)}😀`)
  assert.equal(first.nextIndex, 10000)
  assert.equal(first.totalLength, 10001)
  const second = runner.pageDocument(text, first.nextIndex)
  assert.equal(second.text, 'b')
  assert.equal(second.nextIndex, null)
  assert.equal(runner.pageDocument(text, 10001).text, '')
  assert.equal(runner.pageDocument('', 0).nextIndex, null)
  for (const invalid of [-1, 0.5, NaN, Infinity, null, '0']) {
    assert.throws(() => runner.pageDocument(text, invalid), /startIndex/)
  }
  assert.throws(() => runner.pageDocument(text, 10002), /beyond/)
})

test('reuses captured documents across pages and retries a failed capture', async () => {
  const research = { ...experimentFixture(), documents: new Map() }
  let requests = 0
  const read = async (url) => {
    requests++
    return { url, text: 'x'.repeat(10001), capturedAt: startedAt, contentType: 'text/plain' }
  }
  const first = await runner.fetchUrl('https://docs.example.com/guide', 0, research, read)
  const second = await runner.fetchUrl('https://docs.example.com/guide#next', first.nextIndex, research, read)
  assert.equal(requests, 1)
  assert.equal(second.nextIndex, null)
  assert.equal(first.source.capturedAt, second.source.capturedAt)
  assert.match(first.text, /startIndex[=: ]+10000/)
  assert.match(second.text, /end of document/i)

  const failing = async () => { throw new Error('network failure') }
  await assert.rejects(() => runner.fetchUrl('https://docs.example.com/failure', 0, research, failing), /network failure/)
  await runner.fetchUrl('https://docs.example.com/failure', 0, research, read)
  assert.equal(requests, 2)
})

test('pins direct GitHub contents requests and decodes file content without guessing directories', async () => {
  const research = { ...experimentFixture(), documents: new Map() }
  const harness = research.harnesses[0]
  const api = 'https://api.github.com/repos/ourostack/ouroboros/contents'
  assert.equal(runner.resolveResearchUrl(`${api}/README.md?ref=main`, research.harnesses), `${api}/README.md?ref=${harness.sha}`)
  const read = async (url) => ({
    url,
    contentType: 'application/json',
    capturedAt: startedAt,
    text: JSON.stringify(url.includes('README.md')
      ? { type: 'file', encoding: 'base64', content: Buffer.from('Complete file 😀').toString('base64') }
      : [{ name: 'README.md', type: 'file', html_url: `${harness.repo}/blob/${harness.sha}/README.md` }]),
  })
  const file = await runner.fetchUrl(`${api}/README.md?ref=main`, 0, research, read)
  assert.match(file.text, /Complete file 😀/)
  assert.equal(file.source.sha, harness.sha)
  const directory = await runner.fetchUrl(api, 0, research, read)
  assert.match(directory.text, /"README.md" \(file\)/)
  assert.equal(directory.source.sha, harness.sha)
  await assert.rejects(() => runner.fetchUrl(`${api}/unsupported`, 0, research, async (url) => ({ ...await read(url), text: '{"type":"file","encoding":"none"}' })), /content|encoding/i)
})

test('a redirected page is not mislabeled as evidence from the requested repository revision', async () => {
  const research = { ...experimentFixture(), documents: new Map() }
  const page = await runner.fetchUrl(research.harnesses[0].repo, 0, research, async () => ({
    url: 'https://docs.example.com/moved',
    text: '<style>hidden</style><script>hidden</script><p>External &amp; live</p>',
    contentType: 'text/html',
    capturedAt: startedAt,
  }))
  assert.equal(page.source.candidate, undefined)
  assert.equal(page.source.sha, undefined)
  assert.match(page.text, /External & live/)
  assert.doesNotMatch(page.text, /hidden/)
})

test('freezes each public candidate revision before research or fails explicitly', async () => {
  const requests = []
  const sources = await runner.snapshotHarnesses(startedAt, async (url) => {
    requests.push(url)
    return { text: JSON.stringify([{ sha: 'a'.repeat(40), commit: { committer: { date: '2026-09-07T23:00:00Z' } } }]) }
  })
  assert.equal(sources.length, 11)
  assert.equal(sources[0].sha, 'a'.repeat(40))
  assert.ok(requests.every((url) => new URL(url).searchParams.get('until') === startedAt))
  await assert.rejects(() => runner.snapshotHarnesses(startedAt, async () => ({ text: '[]' })), /snapshot|revision/i)
  await assert.rejects(() => runner.snapshotHarnesses(startedAt, async () => ({ text: 'not json' })), /JSON|snapshot/i)
  await assert.rejects(() => runner.snapshotHarnesses('invalid', async () => { throw new Error('must not request') }), /cutoff/)
  await assert.rejects(() => runner.snapshotHarnesses(startedAt, async () => ({ text: '{}' })), /snapshot/)
})

test('rejects malformed source provenance, time windows, and incomplete transcripts', () => {
  const experiment = experimentFixture()
  const results = resultFixtures(experiment)
  for (const change of [
    (value) => { delete value.runId },
    (value) => { value.runId = '' },
    (value) => { value.startedAt = 'invalid' },
    (value) => { value.asOf = 'invalid' },
    (value) => { value.asOf = '2026-09-08T01:00:00Z' },
    (value) => { value.harnesses = null },
    (value) => { value.harnesses[0].name = 'unrecognized' },
    (value) => { value.harnesses[0].sha = null },
    (value) => { value.harnesses[0].repo += '/changed' },
    (value) => { value.harnesses[0].committedAt = 'invalid' },
    (value) => { value.harnesses[0].committedAt = '2026-09-08T01:00:00Z' },
    (value) => { value.harnesses[0].capturedAt = 'invalid' },
    (value) => { value.harnesses[0].capturedAt = '2026-09-07T23:00:00Z' },
    (value) => { value.harnesses[0].capturedAt = '2026-09-08T01:00:00Z' },
  ]) {
    const altered = structuredClone(experiment)
    change(altered)
    assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, results, runtime, altered, completedAt))
  }
  assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, results, runtime, null, completedAt), /originating/)
  for (const generated of ['invalid', '2026-09-07T23:00:00Z']) assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, results, runtime, experiment, generated), /window/)
  for (const change of [
    (value) => { value.transport = 'unrecognized' },
    (value) => { value.timestamp = 'invalid' },
    (value) => { value.transcript = null },
    (value) => { value.transcript = [] },
    (value) => { value.transcript[0].actions = null },
    (value) => { value.harnessOrder[0] = 'unrecognized' },
  ]) {
    const altered = structuredClone(results)
    change(altered[0])
    assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, altered, runtime, experiment, completedAt))
  }
})

test('every evaluation needs its own substantive text and fetched citation', () => {
  const verdict = publicationFixture().summary.reviews[0]
  for (const first of [
    '**Ouroboros** — Prose but no citation.',
    '**Ouroboros** — [Source](https://github.com/ourostack/ouroboros)',
    '**Ouroboros** — An assessment. **Ouroboros** — A duplicate.',
  ]) {
    assert.throws(() => runner.validateVerdict({ ...verdict, evaluations: verdict.evaluations.replace(/^[\s\S]*?(?=\n\n\*\*OpenClaw\*\*)/, first) }), /substantive|Duplicate/)
  }
})

test('builds valid private dissent but rejects mixed origins, model drift, and missing research', () => {
  const experiment = experimentFixture()
  const results = resultFixtures(experiment, ['Ouroboros', 'Ouroboros', 'Ouroboros', 'OpenClaw'])
  const publication = runner.buildPublication(runner.REVIEW_MODELS, results, runtime, experiment, completedAt)
  assert.equal(publication.summary.summary.verdicts.OpenClaw, 1)
  assert.equal(publication.summary.runId, experiment.runId)
  assert.equal(runner.validatePublication(publication), publication)
  for (const [change, expected] of [
    [(rows) => { rows[0].runId = 'another-run' }, /run/i],
    [(rows) => { rows[0].model = 'different-model' }, /model/i],
    [(rows) => { rows[0].timestamp = '2026-09-07T23:59:59Z' }, /window|timestamp/i],
    [(rows) => { rows[0].timestamp = '2026-09-08T00:06:00Z' }, /window|timestamp/i],
    [(rows) => { rows[0].promptSha256 = 'b'.repeat(64) }, /prompt/i],
    [(rows) => { rows[0].sourceSnapshotSha256 = 'b'.repeat(64) }, /snapshot/i],
    [(rows) => { rows[0].harnessOrder = rows[0].harnessOrder.slice(0, 7) }, /candidate|harness/i],
    [(rows) => { rows[0].transcript[0].actions.shift() }, /research|source/i],
    [(rows) => {
      rows[0].evaluations = rows[0].evaluations.replace('**OpenClaw**', '[Unfetched](https://docs.example.com/not-read)\n\n**OpenClaw**')
      rows[0].transcript[0].actions.at(-1).evaluations = rows[0].evaluations
    }, /cite|fetched/i],
    [(rows) => {
      rows[0].evaluations = rows[0].evaluations.replace('**OpenClaw**', '**Details** — [Unfetched](https://docs.example.com/not-read)\n\n**OpenClaw**')
      rows[0].transcript[0].actions.at(-1).evaluations = rows[0].evaluations
    }, /citation|fetched/i],
    [(rows) => { rows[0].transcript[0].actions.at(-1).verdict = 'Pi' }, /terminal|verdict/i],
    [(rows) => { rows[0].transcript[0].actions.push(rows[0].transcript[0].actions.at(-1)) }, /terminal|verdict/i],
    [(rows) => { rows[0].error = 'provider failed' }, /provider failed/],
  ]) {
    const altered = structuredClone(results)
    change(altered)
    assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, altered, runtime, experiment, completedAt), expected)
  }
  assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, results.slice(1), runtime, experiment, completedAt), /incomplete/i)
  assert.throws(() => runner.buildPublication(runner.REVIEW_MODELS, [results[0], results[0], results[2], results[3]], runtime, experiment, completedAt), /duplicat|missing/i)
})

test('refuses mixed or altered stored artifacts rather than trusting their counts', () => {
  const publication = publicationFixture()
  for (const [change, expected] of [
    [(record) => { record.transcripts[0].data.runId = 'different-run' }, /run/i],
    [(record) => { record.summary.reviews[0].pullQuote += ' altered' }, /terminal|verdict|quote/i],
    [(record) => { record.summary.summary.verdicts = { Ouroboros: 3, Pi: 1 } }, /summary|count/i],
    [(record) => { record.summary.harnesses.pop() }, /candidate|harness/i],
    [(record) => { record.transcripts[0].fileName = '../../outside.json' }, /file|provider/i],
    [(record) => { record.transcripts.pop() }, /incomplete|transcript/i],
    [(record) => { record.summary.reviews[0].model = 'another-model' }, /model/i],
    [(record) => { record.transcripts[0].data.promptSha256 = '0'.repeat(64) }, /prompt/i],
    [(record) => { record.summary.reviews[0].provider = 'missing' }, /Missing transcript/i],
    [(record) => { record.transcripts[0].data.generated = completedAt }, /timestamp/i],
    [(record) => {
      const action = record.transcripts[0].data.rounds[0].actions[0]
      action.result = 'x'.repeat(action.result.length)
    }, /hash|evidence/i],
  ]) {
    const altered = structuredClone(publication)
    change(altered)
    assert.throws(() => runner.validatePublication(altered), expected)
  }
})

test('private output stays outside the checkout, including symlink ancestors, and cannot overwrite a run', (t) => {
  const root = temporaryDirectory(t)
  const publicRoot = path.join(root, 'website')
  fs.mkdirSync(publicRoot)
  assert.throws(() => runner.assertPrivateOutputDirectory(publicRoot, [publicRoot]), /outside|private/i)
  assert.throws(() => runner.assertPrivateOutputDirectory(path.join(publicRoot, 'new', 'run'), [publicRoot]), /outside|private/i)
  fs.symlinkSync(publicRoot, path.join(root, 'linked'))
  assert.throws(() => runner.assertPrivateOutputDirectory(path.join(root, 'linked', 'new'), [publicRoot]), /outside|private/i)
  const directory = path.join(root, 'private', 'run')
  assert.equal(runner.assertPrivateOutputDirectory(directory, [publicRoot]), directory)
  const publication = publicationFixture()
  runner.savePrivateRun(directory, publication)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8')), publication)
  assert.throws(() => runner.savePrivateRun(directory, publication), /exist|overwrite/i)
})

test('failure artifacts allowlist fields and redact configured secret values', (t) => {
  const directory = temporaryDirectory(t)
  const secret = 'do-not-save-this-api-secret'
  const selected = runner.REVIEW_MODELS.map((review) => ({ ...review, transport: 'direct-api', providerConfig: { apiKey: secret }, logFile: '/private/runtime.log' }))
  const record = runner.buildFailureRecord(experimentFixture(), selected, [{ ...selected[0], error: `Provider rejected ${secret}` }], runtime, [secret])
  runner.savePrivateRun(path.join(directory, 'failed'), record)
  const serialized = fs.readFileSync(path.join(directory, 'failed', 'run.json'), 'utf8')
  assert.doesNotMatch(serialized, new RegExp(secret))
  assert.doesNotMatch(serialized, /providerConfig|apiKey|logFile|runtime\.log/)
  assert.match(serialized, /redacted/)
  assert.equal(record.status, 'failed')
  assert.throws(() => runner.validatePublication(record), /failed|completed|publication/i)
})

function seedPublicFiles(directory) {
  fs.mkdirSync(path.join(directory, 'model-reviews-transcripts'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'model-reviews.json'), 'old summary\n')
  for (const { provider } of runner.REVIEW_MODELS) fs.writeFileSync(path.join(directory, 'model-reviews-transcripts', `${provider}.json`), `old ${provider}\n`)
}

function publicBytes(directory) {
  return [
    fs.readFileSync(path.join(directory, 'model-reviews.json'), 'utf8'),
    ...runner.REVIEW_MODELS.map(({ provider }) => fs.readFileSync(path.join(directory, 'model-reviews-transcripts', `${provider}.json`), 'utf8')),
  ]
}

test('publication holds dissent before writes and promotes only the complete unanimous run', (t) => {
  const directory = temporaryDirectory(t)
  seedPublicFiles(directory)
  const original = publicBytes(directory)
  const dissent = publicationFixture(['Ouroboros', 'Ouroboros', 'Ouroboros', 'OpenClaw'])
  assert.throws(() => publishFixture(dissent, directory), /hold|unanimous/i)
  assert.deepEqual(publicBytes(directory), original)
  const anotherWinner = publicationFixture(runner.REVIEW_MODELS.map(() => 'OpenClaw'))
  assert.throws(() => publishFixture(anotherWinner, directory), /hold|Ouroboros/i)
  assert.deepEqual(publicBytes(directory), original)
  const publication = publicationFixture()
  publishFixture(publication, directory)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'model-reviews.json'), 'utf8')), publication.summary)
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'model-reviews-transcripts', 'minimax.json'), 'utf8')).runId, publication.summary.runId)
})

test('a failed replacement restores the previous public files at every boundary', (t) => {
  const root = temporaryDirectory(t)
  const rename = fs.renameSync
  for (let failAt = 1; failAt <= runner.REVIEW_MODELS.length + 1; failAt++) {
    const directory = path.join(root, String(failAt))
    seedPublicFiles(directory)
    const original = publicBytes(directory)
    let renames = 0
    const mocked = t.mock.method(fs, 'renameSync', (...args) => {
      if (++renames === failAt) throw new Error('injected replacement failure')
      return rename(...args)
    })
    assert.throws(() => publishFixture(publicationFixture(), directory), /injected replacement failure/)
    mocked.mock.restore()
    assert.deepEqual(publicBytes(directory), original)
  }
})

test('rollback removes newly created targets and retains recoverable originals if restoration fails', (t) => {
  const directory = temporaryDirectory(t)
  const rename = fs.renameSync
  let calls = 0
  const first = t.mock.method(fs, 'renameSync', (...args) => {
    if (++calls === 2) throw new Error('replacement failed')
    return rename(...args)
  })
  assert.throws(() => publishFixture(publicationFixture(), directory), /replacement failed/)
  first.mock.restore()
  assert.deepEqual(fs.readdirSync(path.join(directory, 'model-reviews-transcripts')), [])
  assert.equal(fs.existsSync(path.join(directory, 'model-reviews.json')), false)
  assert.ok(!fs.readdirSync(directory).some((name) => name.startsWith('.model-review-publish-')))

  seedPublicFiles(directory)
  calls = 0
  const second = t.mock.method(fs, 'renameSync', (...args) => {
    if (++calls >= 2) throw new Error('replacement and restoration failed')
    return rename(...args)
  })
  assert.throws(() => publishFixture(publicationFixture(), directory), (error) => error instanceof AggregateError && /restoration is incomplete/.test(error.message))
  second.mock.restore()
  const backup = fs.readdirSync(directory).find((name) => name.startsWith('.model-review-publish-'))
  assert.ok(backup)
  assert.equal(fs.readFileSync(path.join(directory, backup, 'old-0'), 'utf8'), 'old anthropic\n')
})

test('promotion requires original full evidence and rejects altered compact prefixes before replacing files', (t) => {
  const directory = temporaryDirectory(t)
  const experiment = experimentFixture()
  const originals = resultFixtures(experiment)
  originals[0].transcript[0].actions[0].result = 'a'.repeat(1000)
  const publication = runner.buildPublication(runner.REVIEW_MODELS, originals, runtime, experiment, completedAt)
  runner.publish(publication, directory, originals)
  const before = publicBytes(directory)
  assert.throws(() => runner.publish(publication, directory), /original|evidence/i)
  const altered = structuredClone(publication)
  altered.transcripts[0].data.rounds[0].actions[0].result = 'b'.repeat(500)
  assert.throws(() => runner.publish(altered, directory, originals), /original|evidence/i)
  const compactedOriginals = structuredClone(originals)
  compactedOriginals[0].transcript = publication.transcripts[0].data.rounds
  assert.throws(() => runner.publish(publication, directory, compactedOriginals), /full|original|compact/i)
  assert.deepEqual(publicBytes(directory), before)
})

async function fakeRuntime(t, options = {}) {
  const root = temporaryDirectory(t)
  const publicDirectory = path.join(root, 'public')
  seedPublicFiles(publicDirectory)
  const fixture = { root, publicDirectory, counts: {}, requests: [], searchRequests: [] }
  fixture.run = async (args) => {
    try {
      return await promisify(execFile)(process.execPath, [
        '--import', path.join(__dirname, 'fixtures', 'model-reviews-runtime.mjs'),
        path.join(__dirname, '..', 'scripts', 'model-reviews.cjs'), ...args,
      ], {
        env: {
          ...runner.runtimeEnvironment(),
          MODEL_REVIEWS_TEST_SETUP: JSON.stringify({ root, options, publicDirectory, models: runner.REVIEW_MODELS, harnesses: runner.HARNESSES }),
        },
        timeout: 30000,
      })
    } finally {
      const receipt = path.join(root, 'runtime-receipt.json')
      if (fs.existsSync(receipt)) Object.assign(fixture, JSON.parse(fs.readFileSync(receipt, 'utf8')))
    }
  }
  return fixture
}

test('the actual run entrypoint saves a complete private dissenting panel without publishing', async (t) => {
  const fixture = await fakeRuntime(t, { dissent: true, directGemini: true })
  const directory = path.join(fixture.root, 'run')
  const publicDir = path.join(__dirname, '..', 'src', 'data')
  const before = publicBytes(publicDir)
  const fixtureBefore = publicBytes(fixture.publicDirectory)
  await fixture.run(['--headless', '--inference', 'copilot-first', '--output-dir', directory])
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'))
  assert.equal(record.status, 'complete')
  assert.equal(record.summary.summary.verdicts.OpenClaw, 1)
  assert.equal(record.summary.reviews.find(({ provider }) => provider === 'gemini').transport, 'direct-api')
  assert.equal(record.summary.reviews.find(({ provider }) => provider === 'anthropic').transport, 'copilot')
  assert.equal(record.summary.runtime.inferenceMode, 'copilot-first')
  assert.equal(fixture.counts.authChecks, 1)
  assert.equal(fixture.counts.catalogRequests, 1)
  assert.equal(runner.validatePublication(record), record)
  assert.deepEqual(publicBytes(publicDir), before)
  assert.deepEqual(publicBytes(fixture.publicDirectory), fixtureBefore)
  assert.equal(fixture.counts.sessions, 4)
  assert.equal(fixture.counts.disconnects, 4)
  assert.equal(fixture.counts.stops, 1)
  assert.ok(fixture.requests.every(({ headers }) => !Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')))
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'raw', 'evidence.json'), 'utf8')).results.length, 4)
  assert.equal(fs.readFileSync(path.join(directory, '.gitignore'), 'utf8'), '/raw/\n')
})

test('the actual preflight entrypoint resolves sources without creating an inference session', async (t) => {
  const fixture = await fakeRuntime(t, { copilotUnavailable: true })
  const directory = path.join(fixture.root, 'preflight')
  await fixture.run(['--preflight', '--output-dir', directory])
  assert.equal(fixture.counts.sessions, 0)
  assert.equal(fixture.counts.stops, 1)
  assert.equal(fixture.counts.authChecks, 0)
  assert.equal(fixture.counts.catalogRequests, 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8')).status, 'preflight')
  await assert.rejects(() => fixture.run(['--preflight', '--output-dir', directory]), /already exists/)
})

test('direct API entrypoints do not require Copilot authentication or catalog access', async (t) => {
  for (const args of [[], ['--inference', 'direct-api']]) {
    await t.test(args.join(' ') || 'default', async (subtest) => {
      const fixture = await fakeRuntime(subtest, { copilotUnavailable: true })
      const directory = path.join(fixture.root, 'direct')
      await fixture.run(['--headless', '--output-dir', directory, ...args])
      const record = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'))
      assert.equal(record.status, 'complete')
      assert.equal(record.summary.runtime.inferenceMode, 'direct-api')
      assert.ok(record.summary.reviews.every(({ transport }) => transport === 'direct-api'))
      assert.equal(fixture.counts.authChecks, 0)
      assert.equal(fixture.counts.catalogRequests, 0)
      assert.equal(fixture.counts.sessions, 4)
      assert.ok(fixture.sessionConfigurations.every(({ provider }) => provider?.apiKeyConfigured))
      const anthropic = fixture.sessionConfigurations.find(({ model }) => model === 'claude-opus-5').provider
      assert.deepEqual(anthropic, { type: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKeyConfigured: true })
      const openai = fixture.sessionConfigurations.find(({ model }) => model === 'gpt-6-astra').provider
      assert.deepEqual(openai, { type: 'openai', baseUrl: 'https://api.openai.com/v1', wireApi: 'completions', apiKeyConfigured: true })
    })
  }
})

test('Copilot-first catalog and execution failures never switch to direct API inference', async (t) => {
  for (const options of [{ catalogFailure: true }, { sessionFailure: true }]) {
    await t.test(JSON.stringify(options), async (subtest) => {
      const fixture = await fakeRuntime(subtest, options)
      const directory = path.join(fixture.root, 'failed')
      await assert.rejects(() => fixture.run(['--headless', '--inference', 'copilot-first', '--output-dir', directory]))
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8')).status, 'failed')
      assert.ok(fixture.sessionConfigurations.every(({ provider }) => provider === null))
      assert.equal(fixture.counts.sessions, options.catalogFailure ? 0 : 4)
    })
  }
})

test('Copilot-first preflight supports the logged-in-user path without an explicit token', async (t) => {
  const fixture = await fakeRuntime(t, { noCopilotToken: true })
  const directory = path.join(fixture.root, 'copilot-preflight')
  await fixture.run(['--preflight', '--inference', 'copilot-first', '--output-dir', directory])
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'))
  assert.equal(record.status, 'preflight')
  assert.equal(record.runtime.inferenceMode, 'copilot-first')
  assert.ok(record.reviewers.every(({ transport }) => transport === 'copilot'))
  assert.equal(fixture.counts.authChecks, 1)
  assert.equal(fixture.counts.catalogRequests, 1)
  assert.equal(fixture.counts.sessions, 0)
})

test('direct API missing-key failures name the vendor requirement without requiring Copilot', async (t) => {
  const fixture = await fakeRuntime(t, { copilotUnavailable: true, missingProviderKey: 'ANTHROPIC_API_KEY' })
  const directory = path.join(fixture.root, 'missing-provider')
  await assert.rejects(() => fixture.run(['--headless', '--output-dir', directory]), /ANTHROPIC_API_KEY/)
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'))
  assert.equal(record.status, 'failed')
  assert.equal(fixture.counts.authChecks, 0)
  assert.equal(fixture.counts.catalogRequests, 0)
  assert.equal(fixture.counts.sessions, 0)
})

test('Copilot-first auth failure retains actionable guidance when the SDK message is empty', async (t) => {
  const fixture = await fakeRuntime(t, { auth: false, authMessage: '' })
  const directory = path.join(fixture.root, 'missing-auth-message')
  await assert.rejects(() => fixture.run(['--headless', '--inference', 'copilot-first', '--output-dir', directory]), /run copilot login or set COPILOT_GITHUB_TOKEN/)
  assert.equal(fixture.counts.catalogRequests, 0)
  assert.equal(fixture.counts.sessions, 0)
})

test('the actual default run remains private even when unanimous, and explicit promotion starts no inference', async (t) => {
  const fixture = await fakeRuntime(t, { headlessEnv: true, search: true, badFetch: true, toolFailureEvent: true })
  const before = publicBytes(fixture.publicDirectory)
  await fixture.run([])
  const parent = path.join(fixture.root, '.local', 'state', 'ouroboros-model-reviews')
  const entries = fs.readdirSync(parent)
  assert.equal(entries.length, 1)
  const filename = path.join(parent, entries[0], 'run.json')
  const run = JSON.parse(fs.readFileSync(filename, 'utf8'))
  assert.equal(run.summary.summary.verdicts.Ouroboros, 4)
  assert.deepEqual(publicBytes(fixture.publicDirectory), before)
  assert.equal(fixture.counts.terminals, 0)
  assert.equal(fixture.searchRequests.length, 4)
  assert.ok(fixture.searchRequests.every(({ method, authorized, body }) => method === 'POST' && authorized && body.model === 'sonar' && body.messages[0].content === 'documented agent architecture'))
  assert.ok(run.transcripts.every(({ data }) => data.rounds.flatMap(({ actions }) => actions).some(({ error }) => error?.includes('startIndex'))))
  await fixture.run(['--publish', filename])
  assert.equal(fixture.counts.starts, 0)
  assert.equal(fixture.counts.sessions, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.publicDirectory, 'model-reviews.json'), 'utf8')), run.summary)
})

test('interactive run artifacts are private and terminal opening stays outside the inference contract', async (t) => {
  const fixture = await fakeRuntime(t)
  const directory = path.join(fixture.root, 'interactive')
  await fixture.run(['--output-dir', directory])
  assert.equal(fixture.counts.terminals, 4)
  for (const { provider } of runner.REVIEW_MODELS) {
    assert.equal(fs.statSync(path.join(directory, 'raw', `${provider}.log`)).mode & 0o777, 0o600)
    assert.equal(fs.statSync(path.join(directory, 'raw', `${provider}.log.command`)).mode & 0o777, 0o700)
  }
})

test('a failed search remains visible while sufficient primary-source research can still complete', async (t) => {
  const fixture = await fakeRuntime(t, { search: true, searchFailure: true })
  const directory = path.join(fixture.root, 'search-failure')
  await fixture.run(['--headless', '--output-dir', directory])
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'))
  assert.equal(run.status, 'complete')
  assert.ok(run.transcripts.every(({ data }) => data.rounds.flatMap(({ actions }) => actions).some(({ type, error, result }) => type === 'search' && error?.includes('503') && result.includes('Search failed'))))
})

test('invalid promotion arguments fail before credentials, inference, or public changes', async (t) => {
  const fixture = await fakeRuntime(t)
  const before = publicBytes(fixture.publicDirectory)
  await assert.rejects(() => fixture.run(['--publish', '']), /nonempty path/)
  assert.equal(fixture.counts.starts, 0)
  const file = path.join(fixture.root, 'not-complete.json')
  fs.writeFileSync(file, JSON.stringify({ status: 'preflight' }))
  await assert.rejects(() => fixture.run(['--publish', file]), /completed publication/)
  assert.equal(fixture.counts.starts, 0)
  assert.deepEqual(publicBytes(fixture.publicDirectory), before)
})

test('a credential-bearing model quote fails closed instead of rewriting or saving it', async (t) => {
  const fixture = await fakeRuntime(t, { contaminatedQuote: true })
  const directory = path.join(fixture.root, 'contaminated')
  await assert.rejects(() => fixture.run(['--headless', '--output-dir', directory]), /configured credential/)
  const text = fs.readFileSync(path.join(directory, 'run.json'), 'utf8')
  assert.equal(JSON.parse(text).status, 'failed')
  assert.doesNotMatch(text, /fixture-only-/)
  assert.equal(fs.existsSync(path.join(directory, 'raw', 'evidence.json')), false)
})

test('entrypoint failures remain private failed records with no secret-bearing errors', async (t) => {
  for (const options of [{ auth: false }, { missingKeys: true }, { sourceFailure: true }, { sessionFailure: true }, { noVerdict: true }, { compacted: true }]) {
    await t.test(JSON.stringify(options), async (subtest) => {
      const fixture = await fakeRuntime(subtest, options)
      const directory = path.join(fixture.root, 'failed')
      await assert.rejects(() => fixture.run(['--headless', '--inference', options.auth === false ? 'copilot-first' : 'direct-api', '--output-dir', directory]))
      const serialized = fs.readFileSync(path.join(directory, 'run.json'), 'utf8')
      const record = JSON.parse(serialized)
      assert.equal(record.status, 'failed')
      assert.doesNotMatch(serialized, /fixture-only-|providerConfig|apiKey|logFile/)
      assert.equal(fixture.counts.stops, options.missingKeys ? 0 : 1)
      if (fixture.counts.sessions > 0) {
        const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'raw', 'evidence.json'), 'utf8'))
        assert.ok(evidence.results.every(({ transcript }) => transcript.length > 0), 'retain the partial model turns when an inference session fails')
      }
    })
  }
})
