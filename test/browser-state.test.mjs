import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { compileModel } from '../dist/compiler.js';
import { layoutXml } from '../dist/layout.js';
import { browserCapability, renderSvg } from '../dist/renderer.js';

const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

for (const failure of [false, true]) {
  test(`browser configuration and font caches stay disposable after ${failure ? 'launch failure' : 'rendering'}`, {
    skip: process.platform === 'win32',
  }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bpmn-weave-browser-state-test-'));
    const originalConfig = process.env.XDG_CONFIG_HOME;
    const originalCache = process.env.XDG_CACHE_HOME;
    try {
      const browser = await browserCapability();
      assert.equal(browser.available, true);
      const observation = join(directory, 'observation.json');
      const probe = join(directory, 'probe.mjs');
      await writeFile(
        probe,
        `
        import { mkdir, stat, writeFile } from 'node:fs/promises';
        import { dirname, join } from 'node:path';
        const profile = process.argv.find(arg => arg.startsWith('--user-data-dir=')).slice(16);
        const paths = [process.env.XDG_CONFIG_HOME, process.env.XDG_CACHE_HOME];
        const mode = (await stat(profile)).mode & 0o777;
        await writeFile(${JSON.stringify(observation)}, JSON.stringify({ profile, paths, mode }));
        for (const path of paths) {
          // Never write into an inherited user directory when exercising the red case.
          if (path && dirname(path) === profile) {
            await mkdir(path, { recursive: true });
            await writeFile(join(path, 'synthetic-browser-state'), 'test state');
          }
        }
      `,
      );
      const wrapper = join(directory, 'browser.sh');
      await writeFile(
        wrapper,
        `#!/bin/sh\n${quote(process.execPath)} ${quote(probe)} "$@" || exit 1\n` +
          (failure ? 'exit 1\n' : `exec ${quote(browser.path)} "$@"\n`),
        { mode: 0o700 },
      );
      const request = JSON.parse(await readFile(new URL('../examples/invoice-review.json', import.meta.url), 'utf8'));
      const xml = await layoutXml(await compileModel(request), request);
      if (failure) {
        await assert.rejects(() => renderSvg(xml, { browserExecutable: wrapper }), { code: 'DEPENDENCY_FAILURE' });
      } else {
        assert.match(await renderSvg(xml, { browserExecutable: wrapper }), /<svg/);
      }
      const observed = JSON.parse(await readFile(observation, 'utf8'));
      assert.equal(observed.mode, 0o700);
      for (const path of observed.paths) {
        assert.equal(typeof path, 'string', 'Browser config/cache must have an invocation-private location.');
        assert.equal(dirname(path), observed.profile);
        await assert.rejects(() => stat(path), { code: 'ENOENT' });
      }
      await assert.rejects(() => stat(observed.profile), { code: 'ENOENT' });
      assert.equal(process.env.XDG_CONFIG_HOME, originalConfig);
      assert.equal(process.env.XDG_CACHE_HOME, originalCache);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
