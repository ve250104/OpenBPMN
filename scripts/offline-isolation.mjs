import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Test infrastructure: observe kernel state in the same namespace as the installed CLI. */
export async function verifyNetworkIsolation() {
  assert.equal(process.platform, 'linux', 'Network isolation requires Linux.');
  const interfaces = (await readdir('/sys/class/net')).sort();
  assert.deepEqual(interfaces, ['lo'], 'External network interfaces are present.');
  const ipv4Routes = (await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1);
  const ipv6Routes = (await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
  assert.ok(
    ipv4Routes.every((route) => route.trim().split(/\s+/)[0] === 'lo'),
    'External IPv4 routes are present.',
  );
  assert.ok(
    ipv6Routes.every((route) => route.trim().split(/\s+/).at(-1) === 'lo'),
    'External IPv6 routes are present.',
  );
  return {
    namespace: await readlink('/proc/self/ns/net'),
    uid: process.getuid(),
    interfaces,
    ipv4Routes,
    ipv6Routes,
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
