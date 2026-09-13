import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPublishedSvgEquivalent } from './support/published-svg.mjs';

const expected =
  '<svg viewBox="0 0 100 100"><style>text{font-family:WeaveSans}</style><defs><marker id="arrow"><path d="M0 0 L2 1 L0 2z"/></marker></defs><g data-element-id="Task"><rect x="1" y="2" width="90" height="50"/><text><tspan x="10.800094604492188" y="14.8">Purchase order sent</tspan></text></g><path d="M1 2 L90 2" marker-end="url(#arrow)"/></svg>';

test('published SVG comparison permits only measured sub-millipixel horizontal text variation', () => {
  const linuxTextMetric = expected.replace('10.800094604492188', '10.799591064453125');
  assert.doesNotThrow(() => assertPublishedSvgEquivalent(linuxTextMetric, expected));
});

for (const [meaning, before, after] of [
  ['larger horizontal text movement', '10.800094604492188', '10.802'],
  ['vertical text movement', 'y="14.8"', 'y="14.8001"'],
  ['changed label', 'Purchase order sent', 'Purchase order cancelled'],
  ['missing label', 'Purchase order sent', ''],
  ['changed wrapping', 'Purchase order sent', 'Purchase</tspan><tspan x="10" y="29">order sent'],
  ['missing label element', '<tspan x="10.800094604492188" y="14.8">Purchase order sent</tspan>', ''],
  ['shape movement', 'x="1"', 'x="1.0001"'],
  ['shape size', 'width="90"', 'width="89"'],
  ['route change', 'M1 2 L90 2', 'M1 2 L91 2'],
  ['notation symbol change', 'M0 0 L2 1 L0 2z', 'M0 0 L2 2 L0 2z'],
  ['missing arrowhead', 'marker-end="url(#arrow)"', ''],
  ['identity change', 'data-element-id="Task"', 'data-element-id="AnotherTask"'],
  ['font change', 'font-family:WeaveSans', 'font-family:Arial'],
  ['canvas crop', 'viewBox="0 0 100 100"', 'viewBox="0 0 90 100"'],
  ['non-finite text position', '10.800094604492188', 'NaN'],
]) {
  test(`published SVG comparison rejects ${meaning}`, () => {
    const changed = expected.replace(before, after);
    assert.notEqual(changed, expected, 'the counterexample must actually modify the fixture');
    assert.throws(() => assertPublishedSvgEquivalent(changed, expected), { code: 'ERR_ASSERTION' });
  });
}
