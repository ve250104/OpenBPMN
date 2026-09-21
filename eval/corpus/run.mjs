import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { BpmnModdle } from 'bpmn-moddle';

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
for (const name of ['request', 'quality-report', 'handoff'])
  ajv.addSchema(await readJson(fileURLToPath(new URL(`../../schemas/${name}.schema.json`, import.meta.url))));
const validateCaseSchema = ajv.compile(await readJson(join(corpusRoot, 'case.schema.json')));
const validateReviewerSchema = ajv.compile(await readJson(join(corpusRoot, 'reviewer.schema.json')));
const validateRunSchema = ajv.compile(await readJson(join(corpusRoot, 'run.schema.json')));
const validateHandoffSchema = ajv.getSchema('urn:openbpmn:schema:handoff:1.0.0');

function options(args) {
  const parsed = { command: args[0], flags: new Map() };
  for (let index = 1; index < args.length; index++) {
    const key = args[index];
    if (key === '--json') parsed.flags.set(key, true);
    else {
      const value = args[++index];
      assert.ok(key?.startsWith('--') && value && !value.startsWith('--'), `Missing value for ${key ?? 'option'}.`);
      assert.ok(!parsed.flags.has(key), `Duplicate option ${key}.`);
      parsed.flags.set(key, value);
    }
  }
  return parsed;
}

