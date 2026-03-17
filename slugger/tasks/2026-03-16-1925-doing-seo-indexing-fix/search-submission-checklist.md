# Search Submission Checklist

## Current Production Sitemap

- Submit or confirm: `https://ouroboros.bot/sitemap-index.xml`

## Priority URLs to Inspect / Request

- `https://ouroboros.bot/`
- `https://ouroboros.bot/docs/`
- `https://ouroboros.bot/why/`
- `https://ouroboros.bot/what-is-an-agent-harness/`
- `https://ouroboros.bot/blog/build-ai-agent-from-scratch/`
- `https://ouroboros.bot/blog/what-is-agent-experience/`

## Google Search Console

If the property is already registered and the sitemap is already submitted, skip directly to URL inspection.

1. Open the `https://ouroboros.bot/` property.
2. Confirm `https://ouroboros.bot/sitemap-index.xml` is present in Sitemaps.
3. Use URL Inspection on each priority URL.
4. If Google reports the page is not on Google but is crawlable, click `Request Indexing`.
5. Re-check Coverage / Page indexing over the next several days for:
   - `Discovered - currently not indexed`
   - `Crawled - currently not indexed`
   - duplicate or canonical-selection issues

## Bing Webmaster Tools

If the site is already verified and the sitemap is already submitted, skip directly to URL inspection / submission.

1. Open the `https://ouroboros.bot/` site.
2. Confirm `https://ouroboros.bot/sitemap-index.xml` is present in Sitemaps.
3. Use URL inspection or URL submission on each priority URL.
4. Watch Index Coverage and URL inspection results for crawl or canonical issues.

## Operator Notes

- This checklist does not claim any dashboard actions were completed from inside the repo.
- The repo-side canonical cleanup is now aligned with trailing-slash production routes, so future inspection results should no longer be split by slashless canonical hints on the in-scope pages.
- If a URL remains unindexed after inspection/submission, the next likely lever is discovery: links from GitHub, LinkedIn, launch posts, or other external pages that point directly to the priority URLs.
