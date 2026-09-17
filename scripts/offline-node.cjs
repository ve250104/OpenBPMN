const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');
const childProcess = require('node:child_process');
const { basename } = require('node:path');
const { syncBuiltinESMExports } = require('node:module');
function denied(operation) {
  fs.appendFileSync(process.env.BPMN_WEAVE_TEST_NODE_NETLOG, operation + '\n', { mode: 0o600 });
  throw new Error('Offline qualification refused a network attempt.');
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0];
  if (typeof first === 'string' || (first && typeof first === 'object' && typeof first.path === 'string'))
    return originalConnect.apply(this, args);
  return denied('socket.connect');
};
for (const name of [
  'lookup',
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
  'resolveCname',
  'resolveMx',
  'resolveNaptr',
  'resolveNs',
  'resolvePtr',
  'resolveSoa',
  'resolveSrv',
  'resolveTxt',
  'reverse',
]) {
  dns[name] = () => denied('dns.' + name);
  if (dns.promises[name]) dns.promises[name] = async () => denied('dns.' + name);
}
globalThis.fetch = async () => denied('fetch');
// Test-only instrumentation follows private Node children even when production
// management deliberately removes NODE_OPTIONS/NODE_PATH from their environment.
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = childProcess[name];
  childProcess[name] = function (...parameters) {
    const command = parameters[0];
    if (typeof command !== 'string' || !/^node(?:\.exe)?$/i.test(basename(command)))
      return original.apply(this, parameters);
    if (parameters[1] == null) parameters[1] = [];
    else if (!Array.isArray(parameters[1])) parameters.splice(1, 0, []);
    parameters[1] = ['--require', __filename, ...parameters[1]];
    return original.apply(this, parameters);
  };
}
syncBuiltinESMExports();
