import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, realpath, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileModel, semanticProjection } from '../dist/compiler.js';
import { validateXml } from '../dist/xml.js';
import { assertPublishedSvgEquivalent } from './support/published-svg.mjs';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const example = fileURLToPath(new URL('../examples/invoice-review.json', import.meta.url));
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('the published purchase example reproduces from its authored request without stale artifacts', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-published-example-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = fileURLToPath(new URL('../examples/purchase-approval.json', import.meta.url));
  const suffixes = ['bpmn', 'svg', 'quality.json'];
  const results = [];
  try {
    for (const name of ['purchase', 'repeat']) {
      const result = await run(['generate', '--input', input, '--output', join(dir, name)]);
      results.push(result);
      assert.equal(result.code, 0, result.stdout + result.stderr);
    }
    for (const suffix of suffixes) {
      const actual = await readFile(join(dir, `purchase.${suffix}`), 'utf8');
      const repeated = await readFile(join(dir, `repeat.${suffix}`), 'utf8');
      assert.ok(actual === repeated, `Fresh ${suffix} outputs must remain byte-identical in the same environment.`);
      const expected = await readFile(new URL(`../examples/purchase-approval.${suffix}`, import.meta.url), 'utf8');
      if (suffix === 'svg') assertPublishedSvgEquivalent(actual, expected);
      else {
        assert.ok(
          actual === expected,
          `Regenerate the published ${suffix} when the authored request or output pipeline changes.`,
        );
      }
    }
  } catch (error) {
    // CI logs truncate embedded fonts before reaching the useful SVG difference.
    // Retain the complete synthetic pair, repeats, and CLI results for diagnosis.
    const artifacts = fileURLToPath(new URL('../.artifacts/', import.meta.url));
    await mkdir(artifacts, { recursive: true });
    const retained = await mkdtemp(join(artifacts, 'published-example-failure-'));
    await cp(dir, retained, { recursive: true });
    for (const suffix of ['json', ...suffixes]) {
      await cp(
        new URL(`../examples/purchase-approval.${suffix}`, import.meta.url),
        join(retained, `expected.${suffix}`),
      );
    }
    await writeFile(
      join(retained, 'runtime.json'),
      JSON.stringify(
        { node: process.version, platform: process.platform, architecture: process.arch, results },
        null,
        2,
      ),
    );
    throw new Error(`${error.message}\nComplete example evidence retained at ${retained}`, { cause: error });
  }
});

test('a user generates and inspects a complete, valid three-file Output Bundle', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-generate-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await run(['generate', '--input', example, '--output', join(dir, 'invoice')]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.signal, 'clean_export_ready');
  assert.equal(envelope.report.export.cleanEligible, true);
  assert.deepEqual(
    envelope.artifacts.map((a) => a.kind),
    ['bpmn', 'svg', 'quality'],
  );
  assert.deepEqual((await readdir(dir)).sort(), ['invoice.bpmn', 'invoice.quality.json', 'invoice.svg']);
  const xml = await readFile(join(dir, 'invoice.bpmn'), 'utf8');
  assert.match(xml, /id="M_review"/);
  assert.match(xml, /name="Review invoice"/);
  assert.match(xml, /isExecutable="false"/);
  assert.doesNotMatch(xml, /Synthetic example|schemaVersion|lifecycleStatus/);
  const svg = await readFile(join(dir, 'invoice.svg'), 'utf8');
  assert.match(svg, /data-element-id="M_review"/);
  const report = JSON.parse(await readFile(join(dir, 'invoice.quality.json'), 'utf8'));
  for (const id of ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render']) {
    assert.equal(report.checks.find((check) => check.id === id).status, 'passed', id);
  }
});

