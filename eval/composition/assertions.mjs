import assert from 'node:assert/strict';
import { semanticProjection } from '../../dist/compiler.js';

// Expected rows are authored separately from requests. This reader only flattens
// returned XML facts; it never emits BPMN or supplies an expected model.
export async function assertMeaning(xml, expected) {
  const projection = await semanticProjection(xml);
  const rows = [];
  const inverses = new Map();
  function visit(element, parent = null) {
    const attributes = {};
    for (const [property, value] of Object.entries(element)) {
      if (property === 'id' || property === '$type') continue;
      if (property === 'incoming' || property === 'outgoing') {
        inverses.set(element.id + '.' + property, value);
        continue;
      }
      if (Array.isArray(value) && value.length && value.every((child) => typeof child === 'object' && child.id)) {
        for (const child of value) visit(child, element.id + '.' + property);
      } else if (value && typeof value === 'object' && !Array.isArray(value) && value.id) {
        visit(value, element.id + '.' + property);
      } else attributes[property] = value;
    }
    rows.push([element.id, element.$type, parent, attributes]);
  }
  visit(projection);
  const sorted = (values) => [...values].sort((a, b) => a[0].localeCompare(b[0], 'en'));
  assert.deepEqual(sorted(rows), sorted(expected.facts), expected.title + ': exact independent semantic facts');
  // incoming/outgoing are redundant inverses, checked against the authored graph.
  const graph = expected.facts.filter((row) => row[1] === 'bpmn:SequenceFlow');
  for (const [id] of expected.facts) for (const [side, reference] of [['incoming', 'targetRef'], ['outgoing', 'sourceRef']]) {
    const wanted = graph.filter((row) => row[3][reference] === id).map((row) => row[0]).sort();
    assert.deepEqual([...(inverses.get(id + '.' + side) ?? [])].sort(), wanted, id + '.' + side);
  }
  return projection;
}
