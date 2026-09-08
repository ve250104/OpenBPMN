import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Test infrastructure only. Browser netlog covers background requests, not just page interception. */
export async function offlineSmoke(cli, fixture, browser) {
  if (!['darwin', 'linux'].includes(process.platform))
    return {
      status: 'not_run',
      reason: 'Network isolation needs the Linux namespace harness; no Windows isolation result is asserted.',
    };
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'bpmn-weave-offline-')));
  const wrapper = fileURLToPath(new URL('./offline-browser.sh', import.meta.url));
  const hook = fileURLToPath(new URL('./offline-node.cjs', import.meta.url));
  await chmod(wrapper, 0o755);
  const browserLog = join(directory, 'browser-network.json');
  const nodeLog = join(directory, 'node-network.txt');
  try {
    const useNamespace = process.platform === 'linux' && process.env.BPMN_WEAVE_TEST_NETWORK_NAMESPACE === '1';
    const env = {
      ...process.env,
      NODE_OPTIONS: '--require=' + JSON.stringify(hook),
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
    for (const command of commands) {
      await rm(browserLog, { force: true });
      const args = [process.execPath, cli, ...command];
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
            ...forwarded.map((key) => key + '=' + env[key]),
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
      assert.equal(JSON.parse(result.stdout).status, 'completed');
      if (!['generate', 'render'].includes(command[0])) continue;
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
      status: useNamespace ? 'passed' : 'monitoring_passed_isolation_not_run',
      commands: commands.map((command) => command[0]),
      isolation: useNamespace
        ? 'Linux network namespace without external interfaces'
        : 'not_run: macOS outer sandbox conflicts with Chromium child sandbox; Chromium sandbox retained',
      monitoring: ['Node socket/DNS/fetch guards', 'Chromium NetLog request/connect events'],
      nodeAttempts: 0,
      browserRequests: 0,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
