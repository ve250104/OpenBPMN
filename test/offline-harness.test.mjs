import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import test from 'node:test';
import { offlineSmoke } from '../scripts/test-offline.mjs';

test('offline qualification refuses an isolation flag without an isolated Linux namespace', async (context) => {
  if (
    process.platform === 'linux' &&
    Object.values(networkInterfaces())
      .flat()
      .every((address) => address.internal)
  ) {
    context.skip('This test requires a host with an external interface.');
    return;
  }
  const previous = process.env.BPMN_WEAVE_TEST_NETWORK_ISOLATED;
  process.env.BPMN_WEAVE_TEST_NETWORK_ISOLATED = '1';
  try {
    await assert.rejects(
      offlineSmoke('/missing-installed-cli', '/missing-fixture', '/missing-browser'),
      /Network isolation requires Linux|External network interfaces are present/,
    );
  } finally {
    if (previous === undefined) delete process.env.BPMN_WEAVE_TEST_NETWORK_ISOLATED;
    else process.env.BPMN_WEAVE_TEST_NETWORK_ISOLATED = previous;
  }
});
