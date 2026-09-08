import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateXml } from '../dist/xml.js';
import { spawnSync } from 'node:child_process';

test('the official local XSD distinguishes legal Definitions from a missing required namespace', async () => {
  const valid =
    '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="urn:test"><process id="P" isExecutable="false"/></definitions>';
  assert.deepEqual(await validateXml(valid), { xmlValid: true, schemaValid: true, findings: [] });
  const invalid = await validateXml(valid.replace(' targetNamespace="urn:test"', ''));
  assert.equal(invalid.xmlValid, true);
  assert.equal(invalid.schemaValid, false);
  assert.equal(invalid.findings[0].code, 'BPMN_XSD');
  assert.equal(JSON.stringify(invalid).includes('urn:test'), false);
});

test('schema validation does not inherit entry-point-only Node flags into its worker', () => {
  const moduleUrl = new URL('../dist/xml.js', import.meta.url).href;
  const xml = '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="urn:test"/>';
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { validateXml } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await validateXml(${JSON.stringify(xml)})));`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).schemaValid, true);
});

test('unsafe XML remains inert and diagnostic output never echoes a supplied payload', async () => {
  const marker = 'PRIVATE_SOURCE_MUST_NOT_ENTER_DIAGNOSTICS';
  for (const xml of [
    `<!DOCTYPE definitions [<!ENTITY payload SYSTEM "file:///${marker}">]><definitions>&payload;</definitions>`,
    `<!DOCTYPE definitions SYSTEM "https://example.invalid/${marker}"><definitions/>`,
    `<?xml-stylesheet href="https://example.invalid/${marker}"?><definitions/>`,
    `<definitions><broken>${marker}</definitions>`,
  ]) {
    const result = await validateXml(xml);
    assert.equal(result.xmlValid, false);
    assert.equal(result.schemaValid, false);
    assert.ok(!JSON.stringify(result).includes(marker));
  }
  const bounded = await validateXml('x'.repeat(5 * 1024 * 1024 + 1));
  assert.equal(bounded.findings[0].code, 'INPUT_LIMIT');
});

test('cancelling a running schema worker rejects promptly without a completed assessment', async () => {
  const controller = new AbortController();
  const assessment = validateXml('<definitions/>', { signal: controller.signal });
  controller.abort();
  await assert.rejects(assessment, (error) => error.code === 'DEPENDENCY_FAILURE');
});
