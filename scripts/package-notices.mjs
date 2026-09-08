import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const destination = new URL('assets/notices/', root);
await mkdir(destination, { recursive: true });
const manifest = [];
for (const [packageName, files] of Object.entries({
  'bpmn-moddle': ['LICENSE'],
  'bpmn-auto-layout': ['package.json', 'README.md'],
  'libxml2-wasm': ['LICENSE', 'LICENSE.libxml2'],
  ajv: ['LICENSE'],
  saxen: ['LICENSE'],
})) {
  const source = new URL(`node_modules/${packageName}/`, root);
  const version = JSON.parse(await readFile(new URL('package.json', source), 'utf8')).version;
  for (const file of files) {
    const name = packageName + '.' + file;
    await copyFile(new URL(file, source), new URL(name, destination));
    manifest.push({
      package: packageName,
      version,
      file: name,
      sha256: createHash('sha256')
        .update(await readFile(new URL(file, source)))
        .digest('hex'),
    });
  }
}
const puppeteerLicense = new URL('assets/license-sources/puppeteer-core.LICENSE', root);
const layoutLicense = new URL('assets/license-sources/bpmn-auto-layout.LICENSE', root);
const layoutNoticeHash = createHash('sha256')
  .update(await readFile(layoutLicense))
  .digest('hex');
if (layoutNoticeHash !== 'b40e4b8f5966bebfbfc5c4ea46d294013076df895570a2d1a2ad9e80445a2d88')
  throw new Error('The corrected upstream layout notice changed.');
await copyFile(layoutLicense, new URL('bpmn-auto-layout.LICENSE', destination));
manifest.push({
  package: 'bpmn-auto-layout',
  version: '2.0.0-alpha.2',
  file: 'bpmn-auto-layout.LICENSE',
  sha256: layoutNoticeHash,
  source: 'https://raw.githubusercontent.com/bpmn-io/bpmn-auto-layout/9eaa3b13532691b36f75d23806a84ccf53a91979/LICENSE',
  note: 'Original release declares MIT; exact notice supplied from the subsequent upstream correction for the missing license file.',
});
await copyFile(puppeteerLicense, new URL('puppeteer-core.LICENSE', destination));
manifest.push({
  package: 'puppeteer-core',
  version: '25.10.0',
  file: 'puppeteer-core.LICENSE',
  sha256: createHash('sha256')
    .update(await readFile(puppeteerLicense))
    .digest('hex'),
  source: 'https://raw.githubusercontent.com/puppeteer/puppeteer/88b517ab3beb4a237b541cd18ada98ba43de71a7/LICENSE',
});
await writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
