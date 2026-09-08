import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { BpmnModdle } from 'bpmn-moddle';
import { scaleRequest } from '../eval/scale/recipe.mjs';
import { compileModel, semanticProjection } from '../dist/compiler.js';
import { validateModel } from '../dist/semantics.js';
import { layoutXml } from '../dist/layout.js';
import { renderSvg, assessSuppliedDi } from '../dist/renderer.js';
import { diagramConflicts } from '../dist/geometry.js';
import { validateXml } from '../dist/xml.js';

for (const count of [25, 100, 250])
  test(`${count}-node exact scale recipe retains all semantics and readable geometry`, async () => {
    const request = JSON.parse(await readFile(new URL(`../eval/scale/${count}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(request, scaleRequest(count));
    assert.equal(request.model.processes.flatMap((process) => process.nodes).length, count);
    assert.equal(
      request.model.processes.flatMap((process) => process.flows).length +
        request.model.collaboration.messageFlows.length,
      count * 2,
    );
    assert.equal(request.model.collaboration.participants.length, 5);
    assert.equal(request.model.processes.flatMap((process) => process.lanes).length, 10);
    assert.deepEqual(validateModel(request), []);
    const compiled = await compileModel(request);
    const xml = await layoutXml(compiled, request);
    assert.equal((await validateXml(xml)).schemaValid, true);
    assert.deepEqual(await semanticProjection(xml), await semanticProjection(compiled));
    const parsed = await new BpmnModdle().fromXML(xml);
    assert.deepEqual(assessSuppliedDi(parsed.rootElement, parsed.elementsById), []);
    assert.deepEqual(
      parsed.rootElement.diagrams.flatMap((diagram) => diagramConflicts(diagram.plane)),
      [],
    );
    const svg = await renderSvg(xml);
    assert.equal(xml, await layoutXml(compiled, request));
    assert.equal(svg, await renderSvg(xml));
  });