for (const [primaryKind, identicalDocumentation] of [
  ['Process', false],
  ['Collaboration', false],
  ['Process', true],
]) {
  test(`generation preserves model and ${primaryKind} documentation separately${identicalDocumentation ? ' even when identical' : ''}`, async (t) => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-documentation-')));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const modelDocumentation = 'Model scope:\nPreserve <review> & its boundaries.';
    const primaryDocumentation = identicalDocumentation ? modelDocumentation : 'Primary subject instructions.';
    const request = {
      schemaVersion: '1.0.0',
      profileVersion: '1.0.0',
      model: {
        key: 'documentedModel',
        name: 'Documented review',
        documentation: modelDocumentation,
        primaryRef: primaryKind === 'Process' ? 'primary' : 'collaboration',
        processes: [
          {
            key: 'primary',
            name: 'Primary process',
            documentation: primaryKind === 'Process' ? primaryDocumentation : 'Caller process instructions.',
            nodes: [
              {
                key: 'call',
                type: 'callActivity',
                name: 'Review details',
                containerRef: 'primary',
                calledProcessRef: 'called',
              },
            ],
            flows: [],
          },
          {
            key: 'called',
            name: 'Called process',
            documentation: 'Called process instructions.',
            nodes: [{ key: 'review', type: 'task', name: 'Review evidence', containerRef: 'called' }],
            flows: [],
          },
        ],
        ...(primaryKind === 'Collaboration'
          ? {
              collaboration: {
                key: 'collaboration',
                name: 'Review collaboration',
                documentation: primaryDocumentation,
                participants: [{ key: 'participant', name: 'Review team', processRef: 'primary' }],
                messageFlows: [],
              },
            }
          : {}),
      },
    };
    const original = structuredClone(request);
    const input = join(dir, 'request.json');
    const stem = join(dir, 'review');
    const handoffPath = join(dir, 'review.openbpmn.json');
    await writeFile(input, JSON.stringify(request));
    const result = await run(['generate', '--input', input, '--output', stem, '--handoff', handoffPath]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.signal, 'clean_export_ready');
    for (const id of ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render']) {
      assert.equal(envelope.report.checks.find((check) => check.id === id).status, 'passed', id);
    }

    const compiled = await compileModel(request);
    const compiledProjection = await semanticProjection(compiled);
    const xml = await readFile(`${stem}.bpmn`, 'utf8');
    assert.equal((await validateXml(compiled)).schemaValid, true);
    assert.equal((await validateXml(xml)).schemaValid, true);
    assert.deepEqual(await semanticProjection(xml), compiledProjection, 'layout must preserve all documentation');
    assert.equal(compiledProjection.documentation, undefined, 'Definitions cannot contain BPMN Documentation');
    const primary = compiledProjection.rootElements.find((element) => element.id === `M_${request.model.primaryRef}`);
    assert.deepEqual(
      primary.documentation.map((entry) => entry.text).sort(),
      [modelDocumentation, primaryDocumentation].sort(),
      'model and primary documentation must remain separate, verbatim entries without deduplication',
    );
    assert.deepEqual(compiledProjection.rootElements.find((element) => element.id === 'M_called').documentation, [
      { $type: 'bpmn:Documentation', text: 'Called process instructions.' },
    ]);
    if (primaryKind === 'Collaboration') {
      assert.deepEqual(compiledProjection.rootElements.find((element) => element.id === 'M_primary').documentation, [
        { $type: 'bpmn:Documentation', text: 'Caller process instructions.' },
      ]);
    }
    const svg = await readFile(`${stem}.svg`, 'utf8');
    assert.match(svg, /data-element-id="M_call"/);
    assert.match(svg, /data-element-id="M_review"/);
    assert.deepEqual(JSON.parse(await readFile(handoffPath, 'utf8')).request, original);
    assert.deepEqual(request, original, 'compilation must not relocate fields in the authored request');
  });
}

test('a requested Snapshot and Handoff retain a consequential question without forcing a lifecycle status', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-snapshot-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const request = JSON.parse(await readFile(example, 'utf8'));
  request.issues = [
    {
      key: 'ownerQuestion',
      kind: 'question',
      description: 'Which role reviews the invoice?',
      affectsMeaning: true,
      elementRefs: ['review'],
    },
  ];
  const input = join(dir, 'request.json');
  await writeFile(input, JSON.stringify(request));
  const result = await run([
    'generate',
    '--input',
    input,
    '--output',
    join(dir, 'invoice'),
    '--export',
    'snapshot',
    '--handoff',
    join(dir, 'invoice.openbpmn.json'),
  ]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.signal, 'snapshot_ready');
  assert.equal(envelope.report.export.cleanEligible, false);
  assert.equal(envelope.report.context.issues[0].key, 'ownerQuestion');
  const handoff = JSON.parse(await readFile(join(dir, 'invoice.openbpmn.json'), 'utf8'));
  assert.equal(handoff.lifecycleStatus, undefined);
  assert.equal(handoff.request.issues[0].key, 'ownerQuestion');
  assert.equal(handoff.request.model.processes[0].nodes[1].key, 'review');
  assert.doesNotMatch(await readFile(join(dir, 'invoice.bpmn'), 'utf8'), /Which role|ownerQuestion|lifecycleStatus/);
});

