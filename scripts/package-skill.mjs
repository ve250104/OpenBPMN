import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const skill = new URL('skills/bpmn-weave/', root);
await mkdir(new URL('references/', skill), { recursive: true });
await mkdir(new URL('examples/', skill), { recursive: true });
for (const name of ['request', 'handoff', 'quality-report', 'result'])
  await copyFile(new URL(`schemas/${name}.schema.json`, root), new URL(`references/${name}.schema.json`, skill));
await copyFile(new URL('examples/invoice-review.json', root), new URL('examples/invoice-review.json', skill));
await copyFile(new URL('LICENSE', root), new URL('LICENSE', skill));
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version;
await writeFile(
  new URL('version.json', skill),
  JSON.stringify({ toolVersion: version, schemaVersion: '1.0.0', profileVersion: '1.0.0' }, null, 2) + '\n',
);
