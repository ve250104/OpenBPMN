import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, totalmem, release } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export function aggregateRss(output, pid) {
  const processes = output
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [child, parent] of processes)
      if (descendants.has(parent) && !descendants.has(child)) {
        descendants.add(child);
        changed = true;
      }
  }
  return processes.reduce((sum, [child, , rss]) => sum + (descendants.has(child) && Number.isFinite(rss) ? rss : 0), 0);
}

export function summarizeSamples(samples, latencyBudgetMs, memoryBudgetKiB) {
  const complete =
    samples.length === 20 &&
    samples.every(
      (sample) =>
        Number.isFinite(sample.elapsedMs) && (memoryBudgetKiB === undefined || Number.isFinite(sample.rssKiB)),
    );
  const ordered = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
  const p95Ms = ordered[Math.ceil(ordered.length * 0.95) - 1] ?? null;
  const peakRssKiB = samples.every((sample) => Number.isFinite(sample.rssKiB))
    ? Math.max(...samples.map((sample) => sample.rssKiB))
    : null;
  return {
    status: !complete
      ? 'not_run'
      : samples.some((sample) => sample.exitCode !== 0) ||
          p95Ms > latencyBudgetMs ||
          (memoryBudgetKiB !== undefined && peakRssKiB > memoryBudgetKiB)
        ? 'fail'
        : 'pass',
    samples: samples.length,
    p95Ms,
    peakRssKiB,
  };
}

async function measure(cli, args, memory) {
  const started = performance.now();
  const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '',
    stderr = '',
    peakRssKiB = 0,
    observable = process.platform !== 'win32';
  const sample = () => {
    if (!memory || !observable || !child.pid) return;
    const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], {
      encoding: 'utf8',
      timeout: 2000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (ps.status !== 0) {
      observable = false;
      return;
    }
    peakRssKiB = Math.max(peakRssKiB, aggregateRss(ps.stdout, child.pid));
  };
  sample();
  const interval = memory ? setInterval(sample, 75) : undefined;
  const timeout = setTimeout(() => child.kill('SIGTERM'), 120_000);
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.length > 16 * 1024 * 1024) child.kill('SIGTERM');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    const exitCode = await new Promise((done, fail) => {
      child.once('error', fail);
      child.once('close', done);
    });
    const elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
    let findings = [];
    if (exitCode !== 0) {
      try {
        findings = JSON.parse(stdout).report.findings.map((finding) => finding.code);
      } catch {
        findings = ['UNPARSEABLE_RESULT'];
      }
    }
    return {
      elapsedMs,
      exitCode,
      rssKiB: memory && observable && peakRssKiB > 0 ? peakRssKiB : null,
      ...(findings.length ? { findings } : {}),
      stderrBytes: Buffer.byteLength(stderr),
    };
  } finally {
    clearTimeout(timeout);
    clearInterval(interval);
  }
}

async function run() {
  assert.equal(process.versions.node.split('.')[0], '24', 'Reference performance requires Node 24.x.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const cli = resolve(process.argv[2] ?? join(root, 'dist/cli.js'));
  const artifacts = join(root, '.artifacts');
  await mkdir(artifacts, { recursive: true });
  const directory = await mkdtemp(join(artifacts, 'performance-'));
  const browserArgs = process.env.BPMN_WEAVE_BROWSER_EXECUTABLE
    ? ['--browser-executable', process.env.BPMN_WEAVE_BROWSER_EXECUTABLE]
    : [];
  const capabilityRun = spawnSync(process.execPath, [cli, 'capabilities', ...browserArgs], { encoding: 'utf8' });
  assert.equal(capabilityRun.status, 0);
  const capabilities = JSON.parse(capabilityRun.stdout);
  const records = [];
  const fixtures = {};
  for (const count of [25, 100, 250]) {
    const path = join(root, 'eval/scale', count + '.json');
    fixtures[count] = {
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    };
  }
  const cases = [
    { id: 'help', budget: 1000, args: () => ['--help'] },
    { id: 'capabilities', budget: 1000, args: () => ['capabilities', ...browserArgs] },
    ...[25, 100, 250].map((count) => ({
      id: 'generate-' + count,
      budget: { 25: 5000, 100: 10000, 250: 30000 }[count],
      memory: count >= 100 ? (count === 100 ? 512 * 1024 : 1024 * 1024) : undefined,
      args: (iteration) => [
        'generate',
        '--input',
        fixtures[count].path,
        '--output',
        join(directory, `scale-${count}-${iteration}`),
        ...browserArgs,
      ],
    })),
    { id: 'validate-100', budget: 2000, args: () => ['validate', '--input', join(directory, 'scale-100-0.bpmn')] },
    {
      id: 'render-100',
      budget: 5000,
      args: (iteration) => [
        'render',
        '--input',
        join(directory, 'scale-100-0.bpmn'),
        '--output',
        join(directory, `render-${iteration}.svg`),
        ...browserArgs,
      ],
    },
  ];
  for (const item of cases) {
    const warmup = await measure(cli, item.args(0), false);
    const samples = [];
    if (warmup.exitCode === 0)
      for (let i = 1; i <= 20; i++) samples.push(await measure(cli, item.args(i), item.memory !== undefined));
    const summary = summarizeSamples(samples, item.budget, item.memory);
    records.push({ id: item.id, latencyBudgetMs: item.budget, memoryBudgetKiB: item.memory, warmup, samples, summary });
    console.log(item.id + ': ' + summary.status + ', p95 ' + summary.p95Ms + ' ms');
  }
  const result = {
    kind: 'development-performance',
    sourceCommit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
    toolVersion: capabilities.toolVersion,
    node: process.version,
    os: process.platform,
    release: release(),
    architecture: process.arch,
    cpu: cpus()[0]?.model,
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    browser: capabilities.capabilities.runtime.browser,
    memoryMethod:
      'Observed aggregate resident KiB of CLI and descendants sampled every 75 ms using ps; short-lived peaks may fall between samples. Measurement overhead is included in elapsed time.',
    fixtures: Object.fromEntries(
      Object.entries(fixtures).map(([count, fixture]) => [
        count,
        { path: relative(root, fixture.path), sha256: fixture.sha256 },
      ]),
    ),
    artifacts: relative(root, directory),
    records,
    fullReleaseQualified: false,
  };
  await writeFile(join(artifacts, 'performance.json'), JSON.stringify(result, null, 2) + '\n');
  process.exitCode =
    records.every((item) => item.summary.status === 'pass') && cpus().length >= 2 && totalmem() >= 8 * 1024 ** 3
      ? 0
      : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
