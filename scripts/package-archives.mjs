import assert from 'node:assert/strict';
import { zipSync, unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const skill = join(root, 'skills', 'bpmn-weave');
const destination = join(root, '.artifacts');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    assert.ok(!entry.isSymbolicLink(), 'Skill archives contain ordinary files only.');
    const path = join(directory, entry.name);
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...(await files(path, name + '/')));
    else {
      assert.ok(entry.isFile());
      result.push([name, await readFile(path)]);
    }
  }
  return result;
}
const entries = await files(skill);
const zip = zipSync(
  Object.fromEntries(
    entries.map(([name, data]) => [
      'bpmn-weave/' + name,
      [data, { mtime: new Date(2000, 0, 1), os: 3, attrs: 0o100644 << 16 }],
    ]),
  ),
  { level: 9 },
);
const unpacked = unzipSync(zip);
assert.equal(Object.keys(unpacked).length, entries.length);
for (const [name, data] of entries)
  assert.deepEqual(
    Buffer.from(unpacked['bpmn-weave/' + name]),
    data,
    'Skill archive differs from its canonical folder.',
  );
await mkdir(destination, { recursive: true });
const name = `bpmn-weave-skill-${version}.zip`;
await writeFile(join(destination, name), zip);
await writeFile(
  join(destination, 'skill-archive.json'),
  JSON.stringify(
    {
      version,
      archive: name,
      sha256: createHash('sha256').update(zip).digest('hex'),
      bytes: zip.length,
      files: entries.map(([path, data]) => ({ path, sha256: createHash('sha256').update(data).digest('hex') })),
    },
    null,
    2,
  ) + '\n',
);
console.log('Packaged identical portable skill: ' + name);
