import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const distDir = path.join(process.cwd(), 'dist');
const sitemapPath = path.join(distDir, 'sitemap-0.xml');

const routes = [
  ['/', 'index.html'],
  ['/docs/', 'docs/index.html'],
  ['/docs/architecture/', 'docs/architecture/index.html'],
  ['/docs/getting-started/', 'docs/getting-started/index.html'],
  ['/story/', 'story/index.html'],
  ['/why/', 'why/index.html'],
  ['/what-is-an-agent-harness/', 'what-is-an-agent-harness/index.html'],
  ['/model-reviews/', 'model-reviews/index.html'],
  ['/model-reviews/anthropic/', 'model-reviews/anthropic/index.html'],
  ['/model-reviews/openai/', 'model-reviews/openai/index.html'],
  ['/model-reviews/gemini/', 'model-reviews/gemini/index.html'],
  ['/model-reviews/minimax/', 'model-reviews/minimax/index.html'],
  ['/blog/build-ai-agent-from-scratch/', 'blog/build-ai-agent-from-scratch/index.html'],
  ['/blog/stop-being-the-glue/', 'blog/stop-being-the-glue/index.html'],
  ['/blog/what-is-agent-experience/', 'blog/what-is-agent-experience/index.html'],
];

function readDistFile(relativePath) {
  return fs.readFileSync(path.join(distDir, relativePath), 'utf8');
}

function extractCanonical(html) {
  const match = html.match(/<link rel="canonical" href="([^"]+)"/);
  assert.ok(match, 'Missing canonical link');
  return match[1];
}

function extractOgUrl(html) {
  const match = html.match(/<meta property="og:url" content="([^"]+)"/);
  assert.ok(match, 'Missing og:url meta tag');
  return match[1];
}

test('sitemap emits trailing-slash URLs for sampled routes', () => {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');

  for (const [route] of routes) {
    const expectedUrl = `https://ouroboros.bot${route}`;
    assert.match(sitemap, new RegExp(`<loc>${expectedUrl}</loc>`));
  }
});

test('sampled built pages emit trailing-slash canonical metadata', async (t) => {
  for (const [route, filePath] of routes) {
    await t.test(route, () => {
      const html = readDistFile(filePath);
      const expectedUrl = `https://ouroboros.bot${route}`;

      assert.equal(extractCanonical(html), expectedUrl);
      assert.equal(extractOgUrl(html), expectedUrl);
    });
  }
});

test('review rerun instructions describe private output without relabeling the published experiment', () => {
  const html = readDistFile('model-reviews/index.html');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/model-reviews.json'), 'utf8'));
  const count = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][data.harnesses.length] ?? String(data.harnesses.length);

  assert.match(text, /Results are saved privately/);
  assert.match(text, /do not update this page/);
  assert.doesNotMatch(text, /Output is written to/);
  assert.match(text, new RegExp(`list of ${count} publicly documented agent harnesses`));
});

test('review methodology discloses the iterative comparison context', () => {
  const html = readDistFile('model-reviews/index.html');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  assert.match(text, /not a one-shot benchmark/i);
  assert.match(text, /repaired research access for every candidate/i);
  assert.match(text, /No Ouroboros product code changed before the unanimous run shown here/i);
});

test('publication selection and the shared runtime are disclosed without requiring Copilot inference', () => {
  const html = readDistFile('model-reviews/index.html');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Publication was held until every selected model chose Ouroboros in one complete run/);
  assert.match(text, /first corrected full-panel run met that condition/);
  assert.match(text, /Votes were never combined across attempts/);
  assert.match(text, /optional Copilot-first routing/);
  assert.match(text, /runtime, which is itself a candidate/);
  assert.match(text, /source-research preferences, not hands-on comparisons/);
});

test('rerun instructions offer API-only inference without a required Copilot subscription', () => {
  const html = readDistFile('model-reviews/index.html');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /--inference direct-api/);
  assert.match(text, /--inference copilot-first/);
  assert.match(text, /Direct API mode is the default/);
  assert.match(text, /no Copilot account or subscription/);
  assert.match(text, /ANTHROPIC_API_KEY/);
  assert.match(text, /OPENAI_API_KEY/);
  assert.doesNotMatch(text, /Use Node 22 and authenticate with a Copilot subscription/);
  assert.match(text, /bundled.*runtime/);
});

test('Agent Experience article derives the reviewed harness count from the accepted data', () => {
  const html = readDistFile('blog/what-is-agent-experience/index.html');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/model-reviews.json'), 'utf8'));

  assert.match(text, new RegExp(`research the ${data.harnesses.length} selected agent harnesses`));
});
