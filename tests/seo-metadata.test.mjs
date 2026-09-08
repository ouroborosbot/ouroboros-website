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
