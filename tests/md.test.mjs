import assert from 'node:assert/strict'
import test from 'node:test'

import { parseInlineMd } from '../src/lib/md.mjs'

test('renders safe model citations without exposing long raw URLs', () => {
  assert.equal(
    parseInlineMd('See [the architecture](https://example.com/docs/architecture) and `src/mind/prompt.ts`.'),
    'See <a href="https://example.com/docs/architecture" target="_blank" rel="noopener noreferrer">the architecture</a> and <code class="model-code">src/mind/prompt.ts</code>.',
  )
})

test('leaves unsafe link schemes escaped as plain model text', () => {
  assert.equal(
    parseInlineMd('[click](javascript:alert(1)) <script>alert(1)</script>'),
    '[click](javascript:alert(1)) &lt;script&gt;alert(1)&lt;/script&gt;',
  )
})
