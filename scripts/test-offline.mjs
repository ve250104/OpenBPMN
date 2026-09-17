import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyNetworkIsolation } from './offline-isolation.mjs';

/** Test infrastructure only. Browser netlog covers background requests, not just page interception. */
export async function offlineSmoke(cli, fixture, browser, options = {}) {
  if (options.manager) assert.ok(options.prefix, 'An installed manager requires its installation prefix.');
  const useExistingNamespace = process.env.BPMN_WEAVE_TEST_NETWORK_ISOLATED === '1';
  if (useExistingNamespace) await verifyNetworkIsolation();
  if (!['darwin', 'linux'].includes(process.platform))
    return {
      status: 'not_run',
      reason: 'Network isolation needs the Linux namespace harness; no Windows isolation result is asserted.',
    };
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'bpmn-weave-offline-')));
  const wrapper = fileURLToPath(new URL('./offline-browser.sh', import.meta.url));
  const hook = fileURLToPath(new URL('./offline-node.cjs', import.meta.url));
  const isolationRunner = fileURLToPath(new URL('./offline-isolation.mjs', import.meta.url));
  await chmod(wrapper, 0o755);
  const browserLog = join(directory, 'browser-network.json');
  const nodeLog = join(directory, 'node-network.txt');
  try {
    const useNamespace = process.platform === 'linux' && process.env.BPMN_WEAVE_TEST_NETWORK_NAMESPACE === '1';
    assert.ok(!(useNamespace && useExistingNamespace), 'Choose one Linux network isolation mode.');
    const isolationEvidence = [];
    const env = {
      ...process.env,
      // The isolation runner's kernel-denial probe must run without the guard.
      // Load it explicitly only when Node starts the application below.
      NODE_OPTIONS: '',
      PATH: options.manager
        ? [join(options.prefix, 'bin'), process.env.PATH].filter(Boolean).join(delimiter)
        : process.env.PATH,
      BPMN_WEAVE_TEST_BROWSER: browser,
      BPMN_WEAVE_TEST_NETLOG: browserLog,
      BPMN_WEAVE_TEST_NODE_NETLOG: nodeLog,
    };
    const forwarded = [
      'NODE_OPTIONS',
      'BPMN_WEAVE_TEST_BROWSER',
      'BPMN_WEAVE_TEST_NETLOG',
      'BPMN_WEAVE_TEST_NODE_NETLOG',
      'PATH',
      'HOME',
      'USERPROFILE',
    ];
    const commands = [
      ['generate', '--input', fixture, '--output', join(directory, 'offline'), '--browser-executable', wrapper],
      ['validate', '--input', join(directory, 'offline.bpmn')],
      [
        'render',
        '--input',
        join(directory, 'offline.bpmn'),
        '--output',
        join(directory, 'supplied.svg'),
        '--browser-executable',
        wrapper,
      ],
      ['capabilities', '--browser-executable', wrapper],
    ];
    if (options.manager)
      commands.push(['doctor', '--prefix', options.prefix, '--browser-executable', wrapper, '--json']);
    for (const command of commands) {
      await rm(browserLog, { force: true });
      const evidencePath = join(directory, command[0] + '-isolation.json');
      const args = [
        options.runtime ?? process.execPath,
        ...(useNamespace || useExistingNamespace ? [isolationRunner, evidencePath] : []),
        '--require',
        hook,
        command[0] === 'doctor' ? options.manager : cli,
        ...command,
      ];
      const invocation = useNamespace
        ? [
            'sudo',
            '-n',
            'unshare',
            '--net',
            '--',
            'runuser',
            '-u',
            process.env.USER,
            '--',
            'env',
            ...forwarded.filter((key) => env[key] !== undefined).map((key) => key + '=' + env[key]),
            ...args,
          ]
        : args;
      const result = spawnSync(invocation[0], invocation.slice(1), {
        cwd: directory,
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
        env,
      });
      let nodeAttempts = '';
      try {
        nodeAttempts = await readFile(nodeLog, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      assert.equal(nodeAttempts, '', 'Node attempted network activity.');
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stderr, '');
      assert.equal(JSON.parse(result.stdout).status, command[0] === 'doctor' ? 'ready' : 'completed');
      if (useNamespace || useExistingNamespace)
        isolationEvidence.push({ command: command[0], ...JSON.parse(await readFile(evidencePath, 'utf8')) });
      if (!['generate', 'render', 'doctor'].includes(command[0])) continue;
      const log = JSON.parse(await readFile(browserLog, 'utf8'));
      const names = Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([name, id]) => [id, name]));
      const requests = log.events.filter(
        (event) =>
          event.phase === 1 &&
          (names[event.type] === 'URL_REQUEST_START_JOB'
            ? /^https?:/i.test(event.params?.url ?? '')
            : ['TCP_CONNECT_ATTEMPT', 'UDP_CONNECT'].includes(names[event.type])),
      );
      const requestKinds = requests.map((event) => ({
        event: names[event.type],
        host: event.params?.url ? new URL(event.params.url).hostname : 'socket',
      }));
      assert.equal(requests.length, 0, 'Browser attempted outbound requests: ' + JSON.stringify(requestKinds));
    }
    return {
      status: useNamespace || useExistingNamespace ? 'passed' : 'monitoring_passed_isolation_not_run',
      commands: commands.map((command) => command[0]),
      isolation:
        useNamespace || useExistingNamespace
          ? 'Verified Linux network namespace with only loopback interfaces/routes and kernel-denied outbound TCP'
          : 'not_run: command monitoring only; Chromium sandbox retained',
      isolationEvidence,
      monitoring: [
        'Node socket/DNS/fetch guards including direct Node subprocesses',
        'Chromium NetLog request/connect events',
      ],
      nodeAttempts: 0,
      browserRequests: 0,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