test('an explicit expert export preserves semantic failures in distinct files without touching a normal bundle', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-expert-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stem = join(dir, 'invoice');
  const originals = ['previous model', 'previous preview', 'previous assessment'];
  await Promise.all(
    ['.bpmn', '.svg', '.quality.json'].map((suffix, index) => writeFile(stem + suffix, originals[index])),
  );
  const request = JSON.parse(await readFile(example, 'utf8'));
  request.model.processes[0].flows.push({
    key: 'illegalRestart',
    containerRef: 'reviewProcess',
    sourceRef: 'completed',
    targetRef: 'received',
  });
  const input = join(dir, 'request.json');
  await writeFile(input, JSON.stringify(request));
  const result = await run([
    'generate',
    '--input',
    input,
    '--output',
    stem,
    '--export',
    'snapshot',
    '--expert-invalid',
  ]);
  assert.equal(result.code, 2, result.stdout + result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.signal, 'invalid_exported');
  assert.equal(envelope.status, 'completed');
  assert.equal(envelope.report.export.expertOverride, true);
  assert.equal(envelope.report.export.cleanEligible, false);
  assert.ok(envelope.report.findings.some((finding) => finding.code === 'EVENT_PLACEMENT'));
  assert.ok((await readFile(stem + '.invalid.bpmn', 'utf8')).includes('M_illegalRestart'));
  assert.equal(JSON.parse(await readFile(stem + '.invalid.quality.json', 'utf8')).export.outcome, 'invalid');
  assert.deepEqual(
    await Promise.all(['.bpmn', '.svg', '.quality.json'].map((suffix) => readFile(stem + suffix, 'utf8'))),
    originals,
  );
});

test('the CLI redacts companion credentials but refuses credentials in process meaning without exposing context', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-secrets-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const request = JSON.parse(await readFile(example, 'utf8'));
  const secret = 'ghp_' + 'S'.repeat(36);
  request.evidence[0].summary += ' API key: ' + secret;
  const input = join(dir, 'request.json');
  await writeFile(input, JSON.stringify(request));
  const safe = await run([
    'generate',
    '--input',
    input,
    '--output',
    join(dir, 'safe'),
    '--handoff',
    join(dir, 'safe.openbpmn.json'),
  ]);
  assert.equal(safe.code, 0, safe.stdout + safe.stderr);
  assert.ok(!safe.stdout.includes(secret));
  assert.ok(!safe.stderr.includes(secret));
  assert.ok(!(await readFile(join(dir, 'safe.openbpmn.json'), 'utf8').then((text) => text.includes(secret))));
  assert.ok(JSON.parse(safe.stdout).report.findings.some((f) => f.code === 'SECRET_REDACTED'));
  request.model.processes[0].flows[0].condition = 'api_key=' + secret;
  await writeFile(input, JSON.stringify(request));
  const unsafe = await run(['generate', '--input', input, '--output', join(dir, 'unsafe'), '--debug']);
  assert.equal(unsafe.code, 3, unsafe.stdout + unsafe.stderr);
  assert.ok(!unsafe.stdout.includes(secret));
  assert.ok(!unsafe.stderr.includes(secret));
  assert.deepEqual(JSON.parse(unsafe.stdout).report.context, {});
  assert.ok(!(await readdir(dir)).some((file) => file.startsWith('unsafe')));
});

