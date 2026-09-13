import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { BpmnModdle } from 'bpmn-moddle';
import { runCommand } from '../dist/core.js';
import { assertMeaning, assertSvgSymbols } from '../eval/composition/assertions.mjs';
import { variants } from '../eval/composition/notation-variants.mjs';

for (const fixture of variants) {
  test(fixture.title, async (t) => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'bpmn-weave-profile-')));
    let passed = false;
    t.after(async () => {
      if (passed) await rm(directory, { recursive: true, force: true });
      else t.diagnostic('Failed profile evidence retained at ' + directory);
    });
    await writeFile(join(directory, 'request.json'), JSON.stringify(fixture.request, null, 2));
    await writeFile(join(directory, 'expected.json'), JSON.stringify(fixture.expected, null, 2));
    const stem = join(directory, 'model');
    const result = await runCommand(
      { command: 'generate', values: { input: '-', output: stem, export: 'clean' } },
      { stdin: Readable.from([JSON.stringify(fixture.request)]) },
    );
    await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2));
    assert.equal(result.signal, 'clean_export_ready', JSON.stringify(result.report.findings));
    for (const id of ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render'])
      assert.equal(result.report.checks.find((check) => check.id === id)?.status, 'passed', id);
    const xml = await readFile(stem + '.bpmn', 'utf8');
    const svg = await readFile(stem + '.svg', 'utf8');
    await assertMeaning(xml, fixture.expected);
    const parsed = await new BpmnModdle().fromXML(xml);
    const sorted = (ids) => [...ids].sort();
    assert.deepEqual(
      sorted(parsed.rootElement.diagrams.map((diagram) => diagram.plane.bpmnElement.id)),
      sorted(fixture.expected.visible.map((plane) => plane.plane)),
    );
    for (const plane of fixture.expected.visible) {
      const actual = parsed.rootElement.diagrams.find((diagram) => diagram.plane.bpmnElement.id === plane.plane).plane;
      for (const [type, ids] of [
        ['bpmndi:BPMNShape', plane.shapes],
        ['bpmndi:BPMNEdge', plane.edges],
      ]) {
        assert.deepEqual(
          sorted(
            actual.planeElement.filter((element) => element.$type === type).map((element) => element.bpmnElement.id),
          ),
          sorted(ids),
        );
        for (const id of ids) assert.ok(svg.includes(`data-element-id="${id}"`), id);
      }
    }
    assertSvgSymbols(svg, fixture.expected.symbols);
    if (fixture.id === 'activity-classifications') {
      const missingIcons = svg.replace(/<path\b[^>]*(?:\/\s*>|>\s*<\/path>)/g, '');
      assert.notEqual(missingIcons, svg);
      assert.throws(() => assertSvgSymbols(missingIcons, fixture.expected.symbols), assert.AssertionError);
    }
    passed = true;
  });
}
