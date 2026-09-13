import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.artifacts', 'dist'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
const paths = await walk(root);
const skillRoot = join(root, 'skills', 'bpmn-weave');
for (const name of ['request', 'handoff', 'quality-report', 'result'])
  assert.deepEqual(
    await readFile(join(root, 'schemas', name + '.schema.json')),
    await readFile(join(skillRoot, 'references', name + '.schema.json')),
    'A generated skill schema is stale. Run npm run build.',
  );
assert.deepEqual(await readFile(join(root, 'LICENSE')), await readFile(join(skillRoot, 'LICENSE')));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(JSON.parse(await readFile(join(skillRoot, 'version.json'), 'utf8')).toolVersion, packageJson.version);
const lockedPackage = JSON.parse(await readFile(join(root, 'npm-shrinkwrap.json'), 'utf8')).packages[''];
assert.equal(lockedPackage.version, packageJson.version);
assert.equal(lockedPackage.name, packageJson.name);
assert.deepEqual(lockedPackage.dependencies, packageJson.dependencies, 'Runtime dependency lock is stale.');
assert.deepEqual(lockedPackage.devDependencies, packageJson.devDependencies, 'Development dependency lock is stale.');
assert.ok(
  !paths.includes(join(root, 'package-lock.json')),
  'Use one canonical publishable shrinkwrap, not competing locks.',
);
assert.ok(
  !Object.keys(packageJson.scripts).some((name) => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name)),
  'Installation must have no lifecycle execution.',
);
for (const version of Object.values(packageJson.dependencies))
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.]+)?$/, 'Runtime dependencies must be exact pins.');

const ajv = new Ajv({ allErrors: true, strict: true });
for (const name of ['request', 'quality-report', 'handoff', 'result'])
  ajv.addSchema(JSON.parse(await readFile(join(root, 'schemas', name + '.schema.json'), 'utf8')));
for (const path of paths.filter(
  (path) => path.startsWith(join(root, 'examples') + sep) && path.endsWith('.json') && !path.endsWith('.quality.json'),
)) {
  assert.ok(
    ajv.validate('urn:openbpmn:schema:request:1.0.0', JSON.parse(await readFile(path, 'utf8'))),
    'Example does not match its schema: ' + relative(root, path),
  );
}
for (const path of paths.filter((path) => path.endsWith('.md') && !path.startsWith(join(root, 'assets') + sep))) {
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split('#')[0];
    if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
    const target = resolve(dirname(path), decodeURIComponent(link));
    if (path.startsWith(skillRoot + sep)) {
      const within = relative(skillRoot, target);
      assert.ok(!within.startsWith('..') && !isAbsolute(within), 'Skill reference escapes its portable folder.');
    }
    await stat(target).catch(() => {
      throw new Error('Broken local reference in ' + relative(root, path) + ': ' + link);
    });
  }
  assert.ok(!/[\t ]+$/m.test(text), 'Trailing whitespace: ' + relative(root, path));
}
const notices = JSON.parse(await readFile(join(root, 'assets', 'notices', 'manifest.json'), 'utf8'));
for (const notice of notices)
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(root, 'assets', 'notices', notice.file)))
      .digest('hex'),
    notice.sha256,
  );
console.log(
  'Schemas, examples, portable references, versions, local links and available notice hashes verified. Release qualification is separate.',
);
