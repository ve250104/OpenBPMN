import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('a user can identify the installed CLI version without model input or a browser', () => {
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '0.1.0-dev.0\n');
  assert.equal(result.stderr, '');
});

test('invalid command options return one data-minimized JSON failure instead of a stack trace', () => {
  const secret = 'Bearer THIS_INPUT_MUST_NOT_BE_LOGGED';
  const result = spawnSync(process.execPath, [cli, 'generate', '--unknown', secret], { encoding: 'utf8' });
  assert.equal(result.status, 3);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.command, 'generate');
  assert.equal(envelope.signal, 'generation_failed');
  assert.equal(envelope.status, 'refused');
  assert.equal(envelope.artifacts.length, 0);
  assert.equal(
    envelope.report.checks.every((check) => check.status !== 'passed'),
    true,
  );
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('capabilities reports unavailable browser and incomplete profile honestly without creating files', () => {
  const result = spawnSync(
    process.execPath,
    [cli, 'capabilities', '--browser-executable', '/definitely/not/a/browser'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.signal, 'capabilities_reported');
  assert.equal(envelope.capabilities.runtime.browser.available, false);
  assert.equal(envelope.capabilities.profile.complete, false);
  for (const concept of [
    'collaboration',
    'exclusiveGateway',
    'subProcess',
    'boundaryEvent',
    'dataAssociation',
    'group',
  ]) {
    assert.ok(envelope.capabilities.profile.implementedConcepts.includes(concept), concept);
  }
  assert.ok(!envelope.capabilities.profile.implementedConcepts.includes('complexGateway'));
  assert.equal(envelope.capabilities.schemaVersions.request, '1.0.0');
  assert.deepEqual(envelope.artifacts, []);
  assert.equal(
    envelope.report.checks.every((check) => check.status === 'not_applicable'),
    true,
  );
});

test('help documents actual command syntax, authority flags, runtime requirements, and exit classes', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  for (const text of [
    'generate --input',
    'validate --input',
    'render --input',
    '--handoff',
    '--expert-invalid',
    '--replace',
    '--browser-executable',
    'Node.js 24',
    '0 success',
    '4 filesystem',
  ])
    assert.ok(result.stdout.includes(text), text);
});

test('invalid option branches are refused before any model read or browser fallback', () => {
  for (const args of [
    ['generate', '--input', 'missing.json'],
    ['generate', '--input', 'missing.json', '--output', 'out', '--expert-invalid'],
    ['generate', '--input', 'missing.json', '--output', 'out', '--export', 'approved'],
    ['generate', '--input', 'missing.json', '--output', 'out', '--handoff', ''],
    ['validate', '--input', '-'],
    ['validate', '--input', 'missing.bpmn', '--replace'],
    ['validate', '--input', 'missing.bpmn', '--compatibility', 'celonis'],
    ['render', '--input', 'missing.bpmn', '--output', 'out.svg', '--export', 'snapshot'],
    ['capabilities', '--browser-executable', ''],
    ['capabilities', '--browser-executable', 'relative-browser'],
    ['capabilities', '--json', '--human'],
    ['capabilities', '--json', '--json'],
    ['capabilities', '--help', '--json'],
  ]) {
    const response = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(response.status, 3, args.join(' ') + '\n' + response.stdout);
    const result = JSON.parse(response.stdout);
    assert.deepEqual(result.artifacts, []);
    assert.equal(result.report.findings[0].code, 'INPUT_SCHEMA');
  }
});
