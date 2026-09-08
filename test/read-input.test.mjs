import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { readInput } from '../dist/core.js';

test('an idle standard-input operation can be cancelled without waiting for a producer', async () => {
  const input = new PassThrough();
  const controller = new AbortController();
  const reading = readInput('-', input, controller.signal);
  controller.abort();
  const outcome = await Promise.race([
    reading.then(
      () => 'completed',
      (error) => error.code,
    ),
    new Promise((resolve) => setTimeout(() => resolve('still-waiting'), 100)),
  ]);
  input.destroy();
  assert.equal(outcome, 'DEPENDENCY_FAILURE');
});
