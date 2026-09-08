import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join, isAbsolute, relative } from 'node:path';

export function evaluateRelease(index, verified = { candidate: false, files: new Set() }) {
  const candidate = index.candidate;
  const candidateReady =
    candidate &&
    /^[a-f0-9]{40}$/.test(candidate.commit) &&
    /^[a-f0-9]{64}$/.test(candidate.packageSha256) &&
    /^[a-f0-9]{64}$/.test(candidate.skillSha256) &&
    candidate.version === '0.1.0' &&
    candidate.cleanTree === true &&
    verified.candidate;
  const gates = index.requirements.map((requirement) => {
    const observed = index.observations.filter((item) => item.id === requirement.id);
    const observation = observed.at(-1);
    const bound =
      candidateReady &&
      observation?.commit === candidate.commit &&
      observation?.packageSha256 === candidate.packageSha256 &&
      observation?.skillSha256 === candidate.skillSha256;
    const evidence =
      observation?.evidence?.length &&
      observation.evidence.every((item) => verified.files.has(item.path + ':' + item.sha256));
    const matchingKind = observation?.kind === requirement.kind;
    const complete = observation?.status === 'pass' && bound && evidence && matchingKind && observation.flaky !== true;
    return {
      id: requirement.id,
      required: requirement.required,
      status: complete ? 'pass' : observation?.status === 'fail' ? 'fail' : 'not_run',
      reason: complete
        ? 'Candidate-bound evidence files verified; review records remain subject to maintainer approval.'
        : !observation
          ? 'No complete observation recorded.'
          : !bound
            ? 'Candidate archives, clean checkout or observation binding could not be verified.'
            : !matchingKind
              ? 'Observation role does not satisfy the required evidence kind.'
              : !evidence
                ? 'Evidence files/hashes could not be verified.'
                : 'The required check is not a non-flaky pass.',
    };
  });
  return {
    releaseReady: Boolean(candidateReady && gates.every((gate) => !gate.required || gate.status === 'pass')),
    candidateReady: Boolean(candidateReady),
    gates,
  };
}

export async function verifyRelease(index, root) {
  const directory = await realpath(root);
  const verified = { candidate: false, files: new Set() };
  async function verifyFile(path, sha256) {
    if (
      typeof path !== 'string' ||
      isAbsolute(path) ||
      path.split(/[\\/]/).some((part) => part === '..') ||
      !/^[a-f0-9]{64}$/.test(sha256)
    )
      return false;
    try {
      const target = resolve(directory, path);
      if (!(await lstat(target)).isFile() || relative(directory, await realpath(target)).startsWith('..')) return false;
      const actual = createHash('sha256')
        .update(await readFile(target))
        .digest('hex');
      if (actual !== sha256) return false;
      verified.files.add(path + ':' + sha256);
      return true;
    } catch {
      return false;
    }
  }
  const candidate = index.candidate;
  if (candidate) {
    const archives =
      (await verifyFile(candidate.packagePath, candidate.packageSha256)) &&
      (await verifyFile(candidate.skillPath, candidate.skillSha256));
    try {
      const git = (args) =>
        execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      verified.candidate =
        archives &&
        git(['rev-parse', 'HEAD']) === candidate.commit &&
        git(['status', '--porcelain', '--untracked-files=all']) === '';
    } catch {
      /* A release must be verified from its clean source checkout. */
    }
  }
  for (const observation of index.observations) {
    for (const item of observation.evidence ?? []) await verifyFile(item.path, item.sha256);
  }
  return evaluateRelease(index, verified);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  // Candidate observations live outside tracked sources so recording evidence cannot dirty its own source commit.
  let source;
  try {
    source = await readFile(join(root, '.artifacts/release-evidence.json'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    source = await readFile(join(root, 'eval/release-evidence.json'), 'utf8');
  }
  const canonical = JSON.parse(await readFile(join(root, 'eval/release-evidence.json'), 'utf8'));
  const supplied = JSON.parse(source);
  const index = { ...canonical, candidate: supplied.candidate, observations: supplied.observations };
  const result = await verifyRelease(index, root);
  await mkdir(join(root, '.artifacts'), { recursive: true });
  await writeFile(join(root, '.artifacts/acceptance-summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.releaseReady ? 0 : 1;
}
