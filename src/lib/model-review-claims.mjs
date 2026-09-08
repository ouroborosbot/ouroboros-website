export function getModelReviewClaims(modelReviews) {
  const winner = modelReviews.summary?.winner ?? 'Ouroboros'
  const totalReviews = modelReviews.summary?.totalReviews ?? modelReviews.reviews.length
  const winnerCount = modelReviews.summary?.verdicts?.[winner] ?? totalReviews
  const allChose = winnerCount === totalReviews
  const claim = allChose
    ? `all frontier models tested chose ${winner}`
    : `${winnerCount} of ${totalReviews} frontier models tested chose ${winner}`
  const testedClaim = allChose
    ? `All frontier models tested chose ${winner}.`
    : `${winnerCount} of ${totalReviews} models tested chose ${winner}.`

  return {
    winner,
    totalReviews,
    winnerCount,
    allChose,
    claim,
    claimSentence: `Asked independently from one another, ${claim}.`,
    shortClaim: testedClaim,
    heroLead: testedClaim.slice(0, -`${winner}.`.length).trim(),
  }
}
