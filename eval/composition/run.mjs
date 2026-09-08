import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { arch, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { BpmnModdle } from 'bpmn-moddle';
import { assertMeaning } from './assertions.mjs';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(repository, 'dist', 'cli.js');
const manifest = JSON.parse(await readFile(new URL('manifest.json', import.meta.url), 'utf8'));
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!['--fixture', '--runs', '--output-parent'].includes(key) || !value || options.has(key)) throw new Error('Use --fixture ID, --runs 1..10, and/or --output-parent DIRECTORY.');
  options.set(key, value);
}
const runs = Number(options.get('--runs') ?? 1);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 10, 'Runs must be an integer from 1 through 10.');
const fixtures = manifest.fixtures.filter((fixture) => !options.has('--fixture') || fixture.id === options.get('--fixture'));
assert.ok(fixtures.length > 0, 'Unknown fixture.');
const output = await realpath(await mkdtemp(join(resolve(options.get('--output-parent') ?? tmpdir()), 'bpmn-weave-composition-')));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const packageInfo = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));

async function invoke(args, directory, name) {
  let observed;
  try {
    const result = await execute(process.execPath, [cli, ...args], { cwd: repository, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    observed = { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    observed = { code: typeof error.code === 'number' ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
  const envelope = JSON.parse(observed.stdout);
  // Envelopes may contain local artifact paths. Logs are private run artifacts,
  // not automatically published release evidence.
  await writeFile(join(directory, name + '.result.json'), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(directory, name + '.stderr.txt'), observed.stderr, { flag: 'wx' });
  assert.equal(observed.code, 0, name + ': ' + envelope.signal + ' ' + (envelope.report?.findings ?? []).map((finding) => finding.code).join(', '));
  return envelope;
}

async function assertVisible(xml, svg, expected) {
  const parsed = await new BpmnModdle().fromXML(xml);
  assert.equal(parsed.warnings.length, 0);
  const actual = (parsed.rootElement.diagrams ?? []).map((diagram) => ({
    plane: diagram.plane.bpmnElement.id,
    shapes: diagram.plane.planeElement.filter((element) => element.$type === 'bpmndi:BPMNShape').map((element) => element.bpmnElement.id).sort(),
    edges: diagram.plane.planeElement.filter((element) => element.$type === 'bpmndi:BPMNEdge').map((element) => element.bpmnElement.id).sort(),
  })).sort((a, b) => a.plane.localeCompare(b.plane, 'en'));
  const wanted = expected.visible.map((plane) => ({ plane: plane.plane, shapes: [...plane.shapes].sort(), edges: [...plane.edges].sort() })).sort((a, b) => a.plane.localeCompare(b.plane, 'en'));
  assert.deepEqual(actual, wanted, 'Exact independently authored per-plane visible notation');
  const ids = new Set([...svg.matchAll(/data-element-id="([^"]+)"/g)].map((match) => match[1]));
  for (const plane of wanted) for (const id of [...plane.shapes, ...plane.edges]) assert.ok(ids.has(id), 'SVG is missing ' + id);
  assert.equal((svg.match(/data-diagram-id=/g) ?? []).length, wanted.length, 'Every expected panel is rendered.');
  assert.doesNotMatch(svg, /<!DOCTYPE|<script\b|<foreignObject\b|\son[a-z]+=/i);
}

const summary = {
  kind: 'automated',
  candidate: { version: packageInfo.version, sourceState: 'development-run-not-a-release-qualification' },
  environment: { node: process.version, platform: platform(), arch: arch() },
  runsRequested: runs,
  determinismRequirement: 10,
  qualityReportNormalization: [],
  fixtures: [],
};
const capabilities = await invoke(['capabilities'], output, 'capabilities');
summary.environment.browserAvailable = capabilities.capabilities.runtime.browser.available;
summary.environment.browserVersion = capabilities.capabilities.runtime.browser.version ?? 'not_reported';
if (capabilities.capabilities.runtime.browser.available && capabilities.capabilities.runtime.browser.executable) {
  const browserVersion = await execute(capabilities.capabilities.runtime.browser.executable, ['--version'], { timeout: 5000 });
  summary.environment.browserVersion = browserVersion.stdout.trim();
}
for (const fixture of fixtures) {
  const fixtureRoot = new URL(fixture.id + '/', import.meta.url);
  const input = fileURLToPath(new URL('request.json', fixtureRoot));
  const expectedBytes = await readFile(new URL('expected.json', fixtureRoot));
  const expected = JSON.parse(expectedBytes);
  const record = { id: fixture.id, inputSha256: hash(await readFile(input)), expectedSha256: hash(expectedBytes), status: 'pass', deterministic: 'not_run', runs: [] };
  summary.fixtures.push(record);
  let first;
  for (let run = 1; run <= runs; run++) {
    const relative = fixture.id + '/run-' + run;
    const directory = join(output, relative);
    await mkdir(directory, { recursive: true });
    const stem = join(directory, 'model');
    const started = performance.now();
    try {
      const generated = await invoke(['generate', '--input', input, '--output', stem, '--export', 'clean'], directory, 'generate');
      assert.equal(generated.signal, 'clean_export_ready');
      for (const id of ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render']) assert.equal(generated.report.checks.find((check) => check.id === id)?.status, 'passed', id);
      const xml = await readFile(stem + '.bpmn', 'utf8');
      const svg = await readFile(stem + '.svg', 'utf8');
      const quality = await readFile(stem + '.quality.json', 'utf8');
      await assertMeaning(xml, expected);
      await assertVisible(xml, svg, expected);
      const digests = { bpmn: hash(xml), svg: hash(svg), quality: hash(quality) };
      if (first) assert.deepEqual(digests, first, 'Fresh runs must be byte-identical.');
      else first = digests;
      const validated = await invoke(['validate', '--input', stem + '.bpmn'], directory, 'validate');
      assert.equal(validated.signal, 'validation_completed');
      assert.equal(validated.report.checks.find((check) => check.id === 'profile')?.status, 'passed');
      await invoke(['render', '--input', stem + '.bpmn', '--output', join(directory, 'supplied.svg')], directory, 'render');
      assert.equal(await readFile(join(directory, 'supplied.svg'), 'utf8'), svg, 'Read-only rendering preserves the generated SVG.');
      record.runs.push({ run, status: 'pass', directory: relative, artifacts: digests, milliseconds: performance.now() - started });
    } catch (error) {
      record.status = 'fail';
      record.runs.push({ run, status: 'fail', directory: relative, error: error.message, milliseconds: performance.now() - started });
      // Preserve this failure. A later successful retry never erases its record.
      break;
    }
  }
  if (record.status === 'pass' && runs === 10) record.deterministic = 'pass';
  console.log(fixture.id + ': ' + record.status);
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
}
console.log('Evidence directory: ' + output);
process.exitCode = summary.fixtures.some((fixture) => fixture.status !== 'pass') ? 1 : 0;
