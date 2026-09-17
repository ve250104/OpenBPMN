import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Test infrastructure: observe kernel state in the same namespace as the installed CLI. */
export async function verifyNetworkIsolation() {
  assert.equal(process.platform, 'linux', 'Network isolation requires Linux.');
  // A network-only unshare can retain the parent's sysfs mount. proc/self/net
  // follows this process's network namespace, including interfaces that are down.
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8'))
    .trim()
    .split('\n')
    .slice(2)
    .map((line) => line.slice(0, line.indexOf(':')).trim())
    .sort();
  assert.deepEqual(interfaces, ['lo'], 'External network interfaces are present.');
  const ipv4Routes = (await readFile('/proc/self/net/route', 'utf8')).trim().split('\n').slice(1);
  const ipv6Routes = (await readFile('/proc/self/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
  assert.ok(
    ipv4Routes.every((route) => route.trim().split(/\s+/)[0] === 'lo'),
    'External IPv4 routes are present.',
  );
  assert.ok(
    ipv6Routes.every((route) => route.trim().split(/\s+/).at(-1) === 'lo'),
    'External IPv6 routes are present.',
  );
  // Independently prove kernel denial, without the product-monitoring preload.
  // This probe stays in the already inspected namespace and never does DNS.
  const probeEnv = { ...process.env };
  delete probeEnv.NODE_OPTIONS;
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { connect } from 'node:net';
       const address = '192.0.2.1', port = 443;
       const socket = connect({ host: address, port });
       socket.once('connect', () => { socket.destroy(); process.exitCode = 1; });
       socket.once('error', ({ code }) => {
         socket.destroy();
         process.stdout.write(JSON.stringify({ address, port, code }));
         process.exitCode = code === 'ENETUNREACH' ? 0 : 1;
       });
       socket.setTimeout(2000, () => { socket.destroy(); process.exitCode = 1; });`,
    ],
    { encoding: 'utf8', env: probeEnv, timeout: 5_000 },
  );
  assert.equal(probe.status, 0, 'The kernel did not prove outbound network denial: ' + probe.stdout + probe.stderr);
  return {
    namespace: await readlink('/proc/self/ns/net'),
    uid: process.getuid(),
    interfaces,
    ipv4Routes,
    ipv6Routes,
    deniedConnection: JSON.parse(probe.stdout),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [evidencePath, cli, ...args] = process.argv.slice(2);
  assert.ok(evidencePath && cli, 'Expected isolation evidence path and installed CLI.');
  await writeFile(evidencePath, JSON.stringify(await verifyNetworkIsolation()), { mode: 0o600 });
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
