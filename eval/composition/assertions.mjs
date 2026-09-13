import assert from 'node:assert/strict';
import { semanticProjection } from '../../dist/compiler.js';

export function assertSvgSymbols(svg, symbols = []) {
  for (const symbol of symbols) {
    const start = svg.indexOf(`data-element-id="${symbol.id}"`);
    assert.ok(start >= 0, symbol.id + ': visible symbol');
    const visual = svg.slice(start).match(/<g\b[^>]*class="djs-visual"[^>]*>([\s\S]*?)<\/g>/)?.[1];
    assert.ok(visual, symbol.id + ': native visual');
    for (const [tag, minimum] of Object.entries(symbol.min ?? {}))
      assert.ok(
        (visual.match(new RegExp('<' + tag + '\\b', 'g')) ?? []).length >= minimum,
        symbol.id + ': expected ' + tag + ' notation',
      );
    if (symbol.dashed !== undefined)
      assert.equal(/stroke-dasharray/.test(visual), symbol.dashed, symbol.id + ': interruption ring');
    if (symbol.marker)
      assert.match(
        visual,
        new RegExp('<path\\b[^>]*data-marker="' + symbol.marker + '"[^>]*\\bd="[^" ]'),
        symbol.id + ': repetition marker',
      );
    if (symbol.text) {
      const plain = svg
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ');
      assert.ok(plain.includes(symbol.text), symbol.id + ': complete label');
    }
  }
}

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
  for (const [id] of expected.facts)
    for (const [side, reference] of [
      ['incoming', 'targetRef'],
      ['outgoing', 'sourceRef'],
    ]) {
      const wanted = graph
        .filter((row) => row[3][reference] === id)
        .map((row) => row[0])
        .sort();
      assert.deepEqual([...(inverses.get(id + '.' + side) ?? [])].sort(), wanted, id + '.' + side);
    }
  return projection;
}
