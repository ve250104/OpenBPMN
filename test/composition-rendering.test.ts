import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { BpmnModdle } from 'bpmn-moddle';
import { compileModel, semanticProjection } from '../dist/compiler.js';
import { layoutXml } from '../dist/layout.js';
import { renderSvg, assessSuppliedDi } from '../dist/renderer.js';
import { diagramConflicts } from '../dist/geometry.js';
import { validateXml } from '../dist/xml.js';
import { assertMeaning, assertSvgSymbols } from '../eval/composition/assertions.mjs';

const directory = new URL('../eval/composition/', import.meta.url);
for (const name of (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()) {
  test(`full-profile composition geometry and real Viewer: ${name}`, async () => {
    const request = JSON.parse(await readFile(new URL(`${name}/request.json`, directory), 'utf8'));
    const expected = JSON.parse(await readFile(new URL(`${name}/expected.json`, directory), 'utf8'));
    const compiled = await compileModel(request);
    const xml = await layoutXml(compiled, request);
    await assertMeaning(xml, expected);
    assert.equal((await validateXml(xml)).schemaValid, true);
    assert.deepEqual(await semanticProjection(xml), await semanticProjection(compiled));
    const parsed = await new BpmnModdle().fromXML(xml);
    assert.deepEqual(assessSuppliedDi(parsed.rootElement, parsed.elementsById), []);
    const diagrams = parsed.rootElement.diagrams;
    assert.deepEqual(
      diagrams.map((diagram) => diagram.plane.bpmnElement.id).sort(),
      expected.visible.map((plane) => plane.plane).sort(),
    );
    for (const plane of expected.visible) {
      const actual = diagrams.find((diagram) => diagram.plane.bpmnElement.id === plane.plane).plane;
      for (const [type, ids] of [
        ['bpmndi:BPMNShape', plane.shapes],
        ['bpmndi:BPMNEdge', plane.edges],
      ]) {
        assert.deepEqual(
          actual.planeElement
            .filter((element) => element.$type === type)
            .map((element) => element.bpmnElement.id)
            .sort(),
          [...ids].sort(),
        );
      }
      assert.deepEqual(diagramConflicts(actual), []);
    }
    const svg = await renderSvg(xml);
    assertSvgSymbols(svg, expected.symbols);
    for (const plane of expected.visible)
      for (const id of [...plane.shapes, ...plane.edges]) assert.ok(svg.includes(`data-element-id="${id}"`), id);
    assert.equal(xml, await layoutXml(compiled, request));
    assert.equal(svg, await renderSvg(xml));
  });
}
