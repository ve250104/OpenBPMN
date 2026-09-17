import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { offlineSmoke } from '../scripts/test-offline.mjs';

for (const [api, invoke] of [
  [
    'spawnSync',
    `const child = spawnSync(process.execPath, args, options);
    process.stdout.write(JSON.stringify({ status: child.status, stderr: child.stderr }));`,
  ],
  [
    'spawn',
    `const child = spawn(process.execPath, args, options);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => process.stdout.write(JSON.stringify({ status, stderr })));`,
  ],
  [
    'execFile',
    `execFile(process.execPath, args, options, (error, _stdout, stderr) => {
    process.stdout.write(JSON.stringify({ status: error?.code ?? 0, stderr }));
  });`,
  ],
  [
    'execFileSync',
    `try {
    execFileSync(process.execPath, args, { ...options, stdio: 'pipe' });
    process.stdout.write(JSON.stringify({ status: 0, stderr: '' }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: error.status, stderr: String(error.stderr) }));
  }`,
  ],
])
  test(`offline monitoring catches a Node ${api} child with sanitized environment`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bpmn-offline-child-'));
    const log = join(directory, 'attempts.txt');
    const hook = fileURLToPath(new URL('../scripts/offline-node.cjs', import.meta.url));
    const source = `
    import { ${api} } from 'node:child_process';
    const args = ['--eval',
      "require('node:net').connect({ host: '127.0.0.1', port: 9 }).on('error', () => {}).on('connect', function () { this.end(); });"
    ];
    const options = { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, encoding: 'utf8', timeout: 3000 };
    ${invoke}
  `;
    try {
      const result = spawnSync(process.execPath, ['--require', hook, '--input-type=module', '--eval', source], {
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, NODE_OPTIONS: '', BPMN_WEAVE_TEST_NODE_NETLOG: log },
      });
      assert.equal(result.status, 0, result.stderr);
      const child = JSON.parse(result.stdout);
      assert.equal(child.status, 1, 'The unguarded Node child escaped the offline monitor.');
      assert.match(child.stderr, /Offline qualification refused a network attempt/);
      assert.equal(await readFile(log, 'utf8'), 'socket.connect\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

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

test('offline qualification observes the child network namespace despite host-visible sysfs', (context) => {
  if (process.platform !== 'linux' || process.env.BPMN_WEAVE_TEST_NETWORK_NAMESPACE !== '1') {
    context.skip('Requires the explicitly enabled Linux network namespace harness.');
    return;
  }
  const source = `
    import assert from 'node:assert/strict';
    import { readdir } from 'node:fs/promises';
    import { verifyNetworkIsolation } from ${JSON.stringify(new URL('../scripts/offline-isolation.mjs', import.meta.url).href)};
    assert.ok((await readdir('/sys/class/net')).some(name => name !== 'lo'),
      'The regression requires a host-visible external sysfs interface.');
    const evidence = await verifyNetworkIsolation();
    assert.deepEqual(evidence.interfaces, ['lo']);
    assert.match(evidence.namespace, /^net:\\[\\d+\\]$/);
  `;
  const invocation = [
    ...(process.getuid() === 0 ? [] : ['sudo', '-n']),
    'unshare',
    '--net',
    '--',
    process.execPath,
    '--input-type=module',
    '--eval',
    source,
  ];
  const result = spawnSync(invocation[0], invocation.slice(1), {
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('offline qualification proves the kernel denies an unguarded outbound connection', (context) => {
  if (process.platform !== 'linux' || process.env.BPMN_WEAVE_TEST_NETWORK_NAMESPACE !== '1') {
    context.skip('Requires the explicitly enabled Linux network namespace harness.');
    return;
  }
  const source = `
    import assert from 'node:assert/strict';
    import { verifyNetworkIsolation } from ${JSON.stringify(new URL('../scripts/offline-isolation.mjs', import.meta.url).href)};
    const evidence = await verifyNetworkIsolation();
    assert.deepEqual(evidence.deniedConnection, {
      address: '192.0.2.1', port: 443, code: 'ENETUNREACH'
    });
  `;
  const invocation = [
    ...(process.getuid() === 0 ? [] : ['sudo', '-n']),
    'unshare',
    '--net',
    '--',
    process.execPath,
    '--input-type=module',
    '--eval',
    source,
  ];
  const result = spawnSync(invocation[0], invocation.slice(1), {
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