test('auto and clean refuse consequential ambiguity while an accepted omission can be exported cleanly', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-export-matrix-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const request = JSON.parse(await readFile(example, 'utf8'));
  request.issues = [
    {
      key: 'contradiction',
      kind: 'conflict',
      description: 'The two sources disagree about the review owner.',
      affectsMeaning: true,
      elementRefs: ['review'],
    },
  ];
  const input = join(dir, 'request.json');
  await writeFile(input, JSON.stringify(request));
  for (const mode of ['auto', 'clean']) {
    const refused = await run(['generate', '--input', input, '--output', join(dir, mode), '--export', mode]);
    assert.equal(refused.code, 2);
    assert.equal(JSON.parse(refused.stdout).signal, 'clarification_needed');
  }
  assert.deepEqual(await readdir(dir), ['request.json']);
  request.decisions = [
    {
      key: 'scope',
      description: 'The human accepts omission of ownership assignment from this selected view.',
      elementRefs: ['review'],
    },
  ];
  request.issues[0].resolution = { decisionRef: 'scope', kind: 'acceptedOmission' };
  await writeFile(input, JSON.stringify(request));
  const accepted = await run(['generate', '--input', input, '--output', join(dir, 'accepted'), '--export', 'clean']);
  assert.equal(accepted.code, 0, accepted.stdout + accepted.stderr);
  const result = JSON.parse(accepted.stdout);
  assert.equal(result.signal, 'clean_export_ready');
  assert.ok(result.report.findings.some((f) => f.code === 'DECLARED_OMISSION' && !f.blocksClean));
  assert.equal(result.report.context.issues[0].resolution.decisionRef, 'scope');
});

test('a valid expert request is refused without falsifying checks or creating invalid artifacts', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-unneeded-expert-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const response = await run([
    'generate',
    '--input',
    example,
    '--output',
    join(dir, 'process'),
    '--export',
    'snapshot',
    '--expert-invalid',
  ]);
  assert.equal(response.code, 3, response.stdout + response.stderr);
  const result = JSON.parse(response.stdout);
  assert.equal(result.signal, 'generation_failed');
  for (const id of ['input', 'xml', 'xsd', 'semantics', 'profile', 'di'])
    assert.equal(result.report.checks.find((c) => c.id === id).status, 'passed');
  assert.equal(result.report.export.expertOverride, false);
  assert.deepEqual(await readdir(dir), []);
});

test('resuming a Handoff preserves human status and retained identities through a name correction', async (t) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-resume-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const request = JSON.parse(await readFile(example, 'utf8'));
  const input = join(dir, 'session.openbpmn.json');
  await writeFile(
    input,
    JSON.stringify({
      handoffVersion: '1.0.0',
      request,
      lifecycleStatus: 'Human working copy',
      reviewNotes: ['Recheck responsibility with Finance.'],
    }),
  );
  const stem = join(dir, 'process');
  const first = await run([
    'generate',
    '--input',
    input,
    '--output',
    stem,
    '--handoff',
    join(dir, 'first.openbpmn.json'),
  ]);
  assert.equal(first.code, 0, first.stdout + first.stderr);
  const old = await readFile(stem + '.bpmn', 'utf8');
  const handoff = JSON.parse(await readFile(join(dir, 'first.openbpmn.json'), 'utf8'));
  handoff.request.model.processes[0].nodes[1].name = 'Review invoice details';
  await writeFile(input, JSON.stringify(handoff));
  const second = await run([
    'generate',
    '--input',
    input,
    '--output',
    stem,
    '--replace',
    '--handoff',
    join(dir, 'next.openbpmn.json'),
  ]);
  assert.equal(second.code, 0, second.stdout + second.stderr);
  const current = await readFile(stem + '.bpmn', 'utf8');
  const ids = (xml) => [...xml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(ids(current), ids(old));
  assert.match(current, /id="M_review" name="Review invoice details"/);
  assert.doesNotMatch(current, /Human working copy|Recheck responsibility/);
  const continued = JSON.parse(await readFile(join(dir, 'next.openbpmn.json'), 'utf8'));
  assert.equal(continued.lifecycleStatus, 'Human working copy');
  assert.deepEqual(continued.reviewNotes, ['Recheck responsibility with Finance.']);
  assert.deepEqual(continued.request.links, request.links);
});
