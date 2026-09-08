import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const fontsSource = new URL('node_modules/@fontsource/noto-sans/', root);
const viewerSource = new URL('node_modules/bpmn-js/', root);
const runtime = new URL('assets/runtime/', root);
const fonts = new URL('assets/fonts/', root);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(JSON.parse(await readFile(new URL('package.json', fontsSource))).version, '5.3.0');
assert.equal(JSON.parse(await readFile(new URL('package.json', viewerSource))).version, '18.28.0');
await mkdir(runtime, { recursive: true });
await mkdir(fonts, { recursive: true });

const faces = [];
for (const weight of [400, 700]) {
  const css = await readFile(new URL(`${weight}.css`, fontsSource), 'utf8');
  for (const match of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const block = match[1];
    const filename = block.match(/\.\/files\/([^)]*\.woff2)/)?.[1];
    const unicodeRange = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    assert.ok(filename && unicodeRange, 'The pinned font CSS must declare its local WOFF2 file and Unicode ranges.');
    const bytes = await readFile(new URL(`files/${filename}`, fontsSource));
    await writeFile(new URL(filename, fonts), bytes);
    faces.push({ file: filename, weight, unicodeRange, sha256: digest(bytes) });
  }
}
assert.equal(faces.length, 16, 'All pinned normal 400/700 subsets must be packaged.');
const metrics = JSON.parse(await readFile(new URL('metrics.json', fonts), 'utf8'));
assert.deepEqual(
  metrics.faces.map(({ file, sha256 }) => ({ file, sha256 })),
  faces.map(({ file, sha256 }) => ({ file, sha256 })),
  'Regenerate checked-in font metrics when the pinned font assets change.',
);
await copyFile(new URL('LICENSE', fontsSource), new URL('LICENSE', fonts));
const viewer = await readFile(new URL('dist/bpmn-viewer.production.min.js', viewerSource));
await writeFile(new URL('bpmn-viewer.production.min.js', runtime), viewer);
await copyFile(new URL('LICENSE', viewerSource), new URL('LICENSE.bpmn-js', runtime));
await writeFile(
  new URL('manifest.json', runtime),
  JSON.stringify(
    {
      viewer: {
        version: '18.28.0',
        file: 'bpmn-viewer.production.min.js',
        sha256: digest(viewer),
        source: 'https://registry.npmjs.org/bpmn-js/18.28.0',
      },
      font: {
        family: 'Noto Sans',
        version: '5.3.0',
        source: 'https://registry.npmjs.org/@fontsource%2fnoto-sans/5.3.0',
        faces,
      },
    },
    null,
    2,
  ) + '\n',
);