function inside(root, candidate, label) {
  const path = resolve(root, candidate);
  const within = relative(root, path);
  assert.ok(
    !isAbsolute(candidate) && !within.startsWith(`..${sep}`) && within !== '..',
    `${label} escapes the corpus root.`,
  );
  return path;
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function validateSourceArtifact(directory, artifact, label) {
  const artifactPath = inside(directory, artifact.path, label);
  const bytes = await readFile(artifactPath);
  assert.equal(hash(bytes), artifact.sha256, `${artifact.id}: stale source hash.`);
  assert.ok(artifact.mediaType && artifact.role && artifact.viewpoint, `${artifact.id}: incomplete inventory.`);
  assert.ok(
    artifact.provenance?.classification && artifact.provenance?.sourceFamily,
    `${artifact.id}: incomplete provenance.`,
  );
  assert.ok(
    artifact.provenance?.sourceVersion && artifact.provenance?.retrievedAt,
    `${artifact.id}: missing source identity.`,
  );
  assert.ok(
    artifact.provenance?.rights?.license &&
      artifact.provenance?.rights?.licenseUrl &&
      artifact.provenance?.rights?.attribution,
    `${artifact.id}: missing redistribution terms.`,
  );
  assert.ok(artifact.transformationHistory?.length > 0, `${artifact.id}: missing transformation history.`);
  return bytes;
}

async function validate(root) {
  const manifest = await readJson(join(root, 'pilot.json'));
  assert.equal(manifest.corpusVersion, '1.0.0');
  assert.equal(manifest.familyCount, 24);
  assert.equal(manifest.cases.length, 24);
  const seenFamilies = new Set();
  const seenCases = new Set();
  const taskCounts = { description: 0, discovery: 0, legacy: 0, maintenance: 0 };
  const domainCounts = new Map();
  const heldOutTasks = new Set();
  const coverageSeen = new Set();
  const publicFamilies = new Set();
  const publicCollections = new Set();
  const epistemicStatuses = new Set();
  const assertionDispositions = new Set();
  const difficultyTags = new Set();
  const variantKinds = new Map(Object.keys(taskCounts).map((task) => [task, new Set()]));
  const overlapPartitions = new Map();
  const legacyExtensions = new Set();
  const cases = [];
  let discoveryHasTranscript = false;
  let discoveryHasPolicy = false;
  let discoveryHasTable = false;
  let discoveryHasDatedMessage = false;
  let discoveryHasNativeDocument = false;

  for (const entry of manifest.cases) {
    assert.ok(!seenFamilies.has(entry.familyId), `Duplicate family identity ${entry.familyId}.`);
    seenFamilies.add(entry.familyId);
    const casePath = inside(root, entry.case, `Case ${entry.familyId}`);
    const contract = await readJson(casePath);
    const directory = dirname(casePath);
    assert.ok(
      validateCaseSchema(contract),
      `${entry.familyId}: case schema invalid: ${ajv.errorsText(validateCaseSchema.errors)}`,
    );
    assert.equal(contract.caseVersion, '1.0.0', `${entry.familyId}: unsupported case contract.`);
    assert.equal(contract.familyId, entry.familyId);
    assert.ok(!seenCases.has(contract.caseId), `Duplicate case identity ${contract.caseId}.`);
    seenCases.add(contract.caseId);
    assert.ok(Object.hasOwn(taskCounts, contract.primaryTask), `${entry.familyId}: unknown primary task.`);
    taskCounts[contract.primaryTask]++;
    domainCounts.set(contract.businessDomain, (domainCounts.get(contract.businessDomain) ?? 0) + 1);
    if (contract.partition === 'held-out') heldOutTasks.add(contract.primaryTask);
    assert.ok(
      ['development', 'known-regression', 'held-out'].includes(contract.partition),
      `${entry.familyId}: invalid partition.`,
    );
    assert.equal(contract.knownRegression, contract.partition === 'known-regression');
    for (const tag of contract.difficultyTags) difficultyTags.add(tag);
    assert.ok(contract.task?.prompt && contract.task?.scope, `${entry.familyId}: missing runnable task.`);
    assert.ok(
      ['supported', 'unsupported'].includes(contract.applicability?.status),
      `${entry.familyId}: invalid applicability.`,
    );
    assert.equal(
      contract.applicability?.fixedBeforeExecution,
      true,
      `${entry.familyId}: applicability was not fixed before execution.`,
    );
    const priorPartition = overlapPartitions.get(contract.upstreamOverlapGroup);
    assert.ok(
      !priorPartition || priorPartition === contract.partition,
      `${entry.familyId}: overlap group crosses partitions.`,
    );
    overlapPartitions.set(contract.upstreamOverlapGroup, contract.partition);

    const reviewerPath = inside(directory, contract.reviewerMaterial, `${entry.familyId} reviewer material`);
    const reviewer = await readJson(reviewerPath);
    assert.ok(
      validateReviewerSchema(reviewer),
      `${entry.familyId}: reviewer schema invalid: ${ajv.errorsText(validateReviewerSchema.errors)}`,
    );
    assert.equal(reviewer.familyId, entry.familyId);
    assert.equal(reviewer.authoredIndependentlyOfCandidate, true);
    assert.ok(reviewer.canary?.startsWith('reviewer-only-canary-'));
    assert.ok(reviewer.assertions.length >= 2, `${entry.familyId}: insufficient reviewer assertions.`);
    assert.deepEqual(
      reviewer.reviewRubric.criteria.map((criterion) => criterion.id).sort(),
      ['ambiguity', 'comprehension', 'correction-effort'],
      `${entry.familyId}: incomplete human-review rubric.`,
    );
    const sourceIds = new Set(contract.sourceArtifacts.map((artifact) => artifact.id));
    assert.equal(sourceIds.size, contract.sourceArtifacts.length, `${entry.familyId}: duplicate source identity.`);
    const claimDispositions = new Map();
    for (const assertion of reviewer.assertions) {
      assert.match(assertion.id, new RegExp(`^${entry.familyId.replaceAll('-', '\\-')}\\.assertion\\.`));
      epistemicStatuses.add(assertion.epistemicStatus);
      assertionDispositions.add(assertion.disposition);
      for (const evidence of assertion.evidence) {
        assert.ok(sourceIds.has(evidence.sourceId), `${assertion.id}: missing evidence source.`);
      }
      const normalized = assertion.claim.toLowerCase().replaceAll(/\s+/g, ' ').trim();
      const previous = claimDispositions.get(normalized);
      assert.ok(
        !previous || previous === assertion.disposition,
        `${entry.familyId}: contradictory expected assertion.`,
      );
      claimDispositions.set(normalized, assertion.disposition);
    }

    const inputPaths = new Set();
    const viewpoints = new Set();
    for (const artifact of contract.sourceArtifacts) {
      assert.ok(!artifact.path.startsWith('reviewer/'), `${entry.familyId}: reviewer material exposed as input.`);
      assert.ok(!inputPaths.has(artifact.path), `${entry.familyId}: duplicate source path.`);
      inputPaths.add(artifact.path);
      const bytes = await validateSourceArtifact(directory, artifact, `${artifact.id} source`);
      viewpoints.add(artifact.viewpoint);
      if (artifact.provenance.classification.startsWith('public-')) {
        publicFamilies.add(entry.familyId);
        publicCollections.add(artifact.provenance.sourceFamily);
      }
      if (contract.primaryTask === 'legacy') legacyExtensions.add(extname(artifact.path));
      if (contract.primaryTask === 'maintenance' && basename(artifact.path) === 'handoff.json') {
        assert.ok(
          validateHandoffSchema(JSON.parse(bytes)),
          `${artifact.id}: invalid OpenBPMN Handoff: ${ajv.errorsText(validateHandoffSchema.errors)}`,
        );
      }
      if (contract.primaryTask === 'discovery') {
        discoveryHasTranscript ||= /transcript|interview/i.test(artifact.path);
        discoveryHasPolicy ||= /policy|sop|checklist/i.test(artifact.path);
        discoveryHasTable ||= ['.csv', '.xlsx'].includes(extname(artifact.path));
        discoveryHasDatedMessage ||= /dated|message/i.test(artifact.path);
        discoveryHasNativeDocument ||= ['.docx', '.xlsx'].includes(extname(artifact.path));
      }
    }
    if (contract.primaryTask === 'discovery')
      assert.ok(viewpoints.size >= 2, `${entry.familyId}: discovery needs two evidence viewpoints.`);
    for (const [tag, assertionIds] of Object.entries(contract.coverage ?? {})) {
      assert.ok(Object.hasOwn(manifest.coverage, tag), `${entry.familyId}: unknown coverage tag ${tag}.`);
      assert.ok(
        assertionIds.length > 0 && assertionIds.every((id) => reviewer.assertions.some((item) => item.id === id)),
        `${entry.familyId}: coverage is not mapped to concrete assertions.`,
      );
      coverageSeen.add(tag);
    }
    const assertionIds = new Set(reviewer.assertions.map((assertion) => assertion.id));
    const reviewerVariants = new Map();
    for (const variant of reviewer.variantAssertions) {
      assert.ok(!reviewerVariants.has(variant.variantId), `${entry.familyId}: duplicate reviewer variant identity.`);
      reviewerVariants.set(variant.variantId, variant);
    }
    for (const variant of contract.variants ?? []) {
      assert.equal(variant.partition, contract.partition, `${entry.familyId}: variant crosses partition.`);
      assert.ok(
        ['meaning-preserving', 'meaning-changing', 'information-removing'].includes(variant.kind),
        `${entry.familyId}: invalid variant kind.`,
      );
      variantKinds
        .get(contract.primaryTask)
        .add(variant.kind === 'information-removing' ? 'meaning-changing' : variant.kind);
      assert.ok(
        variant.replacesSourceIds.every((id) => sourceIds.has(id)),
        `${entry.familyId}: variant replaces an unknown source.`,
      );
      const variantSourceIds = new Set();
      for (const artifact of variant.inputArtifacts) {
        assert.ok(
          !sourceIds.has(artifact.id) && !variantSourceIds.has(artifact.id),
          `${entry.familyId}: duplicate variant source identity.`,
        );
        variantSourceIds.add(artifact.id);
        const bytes = await validateSourceArtifact(directory, artifact, `${entry.familyId} variant`);
        if (contract.primaryTask === 'maintenance' && basename(artifact.path) === 'handoff.json')
          assert.ok(
            validateHandoffSchema(JSON.parse(bytes)),
            `${artifact.id}: invalid OpenBPMN Handoff: ${ajv.errorsText(validateHandoffSchema.errors)}`,
          );
      }
      const stable = new Set(variant.stableAssertionIds);
      const changed = new Set(variant.changedAssertionIds);
      assert.equal(stable.size, variant.stableAssertionIds.length, `${entry.familyId}: duplicate stable assertion.`);
      assert.equal(changed.size, variant.changedAssertionIds.length, `${entry.familyId}: duplicate changed assertion.`);
      assert.ok(
        [...stable].every((id) => !changed.has(id)),
        `${entry.familyId}: variant assertion sets overlap.`,
      );
      assert.deepEqual(
        [...stable, ...changed].sort(),
        [...assertionIds].sort(),
        `${entry.familyId}: variant assertion sets do not cover the base ledger.`,
      );
      const variantReviewer = reviewerVariants.get(variant.id);
      if (variant.kind === 'meaning-preserving') {
        assert.equal(changed.size, 0, `${entry.familyId}: meaning-preserving variant changes expectations.`);
        assert.equal(variantReviewer, undefined, `${entry.familyId}: meaning-preserving variant has overrides.`);
      } else {
        assert.ok(changed.size > 0, `${entry.familyId}: targeted variant changes no expectation.`);
        assert.ok(variantReviewer, `${entry.familyId}: missing reviewer expectations for ${variant.id}.`);
        assert.deepEqual(
          variantReviewer.assertions.map((assertion) => assertion.id).sort(),
          [...changed].sort(),
          `${entry.familyId}: variant overrides do not match changed assertions.`,
        );
        for (const assertion of variantReviewer.assertions) {
          epistemicStatuses.add(assertion.epistemicStatus);
          assertionDispositions.add(assertion.disposition);
          for (const evidence of assertion.evidence)
            assert.ok(
              sourceIds.has(evidence.sourceId) || variantSourceIds.has(evidence.sourceId),
              `${assertion.id}: variant evidence source is not inventoried.`,
            );
        }
      }
    }
    assert.ok(
      reviewer.variantAssertions.every((variant) =>
        contract.variants.some((candidate) => candidate.id === variant.variantId),
      ),
      `${entry.familyId}: reviewer expectations name an unknown variant.`,
    );
    for (const artifact of reviewer.referenceArtifacts ?? []) {
      const path = inside(dirname(reviewerPath), artifact.path, `${entry.familyId} reviewer reference`);
      assert.equal(hash(await readFile(path)), artifact.sha256, `${entry.familyId}: stale reviewer reference hash.`);
    }
    const expectedFiles = new Set([
      relative(directory, casePath),
      relative(directory, reviewerPath),
      ...contract.sourceArtifacts.map((artifact) => artifact.path),
      ...(contract.variants ?? []).flatMap((variant) => variant.inputArtifacts.map((artifact) => artifact.path)),
      ...(reviewer.referenceArtifacts ?? []).map((artifact) => join(dirname(contract.reviewerMaterial), artifact.path)),
    ]);
    const actualFiles = new Set((await files(directory)).map((path) => relative(directory, path)));
    assert.deepEqual(
      [...actualFiles].sort(),
      [...expectedFiles].sort(),
      `${entry.familyId}: unlisted or missing case artifact.`,
    );
    cases.push({ entry, contract, reviewer, directory });
  }

  assert.deepEqual(
    taskCounts,
    manifest.taskAllocation,
    'Primary-task allocation differs from the accepted 6/8/6/4 pilot.',
  );
  assert.ok(domainCounts.size >= 6, 'Pilot needs at least six business domains.');
  assert.ok(Math.max(...domainCounts.values()) <= 6, 'One business domain supplies more than six families.');
  assert.ok(
    publicFamilies.size >= manifest.publicSourceRequirements.minimumFamilies,
    'Not enough public-source families.',
  );
  assert.ok(
    publicCollections.size >= manifest.publicSourceRequirements.minimumCollections,
    'Not enough public collections.',
  );
  assert.deepEqual(
    [...heldOutTasks].sort(),
    Object.keys(taskCounts).sort(),
    'Every primary task needs a held-out family.',
  );
  assert.deepEqual(
    [...coverageSeen].sort(),
    Object.keys(manifest.coverage).sort(),
    'Mandatory coverage is incomplete.',
  );
  for (const [task, kinds] of variantKinds) {
    assert.ok(kinds.has('meaning-preserving'), `${task}: missing meaning-preserving variant.`);
    assert.ok(kinds.has('meaning-changing'), `${task}: missing meaning-changing or information-removing variant.`);
  }
  assert.ok(
    discoveryHasTranscript &&
      discoveryHasPolicy &&
      discoveryHasTable &&
      discoveryHasDatedMessage &&
      discoveryHasNativeDocument,
    'Mixed-evidence format coverage is incomplete.',
  );
  assert.ok(
    ['.bpmn', '.drawio', '.pdf', '.png', '.svg'].every((extension) => legacyExtensions.has(extension)),
    'The six legacy representation families are incomplete.',
  );
  assert.deepEqual(
    [...epistemicStatuses].sort(),
    ['disputed', 'established', 'suggested', 'unknown'],
    'Evidence ledgers must distinguish established, disputed, suggested, and unknown claims.',
  );
  assert.deepEqual(
    [...assertionDispositions].sort(),
    ['forbidden', 'permitted-scope-choice', 'required', 'unresolved'],
    'Evidence ledgers must exercise required, forbidden, unresolved, and permitted scope choices.',
  );
  assert.ok(
    ['routine', 'challenging', 'adversarial'].every((tag) => difficultyTags.has(tag)),
    'Corpus difficulty tags must include routine, challenging, and adversarial families.',
  );
  const allPaths = await files(root);
  assert.ok(!allPaths.some((path) => extname(path).toLowerCase() === '.md'), 'Corpus must not add Markdown files.');

  const smoke = await readJson(inside(root, manifest.smokeCampaign, 'Smoke campaign'));
  assert.equal(smoke.predeclared, true);
  assert.equal(smoke.cases.length, 3);
  assert.equal(smoke.attemptsPerCase, 3);
  assert.equal(smoke.attempts.length, 9);
  assert.equal(new Set(smoke.attempts.map((attempt) => attempt.attemptId)).size, 9);
  assert.ok(
    smoke.attempts.every((attempt) => ['pass', 'fail', 'blocked', 'unsupported', 'not_run'].includes(attempt.status)),
  );
  assert.ok(
    smoke.attempts.every((attempt) => attempt.status !== 'not_run' || attempt.reason),
    'Unrun attempts need a blocking reason.',
  );

  return {
    status: 'pass',
    version: manifest.corpusVersion,
    families: cases.length,
    familiesByTask: taskCounts,
    domains: domainCounts.size,
    maximumFamiliesInOneDomain: Math.max(...domainCounts.values()),
    publicFamilies: publicFamilies.size,
    publicCollections: publicCollections.size,
    epistemicStatuses: [...epistemicStatuses].sort(),
    assertionDispositions: [...assertionDispositions].sort(),
    difficultyTags: [...difficultyTags].sort(),
    missingCoverage: Object.keys(manifest.coverage).filter((tag) => !coverageSeen.has(tag)),
    smoke: {
      plannedAttempts: smoke.attempts.length,
      statuses: Object.fromEntries(
        [...new Set(smoke.attempts.map((attempt) => attempt.status))].map((status) => [
          status,
          smoke.attempts.filter((attempt) => attempt.status === status).length,
        ]),
      ),
      isolation: smoke.host.filesystemIsolation,
    },
  };
}

async function loadCase(root, familyId) {
  const manifest = await readJson(join(root, 'pilot.json'));
  const entry = manifest.cases.find((candidate) => candidate.familyId === familyId);
  assert.ok(entry, `Unknown family ${familyId}.`);
  const casePath = inside(root, entry.case, `Case ${familyId}`);
  const directory = dirname(casePath);
  const bytes = await readFile(casePath);
  const contract = JSON.parse(bytes);
  const reviewerPath = inside(directory, contract.reviewerMaterial, `${familyId} reviewer material`);
  const reviewerBytes = await readFile(reviewerPath);
  return {
    contract,
    directory,
    reviewer: JSON.parse(reviewerBytes),
    caseSha256: hash(bytes),
    assertionSha256: hash(reviewerBytes),
  };
}

function expectedRunSourceArtifacts(contract, variant) {
  const replaced = new Set(variant?.replacesSourceIds ?? []);
  return [
    ...contract.sourceArtifacts
      .filter((artifact) => !replaced.has(artifact.id))
      .map(({ id, path, mediaType, sha256 }) => ({ id, path, mediaType, sha256 })),
    ...(variant?.inputArtifacts ?? []).map(({ id, path, mediaType, sha256 }) => ({
      id,
      path: `variant/${basename(path)}`,
      mediaType,
      sha256,
    })),
  ];
}

async function prepare(root, flags) {
  await validate(root);
  const familyId = flags.get('--case');
  const outputOption = flags.get('--output');
  assert.ok(familyId && outputOption, 'Prepare requires --case ID and --output DIRECTORY.');
  const selected = await loadCase(root, familyId);
  const variantId = flags.get('--variant') ?? null;
  const variant = variantId ? selected.contract.variants.find((candidate) => candidate.id === variantId) : null;
  assert.ok(!variantId || variant, `Unknown variant ${variantId}.`);
  const requestedOutput = resolve(outputOption);
  const parent = await realpath(dirname(requestedOutput));
  const output = resolve(parent, basename(requestedOutput));
  await lstat(output)
    .then(() => assert.fail('Preparation output already exists.'))
    .catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  await mkdir(output);
  await mkdir(join(output, 'inputs'));
  const exposed = [];
  const replacedSourceIds = new Set(variant?.replacesSourceIds ?? []);
  for (const artifact of selected.contract.sourceArtifacts) {
    if (replacedSourceIds.has(artifact.id)) continue;
    const sourcePath = inside(selected.directory, artifact.path, artifact.id);
    const relativePath =
      artifact.path.startsWith(`inputs${sep}`) || artifact.path.startsWith('inputs/')
        ? artifact.path.slice('inputs/'.length)
        : artifact.path;
    const target = join(output, 'inputs', relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(sourcePath, target);
    exposed.push({
      id: artifact.id,
      path: `inputs/${relativePath}`,
      mediaType: artifact.mediaType,
      sha256: artifact.sha256,
    });
  }
  const exposedVariant = [];
  if (variant) {
    await mkdir(join(output, 'variant'));
    for (const artifact of variant.inputArtifacts) {
      const sourcePath = inside(selected.directory, artifact.path, `${familyId} variant`);
      const target = join(output, 'variant', basename(artifact.path));
      await copyFile(sourcePath, target);
      exposedVariant.push({
        id: artifact.id,
        path: `variant/${basename(artifact.path)}`,
        mediaType: artifact.mediaType,
        sha256: artifact.sha256,
      });
    }
  }
  const stagedSources = expectedRunSourceArtifacts(selected.contract, variant);
  assert.deepEqual(
    [...exposed, ...exposedVariant],
    stagedSources,
    'Prepared source inventory drifted from the case contract.',
  );
  const isolation = {
    status: 'not_isolated',
    stagingSeparation: 'case-only-directory',
    filesystemBoundary: 'not_enforced',
    reviewerFilesAccessibleFromHost: true,
    reason:
      'Preparation limits staged inputs, but this local process can still reach the repository and reviewer files.',
    canaryCheck: 'absent_from_staged_files',
  };
  const task = {
    caseContractVersion: selected.contract.caseVersion,
    familyId,
    caseId: selected.contract.caseId,
    variantId,
    title: selected.contract.title,
    primaryTask: selected.contract.primaryTask,
    evaluationLane: selected.contract.evaluationLane,
    prompt: variant?.prompt ?? selected.contract.task.prompt,
    scope: selected.contract.task.scope,
    clarificationAnswers: selected.contract.task.clarificationAnswers,
    correctionTurns:
      variant && selected.contract.primaryTask === 'maintenance'
        ? [variant.prompt]
        : selected.contract.task.correctionTurns,
    applicability: selected.contract.applicability,
    replacesSourceIds: [...replacedSourceIds],
    inputArtifacts: exposed,
    variantArtifacts: exposedVariant,
  };
  const run = {
    runContractVersion: '1.0.0',
    runId: null,
    familyId,
    caseId: selected.contract.caseId,
    variantId,
    caseSha256: selected.caseSha256,
    assertionSha256: selected.assertionSha256,
    sourceArtifacts: stagedSources,
    candidate: {
      commit: flags.get('--candidate-commit') ?? 'not_observed',
      buildIdentity: flags.get('--candidate-build') ?? 'not_observed',
      dirtyState: flags.get('--candidate-dirty') ?? 'not_observed',
    },
    environment: {
      runtime: process.version,
      platform: platform(),
      architecture: arch(),
      browser: 'not_observed',
      host: 'local',
    },
    skill: { version: flags.get('--skill-version') ?? 'not_observed' },
    model: {
      id: flags.get('--model') ?? 'not_observed',
      reasoningSettings: flags.get('--reasoning') ?? 'not_observed',
    },
    prompt: task.prompt,
    answers: task.clarificationAnswers,
    attemptCount: 0,
    attempts: [],
    isolation,
    metrics: { tokens: null, cost: null, humanCorrectionMinutes: null },
    preparedAt: new Date().toISOString(),
  };
  assert.ok(validateRunSchema(run), `Generated run contract is invalid: ${ajv.errorsText(validateRunSchema.errors)}`);
  await writeFile(join(output, 'task.json'), JSON.stringify(task, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(output, 'run.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
  for (const path of await files(output)) {
    const bytes = await readFile(path);
    assert.ok(!bytes.includes(selected.reviewer.canary), 'Reviewer-only canary leaked into prepared inputs.');
  }
  return {
    status: 'ready',
    operation: 'prepare',
    familyId,
    caseId: selected.contract.caseId,
    variantId,
    caseSha256: selected.caseSha256,
    assertionSha256: selected.assertionSha256,
    output,
    isolation,
    inputArtifacts: exposed.length + exposedVariant.length,
  };
}

function bpmnProjection(definitions, xml) {
  const elements = [];
  const flows = [];
  const lanesByNode = new Map();
  const visitLane = (lane) => {
    for (const node of lane.flowNodeRef ?? []) {
      const names = lanesByNode.get(node.id) ?? [];
      names.push(lane.name ?? lane.id);
      lanesByNode.set(node.id, names);
    }
    for (const childSet of lane.childLaneSet ? [lane.childLaneSet] : [])
      for (const child of childSet.lanes ?? []) visitLane(child);
  };
  const visitElements = (items) => {
    for (const element of items ?? []) {
      if (element.$type === 'bpmn:SequenceFlow') {
        flows.push({
          id: element.id,
          name: element.name ?? '',
          source: element.sourceRef?.id,
          target: element.targetRef?.id,
          condition: element.conditionExpression?.body?.trim() ?? '',
        });
      } else if (element.id) {
        elements.push({ id: element.id, name: element.name ?? '', type: element.$type });
      }
      if (element.flowElements) visitElements(element.flowElements);
    }
  };
  for (const rootElement of definitions.rootElements ?? []) {
    if (rootElement.$type !== 'bpmn:Process') continue;
    for (const laneSet of rootElement.laneSets ?? []) for (const lane of laneSet.lanes ?? []) visitLane(lane);
    visitElements(rootElement.flowElements);
  }
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const element of elements) element.lanes = lanesByNode.get(element.id) ?? [];
  for (const flow of flows) {
    flow.sourceName = byId.get(flow.source)?.name ?? '';
    flow.targetName = byId.get(flow.target)?.name ?? '';
  }
  return { elements, flows, byId, xml };
}

function nameMatches(actual, expected, mode = 'equals') {
  if (mode === 'includes') return actual.toLowerCase().includes(expected.toLowerCase());
  return actual === expected;
}

function matcherObserved(projection, matcher) {
  if (matcher.kind === 'element') {
    return projection.elements.some(
      (element) =>
        nameMatches(element.name, matcher.name, matcher.nameMode) &&
        (!matcher.type || element.type === matcher.type) &&
        (!matcher.lane || element.lanes.includes(matcher.lane)),
    );
  }
  if (matcher.kind === 'sequence') {
    return projection.flows.some(
      (flow) =>
        (!matcher.name || flow.name === matcher.name) &&
        (!matcher.source || flow.sourceName === matcher.source) &&
        (!matcher.target || flow.targetName === matcher.target) &&
        (!matcher.condition || flow.condition.replaceAll(/\s+/g, ' ').trim() === matcher.condition),
    );
  }
  if (matcher.kind === 'path') {
    const starts = projection.elements.filter((element) => element.name === matcher.from).map((element) => element.id);
    const targets = new Set(
      projection.elements.filter((element) => element.name === matcher.to).map((element) => element.id),
    );
    const adjacency = new Map();
    for (const flow of projection.flows)
      adjacency.set(flow.source, [...(adjacency.get(flow.source) ?? []), flow.target]);
    const pending = [...starts];
    const visited = new Set();
    while (pending.length) {
      const current = pending.shift();
      if (targets.has(current)) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(adjacency.get(current) ?? []));
    }
    return false;
  }
  if (matcher.kind === 'di-label') {
    const matchingIds = projection.flows.filter((flow) => flow.name === matcher.sequenceName).map((flow) => flow.id);
    return matchingIds.some((id) => {
      const escaped = id.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const edge = new RegExp(
        `<[^>]*BPMNEdge\\b[^>]*bpmnElement=["']${escaped}["'][\\s\\S]*?<\\/[^>]*BPMNEdge>`,
        'i',
      ).exec(projection.xml)?.[0];
      return Boolean(edge && /<[^>]*BPMNLabel\b/i.test(edge));
    });
  }
  throw new Error(`Unknown automated matcher ${matcher.kind}.`);
}

async function assess(root, flags) {
  await validate(root);
  const runOption = flags.get('--run');
  const outputOption = flags.get('--output');
  assert.ok(runOption && outputOption, 'Assess requires --run FILE and --output FILE.');
  const runPath = await realpath(resolve(runOption));
  const runDirectory = dirname(runPath);
  const run = await readJson(runPath);
  assert.equal(run.runContractVersion, '1.0.0', 'Unsupported run contract.');
  assert.ok(validateRunSchema(run), `Invalid run contract: ${ajv.errorsText(validateRunSchema.errors)}`);
  assert.equal(run.attemptCount, run.attempts.length, 'Attempt count cannot omit retained attempts.');
  assert.equal(
    new Set(run.attempts.map((attempt) => attempt.attemptId)).size,
    run.attempts.length,
    'Duplicate attempt identity.',
  );
  const selected = await loadCase(root, run.familyId);
  const selectedVariant = run.variantId
    ? selected.contract.variants.find((variant) => variant.id === run.variantId)
    : null;
  assert.ok(!run.variantId || selectedVariant, `Unknown variant ${run.variantId}.`);
  const variantReviewer = run.variantId
    ? selected.reviewer.variantAssertions.find((variant) => variant.variantId === run.variantId)
    : null;
  const assertionOverrides = new Map((variantReviewer?.assertions ?? []).map((assertion) => [assertion.id, assertion]));
  const effectiveAssertions = selected.reviewer.assertions.map(
    (assertion) => assertionOverrides.get(assertion.id) ?? assertion,
  );
  const expectedSources = expectedRunSourceArtifacts(selected.contract, selectedVariant);
  const inputFindings = [];
  const declaredSources = new Map();
  for (const artifact of run.sourceArtifacts) {
    if (declaredSources.has(artifact.id))
      inputFindings.push({
        code: 'duplicate_source_declaration',
        severity: 'critical',
        status: 'fail',
        artifact: artifact.path,
      });
    declaredSources.set(artifact.id, artifact);
  }
  const observedSources = [];
  for (const expected of expectedSources) {
    const declared = declaredSources.get(expected.id);
    if (!declared)
      inputFindings.push({
        code: 'missing_source_declaration',
        severity: 'critical',
        status: 'fail',
        artifact: expected.path,
      });
    else if (
      declared.path !== expected.path ||
      declared.mediaType !== expected.mediaType ||
      declared.sha256 !== expected.sha256
    )
      inputFindings.push({
        code: 'source_identity_mismatch',
        severity: 'critical',
        status: 'fail',
        artifact: expected.path,
        declared: { path: declared.path, mediaType: declared.mediaType, sha256: declared.sha256 },
        expected,
      });
    const sourcePath = inside(runDirectory, expected.path, `${run.familyId} staged source`);
    try {
      const observedSha256 = hash(await readFile(sourcePath));
      const sourceIdentity = observedSha256 === expected.sha256 ? 'current' : 'stale';
      observedSources.push({
        ...expected,
        declaredSha256: declared?.sha256 ?? null,
        observedSha256,
        identity: sourceIdentity,
      });
      if (sourceIdentity === 'stale')
        inputFindings.push({
          code: 'stale_source_hash',
          severity: 'critical',
          status: 'fail',
          artifact: expected.path,
        });
    } catch (error) {
      observedSources.push({
        ...expected,
        declaredSha256: declared?.sha256 ?? null,
        observedSha256: null,
        identity: 'missing',
      });
      inputFindings.push({
        code: 'missing_source_artifact',
        severity: 'critical',
        status: 'fail',
        artifact: expected.path,
        reason: error.code,
      });
    }
  }
  const expectedSourceIds = new Set(expectedSources.map((artifact) => artifact.id));
  for (const artifact of run.sourceArtifacts)
    if (!expectedSourceIds.has(artifact.id))
      inputFindings.push({
        code: 'unexpected_source_declaration',
        severity: 'critical',
        status: 'fail',
        artifact: artifact.path,
      });
  const identity = {
    case: run.caseSha256 === selected.caseSha256 ? 'current' : 'stale',
    assertions: run.assertionSha256 === selected.assertionSha256 ? 'current' : 'stale',
    sources:
      inputFindings.length === 0
        ? 'current'
        : inputFindings.some((finding) =>
              ['missing_source_declaration', 'missing_source_artifact'].includes(finding.code),
            )
          ? 'missing'
          : 'stale',
  };
  const attempts = [];
  for (const attempt of run.attempts) {
    const result = {
      attemptId: attempt.attemptId,
      recordedStatus: attempt.status,
      status: 'not_run',
      assertions: [],
      findings: [],
      artifacts: [],
    };
    if (attempt.status !== 'completed') {
      result.status = attempt.status;
      result.reason = attempt.reason ?? 'Attempt did not complete.';
      attempts.push(result);
      continue;
    }
    if (inputFindings.length) {
      result.status = 'blocked';
      result.reason = 'Staged source evidence is missing or differs from the recorded run identity.';
      attempts.push(result);
      continue;
    }
    let projection;
    for (const artifact of attempt.artifacts ?? []) {
      const artifactPath = inside(runDirectory, artifact.path, `${attempt.attemptId} artifact`);
      let bytes;
      try {
        bytes = await readFile(artifactPath);
      } catch (error) {
        result.findings.push({
          code: 'missing_artifact',
          severity: 'critical',
          status: 'fail',
          artifact: artifact.path,
          reason: error.code,
        });
        continue;
      }
      const currentHash = hash(bytes);
      result.artifacts.push({
        ...artifact,
        observedSha256: currentHash,
        identity: currentHash === artifact.sha256 ? 'current' : 'stale',
      });
      if (currentHash !== artifact.sha256) {
        result.findings.push({
          code: 'stale_artifact_hash',
          severity: 'critical',
          status: 'fail',
          artifact: artifact.path,
        });
        continue;
      }
      if (artifact.kind === 'bpmn') {
        try {
          const xml = bytes.toString('utf8');
          const parsed = await new BpmnModdle().fromXML(xml);
          if (parsed.warnings.length)
            result.findings.push({
              code: 'bpmn_parse_warning',
              severity: 'major',
              status: 'fail',
              count: parsed.warnings.length,
            });
          projection = bpmnProjection(parsed.rootElement, xml);
        } catch (error) {
          result.findings.push({ code: 'invalid_bpmn', severity: 'critical', status: 'fail', reason: error.message });
        }
      }
    }
    const observations = new Map(
      (attempt.observations ?? []).map((observation) => [observation.assertionId, observation]),
    );
    for (const assertion of effectiveAssertions) {
      let assertionResult;
      if (assertion.evaluation.kind === 'automated') {
        if (!projection) {
          assertionResult = {
            assertionId: assertion.id,
            status: 'blocked',
            method: 'automated',
            reason: 'No readable BPMN artifact.',
          };
        } else {
          const observed = matcherObserved(projection, assertion.evaluation.matcher);
          const passed = assertion.evaluation.matcher.expect === 'absent' ? !observed : observed;
          assertionResult = {
            assertionId: assertion.id,
            status: passed ? 'pass' : 'fail',
            method: 'automated',
            evidence: [
              {
                artifact: attempt.artifacts.find((artifact) => artifact.kind === 'bpmn')?.path,
                locator: assertion.evaluation.matcher.kind,
              },
            ],
          };
          if (!passed)
            result.findings.push({
              assertionId: assertion.id,
              code: assertion.evaluation.code,
              severity: assertion.severity,
              status: 'fail',
              reason: assertion.claim,
            });
        }
      } else {
        const observation = observations.get(assertion.id);
        if (!observation)
          assertionResult = {
            assertionId: assertion.id,
            status: 'not_run',
            method: assertion.evaluation.kind,
            reason: 'No assessment was recorded.',
          };
        else {
          assert.equal(
            observation.method,
            assertion.evaluation.kind,
            `${assertion.id}: assessment origin does not match the declared method.`,
          );
          assert.ok(
            ['pass', 'fail', 'blocked', 'unsupported', 'not_applicable', 'unresolved'].includes(observation.status),
            `${assertion.id}: invalid observation status.`,
          );
          assert.ok(observation.sourceCitations.length > 0, `${assertion.id}: observation needs source citations.`);
          assert.ok(observation.outputCitations.length > 0, `${assertion.id}: observation needs output citations.`);
          const sourcePaths = new Set(expectedSources.map((artifact) => artifact.path));
          assert.ok(
            observation.sourceCitations.every((citation) => sourcePaths.has(citation.artifact)),
            `${assertion.id}: observation cites an unknown source artifact.`,
          );
          const outputLocations = new Set([
            ...attempt.artifacts.map((artifact) => artifact.path),
            'conversation',
            'finalClaims',
          ]);
          assert.ok(
            observation.outputCitations.every((citation) => outputLocations.has(citation.artifact)),
            `${assertion.id}: observation cites an unknown output location.`,
          );
          if (observation.method === 'agent')
            assert.equal(
              observation.adjudicationStatus,
              'proposed',
              `${assertion.id}: agent assessment cannot establish adjudication.`,
            );
          assertionResult = { assertionId: assertion.id, ...observation };
          if (observation.status === 'fail')
            result.findings.push({
              assertionId: assertion.id,
              code: observation.code ?? 'assertion_failed',
              severity: assertion.severity,
              status: 'fail',
              reason: assertion.claim,
            });
        }
      }
      result.assertions.push({
        claim: assertion.claim,
        disposition: assertion.disposition,
        epistemicStatus: assertion.epistemicStatus,
        dimension: assertion.dimension,
        ...assertionResult,
      });
    }
    if (result.findings.some((finding) => finding.status === 'fail')) result.status = 'fail';
    else if (result.assertions.some((assertion) => assertion.status === 'blocked')) result.status = 'blocked';
    else if (result.assertions.some((assertion) => assertion.status === 'unsupported')) result.status = 'unsupported';
    else if (result.assertions.some((assertion) => assertion.status === 'not_run' || assertion.status === 'unresolved'))
      result.status = 'partial';
    else result.status = 'pass';
    attempts.push(result);
  }
  const statuses = {};
  for (const attempt of attempts) statuses[attempt.status] = (statuses[attempt.status] ?? 0) + 1;
  const dimensions = {};
  for (const attempt of attempts) {
    for (const assertionResult of attempt.assertions) {
      const assertion = effectiveAssertions.find((candidate) => candidate.id === assertionResult.assertionId);
      if (!assertion) continue;
      dimensions[assertion.dimension] ??= {};
      const dimension = dimensions[assertion.dimension];
      dimension[assertionResult.status] = (dimension[assertionResult.status] ?? 0) + 1;
    }
  }
  const report = {
    assessmentVersion: '1.0.0',
    status: 'complete',
    familyId: run.familyId,
    caseId: run.caseId,
    variantId: run.variantId,
    runId: run.runId,
    identities: {
      caseSha256: run.caseSha256,
      assertionSha256: run.assertionSha256,
      sourceArtifacts: observedSources,
      ...identity,
    },
    candidate: run.candidate,
    environment: run.environment,
    skill: run.skill,
    model: run.model,
    isolation: run.isolation,
    reviewRubric: selected.reviewer.reviewRubric,
    inputFindings,
    attempts,
    summary: {
      attemptCount: attempts.length,
      statuses,
      criticalFailures:
        attempts.flatMap((attempt) => attempt.findings).filter((finding) => finding.severity === 'critical').length +
        inputFindings.filter((finding) => finding.severity === 'critical').length,
      humanChecks: attempts.flatMap((attempt) => attempt.assertions).filter((assertion) => assertion.method === 'human')
        .length,
      dimensions,
      correctionMinutes: run.metrics.humanCorrectionMinutes,
    },
  };
  const output = resolve(outputOption);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

function comparableSources(artifacts = []) {
  return artifacts
    .map((artifact) => ({ id: artifact.id ?? null, path: artifact.path ?? null, sha256: artifact.sha256 }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
}

async function compare(root, flags) {
  await validate(root);
  const baselineOption = flags.get('--baseline');
  const candidateOption = flags.get('--candidate');
  const outputOption = flags.get('--output');
  assert.ok(
    baselineOption && candidateOption && outputOption,
    'Compare requires --baseline FILE, --candidate FILE, and --output FILE.',
  );
  const baseline = await readJson(await realpath(resolve(baselineOption)));
  const candidate = await readJson(await realpath(resolve(candidateOption)));
  for (const report of [baseline, candidate]) {
    assert.equal(report.assessmentVersion, '1.0.0', 'Unsupported assessment version.');
    assert.equal(report.status, 'complete', 'Only completed assessment records can be compared.');
    assert.equal(report.summary.attemptCount, report.attempts.length, 'Assessment summary omits attempts.');
  }
  const comparisons = [
    ['familyId', baseline.familyId, candidate.familyId],
    ['caseId', baseline.caseId, candidate.caseId],
    ['variantId', baseline.variantId, candidate.variantId],
    ['caseSha256', baseline.identities.caseSha256, candidate.identities.caseSha256],
    ['assertionSha256', baseline.identities.assertionSha256, candidate.identities.assertionSha256],
    ['sourceIdentity', baseline.identities.sources, candidate.identities.sources],
    [
      'sourceArtifacts',
      comparableSources(baseline.identities.sourceArtifacts),
      comparableSources(candidate.identities.sourceArtifacts),
    ],
    ['environment.runtime', baseline.environment.runtime, candidate.environment.runtime],
    ['environment.platform', baseline.environment.platform, candidate.environment.platform],
    ['environment.architecture', baseline.environment.architecture, candidate.environment.architecture],
    ['environment.browser', baseline.environment.browser, candidate.environment.browser],
    ['skill.version', baseline.skill.version, candidate.skill.version],
    ['model.id', baseline.model.id, candidate.model.id],
    ['model.reasoningSettings', baseline.model.reasoningSettings, candidate.model.reasoningSettings],
    ['isolation.status', baseline.isolation.status, candidate.isolation.status],
  ];
  const mismatches = comparisons
    .filter(([, left, right]) => JSON.stringify(left) !== JSON.stringify(right))
    .map(([field, left, right]) => ({ field, baseline: left, candidate: right }));
  const summarize = (report) => ({
    runId: report.runId,
    candidate: report.candidate,
    identityState: {
      case: report.identities.case,
      assertions: report.identities.assertions,
      sources: report.identities.sources,
    },
    attemptCount: report.summary.attemptCount,
    statuses: report.summary.statuses,
    criticalFailures: report.summary.criticalFailures,
    dimensions: report.summary.dimensions,
    correctionMinutes: report.summary.correctionMinutes ?? null,
    attempts: report.attempts,
  });
  const result = {
    comparisonVersion: '1.0.0',
    status: 'complete',
    comparability: mismatches.length ? 'mismatched' : 'comparable',
    mismatches,
    runs: { baseline: summarize(baseline), candidate: summarize(candidate) },
    delta: mismatches.length
      ? null
      : {
          criticalFailures: candidate.summary.criticalFailures - baseline.summary.criticalFailures,
          attemptCount: candidate.summary.attemptCount - baseline.summary.attemptCount,
        },
    interpretation: mismatches.length
      ? 'Runs are retained side by side but not combined because relevant inputs or settings differ.'
      : 'Runs share the declared case, sources, environment, skill, model, and reasoning settings.',
    limits: [
      'Corpus integrity does not establish factual fidelity, clean export, human comprehension, or downstream tenant compatibility.',
      'Null metrics remain unavailable and are not treated as zero or pass.',
    ],
  };
  await writeFile(resolve(outputOption), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

const parsed = options(process.argv.slice(2));
try {
  assert.ok(parsed.command, 'Use validate, prepare, assess, or compare.');
  const requestedRoot = parsed.flags.get('--root');
  const root = requestedRoot ? await realpath(resolve(requestedRoot)) : corpusRoot;
  let result;
  if (parsed.command === 'validate') result = await validate(root);
  else if (parsed.command === 'prepare') result = await prepare(root, parsed.flags);
  else if (parsed.command === 'assess') result = await assess(root, parsed.flags);
  else if (parsed.command === 'compare') result = await compare(root, parsed.flags);
  else throw new Error(`Unknown operation ${parsed.command}.`);
  console.log(JSON.stringify(result, null, parsed.flags.has('--json') ? 2 : 0));
} catch (error) {
  console.log(JSON.stringify({ status: 'fail', operation: parsed.command ?? 'unknown', error: error.message }));
  process.exitCode = 1;
}
