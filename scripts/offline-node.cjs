const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');
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
syncBuiltinESMExports();
