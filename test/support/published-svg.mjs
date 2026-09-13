import assert from 'node:assert/strict';

export function assertPublishedSvgEquivalent(actual, expected) {
  // The packaged font has a measured macOS/Linux centering delta below 0.00051
  // user units. Allow at most 0.001 only for the emitted tspan x attribute;
  // text, wrapping, y positions, notation, routes, fonts, and all other bytes stay exact.
  const positions = (svg) => {
    const x = [];
    const structure = svg.replace(/<tspan x="(-?\d+(?:\.\d+)?)"/g, (_match, value) => {
      x.push(Number(value));
      return '<tspan x="[text-centering]"';
    });
    return { x, structure };
  };
  const left = positions(actual);
  const right = positions(expected);
  if (left.structure !== right.structure) {
    let offset = 0;
    while (left.structure[offset] === right.structure[offset]) offset++;
    assert.fail(`Published SVG differs beyond text centering at character ${offset}; inspect the retained SVG pair.`);
  }
  for (let index = 0; index < left.x.length; index++) {
    assert.ok(
      Math.abs(left.x[index] - right.x[index]) <= 0.001,
      `Published SVG tspan ${index + 1} x changed from ${right.x[index]} to ${left.x[index]} (maximum delta 0.001).`,
    );
  }
}
