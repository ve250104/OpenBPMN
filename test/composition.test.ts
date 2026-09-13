import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileModel } from '../dist/compiler.js';
import { parseInput } from '../dist/input.js';
import { validateXml } from '../dist/xml.js';
import { assertMeaning } from '../eval/composition/assertions.mjs';

const manifest = JSON.parse(await readFile(new URL('../eval/composition/manifest.json', import.meta.url), 'utf8'));
const fixtureIds = manifest.fixtures.map((fixture) => fixture.id);

for (const id of fixtureIds) {
  test(`composition ${id} preserves its independently authored expected process meaning`, async () => {
    const root = new URL(`../eval/composition/${id}/`, import.meta.url);
    const parsed = parseInput(await readFile(new URL('request.json', root), 'utf8'));
    assert.ok(parsed.request, JSON.stringify(parsed.findings));
    const expected = JSON.parse(await readFile(new URL('expected.json', root), 'utf8'));
    const xml = await compileModel(parsed.request);
    assert.equal((await validateXml(xml)).schemaValid, true);
    await assertMeaning(xml, expected);
    const identities = new Set(expected.facts.map((fact) => fact[0]));
    for (const diagram of expected.visible) {
      assert.ok(identities.has(diagram.plane), 'Every expected plane resolves.');
      for (const id of [...diagram.shapes, ...diagram.edges])
        assert.ok(identities.has(id), 'Every expected visible element resolves.');
      assert.equal(new Set([...diagram.shapes, ...diagram.edges]).size, diagram.shapes.length + diagram.edges.length);
    }
    assert.ok(expected.scenarios.length >= 3);
    for (const scenario of expected.scenarios) {
      assert.ok(scenario.expected.length > 0);
      for (const id of scenario.path)
        assert.ok(identities.has(id), 'Every review scenario references an existing fact.');
    }
  });
}

test('the composition corpus contains all eight agreed families and the unreduced 40-node 60-connector collaboration', async () => {
  assert.equal(new Set(manifest.fixtures.map((fixture) => fixture.family)).size, 8);
  const request = JSON.parse(
    await readFile(new URL('../eval/composition/supplier-order-collaboration/request.json', import.meta.url), 'utf8'),
  );
  assert.equal(request.model.collaboration.participants.length, 3);
  assert.equal(request.model.processes.flatMap((process) => process.nodes).length, 40);
  assert.equal(
    request.model.processes.flatMap((process) => process.flows).length +
      request.model.collaboration.messageFlows.length,
    60,
  );
  assert.ok(
    request.model.processes.some((process) =>
      process.lanes.some((lane) => process.lanes.some((parent) => parent.key === lane.parentRef)),
    ),
  );
});

test('the independent composition oracle detects renamed work, changed routing and missing responsibility', async () => {
  const root = new URL('../eval/composition/purchase-approval-lane-ownership/', import.meta.url);
  const request = JSON.parse(await readFile(new URL('request.json', root), 'utf8'));
  const expected = JSON.parse(await readFile(new URL('expected.json', root), 'utf8'));
  const xml = await compileModel(request);
  for (const altered of [
    xml.replace('name="Review budget and rationale"', 'name="Skip budget review"'),
    xml.replace('targetRef="M_place"', 'targetRef="M_rejected"'),
    xml.replace('<bpmn:flowNodeRef>M_review</bpmn:flowNodeRef>', ''),
  ]) {
    assert.notEqual(altered, xml);
    await assert.rejects(assertMeaning(altered, expected), assert.AssertionError);
  }
});
