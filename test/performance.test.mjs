import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRss, summarizeSamples } from '../scripts/performance.mjs';

test('performance qualification uses all twenty samples and nearest-rank p95 without discarding failures', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ elapsedMs: i + 1, exitCode: 0, rssKiB: 100 }));
  assert.deepEqual(summarizeSamples(samples, 19, 100), { status: 'pass', samples: 20, p95Ms: 19, peakRssKiB: 100 });
  assert.equal(summarizeSamples(samples.slice(1), 20, 100).status, 'not_run');
  assert.equal(summarizeSamples(samples, 18, 100).status, 'fail');
  samples[0].exitCode = 2;
  assert.equal(summarizeSamples(samples, 20, 100).status, 'fail');
  samples[0].exitCode = 0;
  samples[0].rssKiB = null;
  assert.equal(summarizeSamples(samples, 20, 100).status, 'not_run');
});

test('memory observation includes the entire CLI descendant tree and excludes unrelated browser processes', () => {
  const ps = ' 500 1 100\n 501 500 200\n 503 502 400\n 502 501 300\n 600 1 9000\n';
  assert.equal(aggregateRss(ps, 500), 1000);
  assert.equal(aggregateRss(ps, 999), 0);
});
