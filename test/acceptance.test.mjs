import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateRelease, verifyRelease } from '../scripts/acceptance.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const candidate = {
  commit: 'a'.repeat(40),
  packageSha256: 'b'.repeat(64),
  skillSha256: 'c'.repeat(64),
  version: '0.1.0',
  cleanTree: true,
};
const index = () => ({
  candidate,
  requirements: [
    { id: 'human', kind: 'human', required: true },
    { id: 'tenant', kind: 'tenant', required: false },
  ],
  observations: [],
});
test('missing, stale, flaky and wrong-kind observations cannot qualify a human release gate', () => {
  const evidence = index();
  assert.equal(evaluateRelease(evidence).releaseReady, false);
  const observation = {
    id: 'human',
    kind: 'human',
    status: 'pass',
    commit: candidate.commit,
    packageSha256: candidate.packageSha256,
    evidence: [{ path: 'review.json', sha256: 'd'.repeat(64) }],
  };
  for (const invalid of [
    { ...observation, kind: 'automated' },
    { ...observation, packageSha256: 'e'.repeat(64) },
    { ...observation, flaky: true },
    { ...observation, evidence: [] },
    { ...observation, status: 'not_run' },
  ]) {
    evidence.observations = [invalid];
    assert.equal(evaluateRelease(evidence).releaseReady, false);
  }
  evidence.observations = [observation];
  assert.equal(
    evaluateRelease(evidence).releaseReady,
    false,
    'Metadata alone cannot certify that artifacts or evidence exist.',
  );
});

test('qualification verifies real files and archive hashes against a clean source commit', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bpmn-weave-release-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '--quiet']);
  await writeFile(join(root, '.gitignore'), '.artifacts/\n');
  git(['add', '.gitignore']);
  git([
    '-c',
    'user.name=Release check',
    '-c',
    'user.email=check@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'Test fixture',
  ]);
  await mkdir(join(root, '.artifacts'));
  const proof = async (path, contents) => {
    await writeFile(join(root, path), contents);
    return { path, sha256: createHash('sha256').update(contents).digest('hex') };
  };
  const archive = await proof('.artifacts/package.tgz', 'package');
  const skill = await proof('.artifacts/skill.zip', 'skill');
  const review = await proof('.artifacts/review.json', 'human review record');
  const evidence = index();
  evidence.candidate = {
    ...candidate,
    commit: git(['rev-parse', 'HEAD']),
    packagePath: archive.path,
    packageSha256: archive.sha256,
    skillPath: skill.path,
    skillSha256: skill.sha256,
  };
  evidence.observations = [
    {
      id: 'human',
      kind: 'human',
      status: 'pass',
      commit: evidence.candidate.commit,
      packageSha256: archive.sha256,
      skillSha256: skill.sha256,
      evidence: [review],
    },
  ];
  assert.equal(
    (await verifyRelease(evidence, root)).releaseReady,
    true,
    'Optional unrun tenant observations do not block recorded qualification.',
  );
  await writeFile(join(root, review.path), 'altered review');
  assert.equal((await verifyRelease(evidence, root)).releaseReady, false);
  await writeFile(join(root, review.path), 'human review record');
  evidence.observations[0].evidence[0].path = '../outside.json';
  assert.equal((await verifyRelease(evidence, root)).releaseReady, false);
  evidence.observations[0].evidence = [{ ...review, path: '.artifacts/review.json' }];
  await writeFile(join(root, archive.path), 'changed archive');
  assert.equal((await verifyRelease(evidence, root)).releaseReady, false);
  await writeFile(join(root, archive.path), 'package');
  await writeFile(join(root, '.gitignore'), '.artifacts/\n# dirty\n');
  assert.equal((await verifyRelease(evidence, root)).releaseReady, false);
});
