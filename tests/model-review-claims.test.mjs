import assert from 'node:assert/strict'
import test from 'node:test'

import { getModelReviewClaims } from '../src/lib/model-review-claims.mjs'

test('quantifies a unanimous selected panel without claiming the frontier population', () => {
  assert.deepEqual(
    getModelReviewClaims({
      summary: { winner: 'Ouroboros', totalReviews: 4, verdicts: { Ouroboros: 4 } },
      reviews: [{}, {}, {}, {}],
    }),
    {
      winner: 'Ouroboros',
      totalReviews: 4,
      winnerCount: 4,
      allChose: true,
      claim: 'all 4 frontier models tested chose Ouroboros',
      claimSentence: 'Asked independently from one another, all 4 frontier models tested chose Ouroboros.',
      shortClaim: 'All 4 models tested chose Ouroboros.',
      heroLead: 'All 4 models tested chose',
    },
  )
})

test('reports a split verdict with the tested denominator', () => {
  const claims = getModelReviewClaims({
    summary: { winner: 'Pi', totalReviews: 4, verdicts: { Pi: 3, Ouroboros: 1 } },
    reviews: [{}, {}, {}, {}],
  })

  assert.equal(claims.claim, '3 of 4 frontier models tested chose Pi')
  assert.equal(claims.shortClaim, '3 of 4 models tested chose Pi.')
  assert.equal(claims.heroLead, '3 of 4 models tested chose')
})
