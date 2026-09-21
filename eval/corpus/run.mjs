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
const validateQualityReportSchema = ajv.getSchema('urn:openbpmn:schema:quality-report:1.0.0');

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

function validateMaintenanceBaseline(familyId, handoff, variantId = null) {
  const process = handoff.request.model.processes[0];
  const nodes = new Map(process.nodes.map((item) => [item.key, item]));
  const flows = process.flows;
  const hasFlow = (sourceRef, targetRef) =>
    flows.some((item) => item.sourceRef === sourceRef && item.targetRef === targetRef);
  if (familyId === 'account-closure-maintenance') {
    assert.equal(nodes.get('closure-controls-split')?.type, 'parallelGateway');
    assert.equal(nodes.get('closure-controls-join')?.type, 'parallelGateway');
    assert.ok(hasFlow('closure-controls-split', 'settle-balance'));
    assert.ok(hasFlow('closure-controls-split', 'revoke-access'));
    assert.ok(hasFlow('settle-balance', 'closure-controls-join'));
    assert.ok(hasFlow('revoke-access', 'closure-controls-join'));
    assert.ok(
      !nodes.has('archive-notification'),
      'Account-closure baseline already contains the requested correction.',
    );
  } else if (familyId === 'incident-escalation-maintenance') {
    const timer = nodes.get('escalation-clock');
    assert.equal(timer?.type, 'boundaryEvent');
    assert.equal(timer?.attachedToRef, 'investigate');
    assert.equal(timer?.interrupting, false);
    assert.equal(timer?.event?.kind, 'timer');
    assert.equal(timer?.event?.timeDuration, variantId === 'three-to-two-hours' ? 'PT3H' : 'PT4H');
  } else if (familyId === 'purchase-approval-maintenance') {
    assert.equal(nodes.get('approval-threshold')?.type, 'exclusiveGateway');
    assert.equal(nodes.get('prepare-po')?.name, 'Create purchase order');
    assert.ok(
      flows.some(
        (item) =>
          item.sourceRef === 'approval-threshold' &&
          item.targetRef === 'finance-approval' &&
          item.condition === 'amount >= 5000',
      ),
    );
    assert.ok(
      flows.some(
        (item) =>
          item.sourceRef === 'approval-threshold' &&
          item.targetRef === 'prepare-po' &&
          item.key === nodes.get('approval-threshold').defaultFlowRef &&
          item.name === 'Below EUR 5,000',
      ),
    );
  } else if (familyId === 'returns-authorization-maintenance') {
    assert.ok(nodes.has('warehouse-approval'));
    assert.equal(nodes.get('choose-remedy')?.type, 'exclusiveGateway');
    assert.ok(hasFlow('choose-remedy', 'refund'));
    assert.ok(hasFlow('choose-remedy', 'replacement'));
  }
  return { familyId, variantId, status: 'pass' };
}

async function validate(root) {
  const manifest = await readJson(join(root, 'pilot.json'));
  assert.equal(manifest.corpusVersion, '2.0.0', `Unsupported corpus version ${manifest.corpusVersion}.`);
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
  const maintenancePreconditions = [];
  let completedExpectationReviews = 0;
  let ledgerFacts = 0;
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
    assert.equal(
      contract.caseVersion,
      '2.0.0',
      `${entry.familyId}: unsupported case contract ${contract.caseVersion}.`,
    );
    assert.ok(
      validateCaseSchema(contract),
      `${entry.familyId}: case schema invalid: ${ajv.errorsText(validateCaseSchema.errors)}`,
    );
    assert.equal(contract.familyId, entry.familyId);
    assert.ok(!seenCases.has(contract.caseId), `Duplicate case identity ${contract.caseId}.`);
    seenCases.add(contract.caseId);
    assert.ok(Object.hasOwn(taskCounts, contract.primaryTask), `${entry.familyId}: unknown primary task.`);
    if (contract.primaryTask === 'maintenance')
      assert.equal(
        contract.correctionContract?.baselineRequired,
        true,
        `${entry.familyId}: maintenance correction requires a paired baseline contract.`,
      );
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
    assert.equal(
      reviewer.reviewVersion,
      '2.0.0',
      `${entry.familyId}: unsupported reviewer contract ${reviewer.reviewVersion}.`,
    );
    assert.ok(
      validateReviewerSchema(reviewer),
      `${entry.familyId}: reviewer schema invalid: ${ajv.errorsText(validateReviewerSchema.errors)}`,
    );
    assert.equal(reviewer.familyId, entry.familyId);
    assert.equal(reviewer.authoredIndependentlyOfCandidate, true);
    assert.equal(reviewer.expectationReview.status, 'completed', `${entry.familyId}: expectation review is missing.`);
    assert.equal(
      reviewer.expectationReview.adjudication,
      'proposed-not-expert',
      `${entry.familyId}: independent agent review must not imply expert adjudication.`,
    );
    completedExpectationReviews++;
    assert.ok(reviewer.canary?.startsWith('reviewer-only-canary-'));
    assert.ok(reviewer.assertions.length >= 2, `${entry.familyId}: insufficient reviewer assertions.`);
    assert.deepEqual(
      reviewer.reviewRubric.criteria.map((criterion) => criterion.id).sort(),
      ['ambiguity', 'comprehension', 'correction-effort'],
      `${entry.familyId}: incomplete human-review rubric.`,
    );
    const sourceIds = new Set(contract.sourceArtifacts.map((artifact) => artifact.id));
    for (const fact of reviewer.sourceFactLedger ?? []) {
      assert.ok(sourceIds.has(fact.sourceId), `${fact.id}: fact ledger cites an unknown source.`);
      ledgerFacts++;
    }
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
        const handoff = JSON.parse(bytes);
        assert.ok(
          validateHandoffSchema(handoff),
          `${artifact.id}: invalid OpenBPMN Handoff: ${ajv.errorsText(validateHandoffSchema.errors)}`,
        );
        maintenancePreconditions.push(validateMaintenanceBaseline(entry.familyId, handoff));
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
        if (contract.primaryTask === 'maintenance' && basename(artifact.path) === 'handoff.json') {
          const handoff = JSON.parse(bytes);
          assert.ok(
            validateHandoffSchema(handoff),
            `${artifact.id}: invalid OpenBPMN Handoff: ${ajv.errorsText(validateHandoffSchema.errors)}`,
          );
          maintenancePreconditions.push(validateMaintenanceBaseline(entry.familyId, handoff, variant.id));
        }
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
  for (const familyId of ['expense-reimbursement', 'supplier-onboarding-discovery', 'editable-flowchart-translation']) {
    const selected = cases.find((item) => item.entry.familyId === familyId);
    assert.ok(selected.reviewer.sourceFactLedger?.length >= 4, `${familyId}: richer pack needs a source-fact ledger.`);
  }
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
  const reliability = await readJson(inside(root, manifest.reliabilityCampaign, 'Reliability campaign'));
  assert.equal(reliability.campaignVersion, '2.0.0');
  assert.deepEqual(reliability.sessions.map((session) => session.familyId).sort(), [
    'editable-flowchart-translation',
    'expense-reimbursement',
    'supplier-onboarding-discovery',
  ]);
  assert.ok(
    reliability.sessions.every(
      (session) =>
        ['completed', 'failed', 'blocked', 'unsupported', 'not_run'].includes(session.status) &&
        (session.status !== 'not_run' || session.reason),
    ),
    'Fresh-session execution and unrun reasons must be reported honestly.',
  );
  assert.equal(reliability.retainedDiagnostics.status, 'available');
  const retainedCompatibility = await readJson(
    inside(root, reliability.retainedDiagnostics.compatibilityRecord, 'Retained compatibility record'),
  );
  assert.equal(retainedCompatibility.sourceRunContractVersion, '1.0.0');
  assert.equal(retainedCompatibility.currentEvaluator.regraded, false);
  assert.equal(retainedCompatibility.currentEvaluator.crossVersionScoreDeltaAllowed, false);
  const historicalProvenance = await readJson(
    inside(root, reliability.historicalScorerReproduction.record, 'Historical scorer reproduction'),
  );
  assert.equal(historicalProvenance.evaluator.relationship, 'direct-parent');
  assert.equal(historicalProvenance.evaluator.runContractVersion, '1.0.0');
  assert.equal(historicalProvenance.assessment.statuses.pass, 3);
  assert.ok(
    historicalProvenance.counterexamples.every((counterexample) => counterexample.historicalAssessment === 'pass'),
  );
  for (const session of reliability.sessions) {
    if (session.run) {
      const retainedRun = await readJson(inside(root, session.run, `${session.familyId} fresh run`));
      const retainedAssessment = await readJson(
        inside(root, session.assessment, `${session.familyId} fresh assessment`),
      );
      assert.equal(retainedRun.runContractVersion, '2.0.0');
      assert.equal(retainedAssessment.assessmentVersion, '2.0.0');
      assert.equal(retainedAssessment.identities.case, 'current');
      assert.equal(retainedAssessment.identities.assertions, 'current');
      assert.equal(retainedAssessment.identities.sources, 'current');
    } else await readJson(inside(root, session.record, `${session.familyId} session record`));
  }

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
    sourceReview: {
      familiesReviewed: completedExpectationReviews,
      ledgerFacts,
      adjudication: 'proposed-not-expert',
    },
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
    freshSessions: {
      planned: reliability.sessions.length,
      completed: reliability.sessions.filter((session) => session.status === 'completed').length,
      unsupported: reliability.sessions.filter((session) => session.status === 'unsupported').length,
      notRun: reliability.sessions.filter((session) => session.status === 'not_run').length,
      isolation: reliability.isolation.filesystemBoundary,
    },
    maintenancePreconditions,
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
    runContractVersion: '2.0.0',
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
  const edges = new Map();
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
  const visitElements = (items, container) => {
    for (const element of items ?? []) {
      if (element.$type === 'bpmn:SequenceFlow') {
        flows.push({
          id: element.id,
          name: element.name ?? '',
          source: element.sourceRef?.id,
          target: element.targetRef?.id,
          condition: element.conditionExpression?.body?.trim() ?? '',
          container,
        });
      } else if (element.id) {
        const eventDefinition = element.eventDefinitions?.[0];
        elements.push({
          id: element.id,
          name: element.name ?? '',
          type: element.$type,
          container,
          documentation: (element.documentation ?? []).map((item) => item.text ?? '').join('\n'),
          attachedTo: element.attachedToRef?.id ?? null,
          interrupting: element.cancelActivity ?? null,
          event: eventDefinition
            ? {
                type: eventDefinition.$type,
                timeDate: eventDefinition.timeDate?.body ?? null,
                timeDuration: eventDefinition.timeDuration?.body ?? null,
                timeCycle: eventDefinition.timeCycle?.body ?? null,
              }
            : null,
        });
      }
      if (element.flowElements) visitElements(element.flowElements, element.id);
    }
  };
  for (const rootElement of definitions.rootElements ?? []) {
    if (rootElement.$type !== 'bpmn:Process') continue;
    for (const laneSet of rootElement.laneSets ?? []) for (const lane of laneSet.lanes ?? []) visitLane(lane);
    visitElements(rootElement.flowElements, rootElement.id);
  }
  for (const diagram of definitions.diagrams ?? []) {
    for (const item of diagram.plane?.planeElement ?? []) {
      if (item.$type !== 'bpmndi:BPMNEdge' || !item.bpmnElement?.id) continue;
      const bounds = item.label?.bounds;
      edges.set(item.bpmnElement.id, {
        waypoints: (item.waypoint ?? []).map(({ x, y }) => ({ x, y })),
        labelBounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
      });
    }
  }
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const element of elements) element.lanes = lanesByNode.get(element.id) ?? [];
  for (const flow of flows) {
    flow.sourceName = byId.get(flow.source)?.name ?? '';
    flow.targetName = byId.get(flow.target)?.name ?? '';
  }
  return { elements, flows, byId, edges, xml };
}

function nameMatches(actual, expected, mode = 'equals') {
  if (mode === 'includes') return actual.toLowerCase().includes(expected.toLowerCase());
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

function typeMatches(actual, expected, allowGenericTask = false) {
  if (!expected || actual === expected) return true;
  return allowGenericTask && actual === 'bpmn:Task' && expected.endsWith('Task');
}

function isTaskType(type) {
  return /^bpmn:(?:Task|UserTask|ManualTask|ServiceTask|BusinessRuleTask|ScriptTask|SendTask|ReceiveTask)$/.test(type);
}

function elementMatches(element, matcher) {
  const names = [matcher.name, ...(matcher.aliases ?? [])].filter(Boolean);
  const types = matcher.types ?? (matcher.type ? [matcher.type] : []);
  return (
    (!names.length || names.some((name) => nameMatches(element.name, name, matcher.nameMode))) &&
    (!types.length || types.some((type) => typeMatches(element.type, type, matcher.allowGenericTask))) &&
    (!matcher.lane || element.lanes.some((lane) => nameMatches(lane, matcher.lane)))
  );
}

function adjacency(projection, excluded = new Set()) {
  const result = new Map();
  for (const flow of projection.flows) {
    if (excluded.has(flow.source) || excluded.has(flow.target)) continue;
    result.set(flow.source, [...(result.get(flow.source) ?? []), flow.target]);
  }
  return result;
}

function reachable(projection, starts, targets, excluded = new Set()) {
  const targetIds = new Set(targets);
  const graph = adjacency(projection, excluded);
  const pending = starts.filter((id) => !excluded.has(id));
  const visited = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (targetIds.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return false;
}

function reachableWithoutRequiredJoin(projection, start, target, excluded) {
  const graph = adjacency(projection, excluded);
  const incoming = new Map();
  for (const flow of projection.flows) incoming.set(flow.target, [...(incoming.get(flow.target) ?? []), flow.source]);
  const requiredIds = [...excluded];
  const pending = [start];
  const visited = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const element = projection.byId.get(current);
    const sources = incoming.get(current) ?? [];
    const synchronizingJoin =
      sources.length > 1 && ['bpmn:InclusiveGateway', 'bpmn:ParallelGateway'].includes(element?.type);
    if (synchronizingJoin && sources.some((source) => reachable(projection, requiredIds, [source]))) continue;
    pending.push(...(graph.get(current) ?? []));
  }
  return false;
}

function resolveUnique(projection, name, label, aliases = []) {
  const names = [name, ...aliases];
  const matches = projection.elements.filter((element) =>
    names.some((candidate) => nameMatches(element.name, candidate)),
  );
  if (matches.length === 1) return { element: matches[0] };
  if (matches.length > 1) return { status: 'unresolved', reason: `Ambiguous ${label} binding for ${name}.` };
  return { status: 'fail', reason: `No ${label} matched ${name}.` };
}

function comparison(operator, left, right) {
  if (operator === '<') return left < right;
  if (operator === '<=') return left <= right;
  if (operator === '>') return left > right;
  if (operator === '>=') return left >= right;
  return left === right;
}

function parsedCondition(text) {
  const normalized = text.replaceAll(/\s+/g, ' ').trim();
  const direct = /^([A-Za-z][A-Za-z0-9_.-]*)\s*(<=|>=|<|>|==|=)\s*(-?\d+(?:\.\d+)?)$/i.exec(normalized);
  if (direct) return { variable: direct[1], operator: direct[2], value: Number(direct[3]), reversed: false };
  const reversed = /^(-?\d+(?:\.\d+)?)\s*(<=|>=|<|>|==|=)\s*([A-Za-z][A-Za-z0-9_.-]*)$/i.exec(normalized);
  if (!reversed) {
    const natural =
      /^(?:claim\s+)?([A-Za-z][A-Za-z0-9_.-]*)\s+is\s+(less than or equal to|greater than or equal to|less than|greater than)\s+(?:[A-Z]{3}\s+)?(-?\d[\d,]*(?:\.\d+)?)\.?$/i.exec(
        normalized,
      );
    if (!natural) return null;
    const operators = {
      'less than': '<',
      'less than or equal to': '<=',
      'greater than': '>',
      'greater than or equal to': '>=',
    };
    return {
      variable: natural[1],
      operator: operators[natural[2].toLowerCase()],
      value: Number(natural[3].replaceAll(',', '')),
      reversed: false,
    };
  }
  const inverse = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=', '==': '==' };
  return {
    variable: reversed[3],
    operator: inverse[reversed[2]],
    value: Number(reversed[1]),
    reversed: true,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

function matcherResult(projection, matcher, renderedSvg) {
  if (matcher.kind === 'element') {
    const matches = projection.elements.filter((element) => elementMatches(element, matcher));
    if (matches.length > 1 && matcher.expect === 'present')
      return { status: 'unresolved', reason: `Declared concept matched ${matches.length} elements.` };
    if (!matches.length && matcher.expect === 'present') {
      const declaredNames = [matcher.name, ...(matcher.aliases ?? [])].filter(Boolean);
      const named = projection.elements.filter((element) => declaredNames.includes(element.name));
      if (
        matcher.allowGenericTask &&
        named.some(
          (element) => isTaskType(element.type) && !typeMatches(element.type, matcher.type, matcher.allowGenericTask),
        )
      )
        return {
          status: 'unresolved',
          reason: 'The activity uses a consequential task specialization that the source did not establish.',
        };
      if (named.length) return { observed: false };
      const contextual = projection.elements.filter(
        (element) =>
          (matcher.types ?? [matcher.type]).some((type) => typeMatches(element.type, type, matcher.allowGenericTask)) &&
          (!matcher.lane || element.lanes.some((lane) => nameMatches(lane, matcher.lane))),
      );
      if (contextual.length)
        return { status: 'unresolved', reason: 'A plausible element exists, but its wording is not a declared alias.' };
    }
    if (matches.length === 1 && matcher.start) {
      const start = resolveUnique(projection, matcher.start, 'start', matcher.startAliases);
      if (start.status) return start;
      return { observed: reachable(projection, [start.element.id], [matches[0].id]) };
    }
    return { observed: matches.length > 0 };
  }
  if (matcher.kind === 'sequence') {
    const matches = projection.flows.filter(
      (flow) =>
        (!matcher.name || flow.name === matcher.name) &&
        (!matcher.source || flow.sourceName === matcher.source) &&
        (!matcher.target || flow.targetName === matcher.target) &&
        (!matcher.condition ||
          typeof matcher.condition !== 'string' ||
          flow.condition.replaceAll(/\s+/g, ' ').trim() === matcher.condition),
    );
    if (matches.length > 1 && matcher.expect === 'present')
      return { status: 'unresolved', reason: `Sequence matcher has ${matches.length} possible bindings.` };
    return { observed: matches.length > 0 };
  }
  if (matcher.kind === 'path') {
    const start = resolveUnique(projection, matcher.from, 'path origin', matcher.aliases);
    if (start.status) return start;
    const target = resolveUnique(projection, matcher.to, 'path destination', matcher.targetAliases);
    if (target.status) return target;
    if (matcher.start) {
      const relevantStart = resolveUnique(projection, matcher.start, 'relevant start');
      if (relevantStart.status) return relevantStart;
      if (!reachable(projection, [relevantStart.element.id], [start.element.id])) return { observed: false };
    }
    return { observed: reachable(projection, [start.element.id], [target.element.id]) };
  }
  if (matcher.kind === 'dependency') {
    const start = resolveUnique(projection, matcher.start, 'relevant start', matcher.startAliases);
    if (start.status) return start;
    const target = resolveUnique(projection, matcher.to, 'path destination', matcher.targetAliases);
    if (target.status) return target;
    const names = matcher.required;
    const resolved = names.map((name) => resolveUnique(projection, name, 'path constraint', matcher.aliases));
    const issue = resolved.find((item) => item.status);
    if (issue) return issue;
    if (!reachable(projection, [start.element.id], [target.element.id])) return { observed: false };
    const bypasses = resolved.map((item) =>
      reachableWithoutRequiredJoin(projection, start.element.id, target.element.id, new Set([item.element.id])),
    );
    return {
      observed: bypasses.every((bypass) => !bypass),
      measurements: { constrainedElements: names, bypasses },
    };
  }
  if (matcher.kind === 'condition') {
    const matches = projection.flows.filter(
      (flow) =>
        (!matcher.name || [matcher.name, ...(matcher.aliases ?? [])].some((name) => nameMatches(flow.name, name))) &&
        (!matcher.source ||
          [matcher.source, ...(matcher.sourceAliases ?? [])].some((name) => nameMatches(flow.sourceName, name))) &&
        (!matcher.target ||
          [matcher.target, ...(matcher.targetAliases ?? [])].some((name) => nameMatches(flow.targetName, name))),
    );
    if (matches.length !== 1)
      return {
        status: matches.length ? 'unresolved' : 'fail',
        reason: matches.length ? 'Condition destination is ambiguous.' : 'Condition destination is missing.',
      };
    if (typeof matcher.condition === 'string')
      return { observed: matches[0].condition.replaceAll(/\s+/g, ' ').trim() === matcher.condition };
    if (matcher.condition.allowedExpressions) {
      const expression = matches[0].condition.replaceAll(/\s+/g, ' ').trim();
      if (matcher.condition.allowedExpressions.includes(expression))
        return { observed: true, measurements: { expression, declaredEquivalent: true } };
      if (matcher.condition.forbiddenExpressions?.includes(expression))
        return { observed: false, measurements: { expression, declaredEquivalent: false } };
      return {
        status: 'unresolved',
        reason: 'Condition text is not one of the declared reviewed expressions.',
        measurements: { expression, declaredEquivalent: false },
      };
    }
    const actual = parsedCondition(matches[0].condition);
    if (!actual)
      return { status: 'unresolved', reason: 'Condition uses syntax outside the declared comparison subset.' };
    if (actual.variable.toLowerCase() !== matcher.condition.variable.toLowerCase())
      return { status: 'unresolved', reason: 'Condition variable is not a declared equivalent.' };
    const boundary = matcher.condition.value;
    const samples = [boundary - 1, boundary, boundary + 1].map((value) => ({
      value,
      expected: comparison(matcher.condition.operator, value, boundary),
      observed: comparison(actual.operator, value, actual.value),
    }));
    return {
      observed: samples.every((sample) => sample.expected === sample.observed),
      measurements: {
        expression: matches[0].condition,
        normalized: actual,
        unit: matcher.condition.unit ?? null,
        samples,
      },
    };
  }
  if (matcher.kind === 'di-label') {
    if (!renderedSvg)
      return { status: 'unavailable', reason: 'No rendered SVG artifact is available for a visibility check.' };
    const matching = projection.flows.filter(
      (flow) =>
        nameMatches(flow.name, matcher.sequenceName) &&
        (!matcher.target ||
          [matcher.target, ...(matcher.targetAliases ?? [])].some((name) => nameMatches(flow.targetName, name))),
    );
    if (matching.length !== 1)
      return { status: 'unresolved', reason: 'Label association does not identify exactly one sequence flow.' };
    const edge = projection.edges.get(matching[0].id);
    if (!edge?.labelBounds || edge.waypoints.length < 2)
      return { status: 'unavailable', reason: 'Parsed label bounds or associated edge geometry are unavailable.' };
    const center = {
      x: edge.labelBounds.x + edge.labelBounds.width / 2,
      y: edge.labelBounds.y + edge.labelBounds.height / 2,
    };
    const distances = edge.waypoints
      .slice(1)
      .map((end, index) => distanceToSegment(center, edge.waypoints[index], end));
    const distance = Math.min(...distances);
    const maxDistance = matcher.maxDistance ?? 160;
    const escapedFlowId = matching[0].id.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelTag = new RegExp(
      `<g\\b(?=[^>]*data-element-id="${escapedFlowId}_label")(?=[^>]*style="[^"]*display:\\s*block[^"]*")(?=[^>]*transform="matrix\\(([^)]*)\\)")[^>]*>`,
    ).exec(renderedSvg);
    const nextElement = labelTag ? renderedSvg.indexOf('data-element-id=', labelTag.index + labelTag[0].length) : -1;
    const renderedLabel = labelTag
      ? renderedSvg
          .slice(labelTag.index, nextElement < 0 ? renderedSvg.length : nextElement)
          .replaceAll(/<[^>]*>/g, ' ')
          .replaceAll('&gt;', '>')
          .replaceAll('&lt;', '<')
          .replaceAll('&amp;', '&')
          .replaceAll(/\s+/g, ' ')
      : '';
    const transform = labelTag?.[1].trim().split(/\s+/).map(Number) ?? [];
    const renderedOrigin = transform.length === 6 ? { x: transform[4], y: transform[5] } : null;
    const originDistance = renderedOrigin
      ? Math.hypot(renderedOrigin.x - edge.labelBounds.x, renderedOrigin.y - edge.labelBounds.y)
      : null;
    const visibleInRender =
      renderedLabel.includes(matcher.sequenceName) && originDistance !== null && originDistance <= 2;
    return {
      observed: distance <= maxDistance && visibleInRender,
      measurements: { distance, maxDistance, visibleInRender, renderedOrigin, originDistance },
    };
  }
  throw new Error(`Unknown automated matcher ${matcher.kind}.`);
}

function preservationResult(baseline, candidate, contract) {
  if (!baseline)
    return {
      status: 'unavailable',
      reason: 'No baseline BPMN artifact was retained with the correction attempt.',
      violations: [],
    };
  if (!candidate) return { status: 'unavailable', reason: 'No corrected BPMN artifact is available.', violations: [] };
  const declaredIds = (ids) => ids.flatMap((id) => [id, `M_${id}`]);
  const declaredId = (id) => (id.startsWith('M_') ? id : `M_${id}`);
  const mutable = new Set(declaredIds(contract.mutableElementIds));
  const removable = new Set(declaredIds(contract.removableElementIds));
  const baselineElements = new Map(baseline.elements.map((item) => [item.id, item]));
  const candidateElements = new Map(candidate.elements.map((item) => [item.id, item]));
  const violations = [];
  const observedChanges = new Set();
  const allowedChange = (changes, id, field, from, to) => {
    const match = changes.find(
      (change) =>
        [change.id, declaredId(change.id)].includes(id) &&
        change.field === field &&
        (['source', 'target'].includes(field) ? declaredId(change.from) : change.from) === from &&
        (['source', 'target'].includes(field) ? declaredId(change.to) : change.to) === to,
    );
    if (match) observedChanges.add(`${declaredId(match.id)}\0${match.field}`);
    return Boolean(match);
  };
  const comparableElement = (item) => ({
    type: item.type,
    name: item.name,
    container: item.container,
    documentation: item.documentation,
    lanes: [...item.lanes].sort(),
    attachedTo: item.attachedTo,
    interrupting: item.interrupting,
    event: item.event,
  });
  for (const [id, original] of baselineElements) {
    if (removable.has(id)) continue;
    const current = candidateElements.get(id);
    if (!current) violations.push({ code: 'stable_element_removed', elementId: id });
    else if (mutable.has(id)) {
      const protectedElement = (item) => ({
        type: item.type,
        container: item.container,
        documentation: item.documentation,
        lanes: [...item.lanes].sort(),
        attachedTo: item.attachedTo,
        interrupting: item.interrupting,
        eventType: item.event?.type ?? null,
      });
      if (JSON.stringify(protectedElement(original)) !== JSON.stringify(protectedElement(current)))
        violations.push({ code: 'mutable_element_changed_outside_contract', elementId: id });
      for (const [field, from, to] of [
        ['name', original.name, current.name],
        ['event.timeDuration', original.event?.timeDuration ?? null, current.event?.timeDuration ?? null],
      ])
        if (from !== to && !allowedChange(contract.allowedElementChanges, id, field, from, to))
          violations.push({ code: 'undeclared_element_change', elementId: id, field, from, to });
    } else if (JSON.stringify(comparableElement(original)) !== JSON.stringify(comparableElement(current)))
      violations.push({ code: 'stable_element_changed', elementId: id });
  }
  const allowedNewIds = new Set();
  for (const [id, current] of candidateElements) {
    if (baselineElements.has(id)) continue;
    const allowed = contract.allowedNewElements.some(
      (item) => declaredId(item.id) === id && item.type === current.type && item.nameAliases.includes(current.name),
    );
    if (allowed) allowedNewIds.add(id);
    else violations.push({ code: 'unexpected_element_added', elementId: id });
  }
  for (const id of removable)
    if (baselineElements.has(id) && candidateElements.has(id))
      violations.push({ code: 'declared_element_not_removed', elementId: id });
  for (const item of contract.allowedNewElements)
    if (!allowedNewIds.has(declaredId(item.id)))
      violations.push({ code: 'declared_element_not_added', elementId: declaredId(item.id) });
  const baselineFlows = new Map(baseline.flows.map((item) => [item.id, item]));
  const candidateFlows = new Map(candidate.flows.map((item) => [item.id, item]));
  const bridgePairs = new Set();
  for (const removed of removable) {
    const incoming = baseline.flows.filter((flow) => flow.target === removed).map((flow) => flow.source);
    const outgoing = baseline.flows.filter((flow) => flow.source === removed).map((flow) => flow.target);
    for (const source of incoming) for (const target of outgoing) bridgePairs.add(`${source}\0${target}`);
  }
  const comparableFlow = (item) => ({
    source: item.source,
    target: item.target,
    name: item.name,
    condition: item.condition,
    container: item.container,
  });
  for (const [id, original] of baselineFlows) {
    const current = candidateFlows.get(id);
    if (!current) {
      if (!removable.has(original.source) && !removable.has(original.target))
        violations.push({ code: 'stable_flow_removed', elementId: id });
    } else if (mutable.has(id)) {
      if (original.container !== current.container)
        violations.push({ code: 'mutable_flow_changed_outside_contract', elementId: id });
      for (const field of ['source', 'target', 'name', 'condition'])
        if (
          original[field] !== current[field] &&
          !allowedChange(contract.allowedFlowChanges, id, field, original[field], current[field])
        )
          violations.push({
            code: 'undeclared_flow_change',
            elementId: id,
            field,
            from: original[field],
            to: current[field],
          });
    } else if (JSON.stringify(comparableFlow(original)) !== JSON.stringify(comparableFlow(current)))
      violations.push({ code: 'stable_flow_changed', elementId: id });
  }
  for (const [id, current] of candidateFlows) {
    if (baselineFlows.has(id)) continue;
    const allowed = contract.allowedNewFlows.some(
      (flow) =>
        declaredId(flow.id) === id &&
        declaredId(flow.source) === current.source &&
        declaredId(flow.target) === current.target &&
        flow.name === current.name &&
        flow.condition === current.condition,
    );
    if (!allowed && !bridgePairs.has(`${current.source}\0${current.target}`))
      violations.push({ code: 'unrelated_flow_added', elementId: id });
  }
  for (const change of [...contract.allowedElementChanges, ...contract.allowedFlowChanges]) {
    const key = `${declaredId(change.id)}\0${change.field}`;
    const relevantBaseline = baselineElements.has(declaredId(change.id)) || baselineFlows.has(declaredId(change.id));
    if (relevantBaseline && !observedChanges.has(key))
      violations.push({ code: 'declared_change_missing', elementId: declaredId(change.id), field: change.field });
  }
  for (const flow of contract.allowedNewFlows)
    if (!candidateFlows.has(declaredId(flow.id)))
      violations.push({ code: 'declared_flow_not_added', elementId: declaredId(flow.id) });
  return {
    status: violations.length ? 'fail' : 'pass',
    reason: violations.length ? 'Correction changed identities or semantics outside its declared scope.' : undefined,
    violations,
  };
}

function handoffBundleViolations(handoff, projection, prefix) {
  const violations = [];
  const typeName = (type) => `bpmn:${type[0].toUpperCase()}${type.slice(1)}`;
  const expectedIds = new Set();
  const expectedFlowIds = new Set();
  for (const process of handoff?.request?.model?.processes ?? []) {
    const laneByNode = new Map();
    for (const lane of process.lanes ?? [])
      for (const nodeRef of lane.flowNodeRefs ?? []) laneByNode.set(nodeRef, lane.name);
    for (const node of process.nodes) {
      const id = `M_${node.key}`;
      expectedIds.add(id);
      const actual = projection.byId.get(id);
      const expectedEvent =
        node.event?.kind && node.event.kind !== 'none' ? `${typeName(node.event.kind)}EventDefinition` : null;
      if (
        !actual ||
        actual.type !== typeName(node.type) ||
        actual.name !== (node.name ?? '') ||
        actual.container !== `M_${node.containerRef}` ||
        (laneByNode.has(node.key) && !actual.lanes.includes(laneByNode.get(node.key))) ||
        (node.attachedToRef && actual.attachedTo !== `M_${node.attachedToRef}`) ||
        (node.type === 'boundaryEvent' && actual.interrupting !== (node.interrupting ?? true)) ||
        (expectedEvent && actual.event?.type !== expectedEvent) ||
        (node.event?.timeDate && actual.event?.timeDate !== node.event.timeDate) ||
        (node.event?.timeDuration && actual.event?.timeDuration !== node.event.timeDuration) ||
        (node.event?.timeCycle && actual.event?.timeCycle !== node.event.timeCycle)
      )
        violations.push({ code: `${prefix}_handoff_element_mismatch`, elementId: id });
    }
    const flows = new Map(projection.flows.map((flow) => [flow.id, flow]));
    for (const flow of process.flows) {
      const id = `M_${flow.key}`;
      expectedFlowIds.add(id);
      const actual = flows.get(id);
      if (
        !actual ||
        actual.source !== `M_${flow.sourceRef}` ||
        actual.target !== `M_${flow.targetRef}` ||
        actual.container !== `M_${flow.containerRef}` ||
        actual.name !== (flow.name ?? '') ||
        actual.condition !== (flow.condition ?? '')
      )
        violations.push({ code: `${prefix}_handoff_flow_mismatch`, elementId: id });
    }
  }
  for (const element of projection.elements)
    if (element.id.startsWith('M_') && !expectedIds.has(element.id))
      violations.push({ code: `${prefix}_bundle_has_unrequested_element`, elementId: element.id });
  for (const flow of projection.flows)
    if (flow.id.startsWith('M_') && !expectedFlowIds.has(flow.id))
      violations.push({ code: `${prefix}_bundle_has_unrequested_flow`, elementId: flow.id });
  return violations;
}

async function assess(root, flags) {
  await validate(root);
  const runOption = flags.get('--run');
  const outputOption = flags.get('--output');
  assert.ok(runOption && outputOption, 'Assess requires --run FILE and --output FILE.');
  const runPath = await realpath(resolve(runOption));
  const runDirectory = dirname(runPath);
  const run = await readJson(runPath);
  assert.equal(
    run.runContractVersion,
    '2.0.0',
    `Unsupported run contract ${run.runContractVersion}; version 1 records require evaluator 1.x and are never regraded against current assertions.`,
  );
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
      preservation: null,
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
    let baselineProjection;
    let renderedSvg;
    let startingHandoff;
    let baselineHandoff;
    let candidateHandoff;
    let baselineQualityReport;
    let qualityReport;
    const assessmentPhase = attempt.phase;
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
      if (artifact.kind === 'bpmn' || artifact.kind === 'baseline-bpmn') {
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
          const parsedProjection = bpmnProjection(parsed.rootElement, xml);
          if (artifact.kind === 'baseline-bpmn') baselineProjection = parsedProjection;
          else projection = parsedProjection;
        } catch (error) {
          result.findings.push({ code: 'invalid_bpmn', severity: 'critical', status: 'fail', reason: error.message });
        }
      } else if (artifact.kind === 'svg' || artifact.kind === 'baseline-svg') {
        const svg = bytes.toString('utf8');
        if (artifact.kind === 'svg') renderedSvg = svg;
        if (!/<svg(?:\s|>)/.test(svg))
          result.findings.push({ code: 'invalid_svg', severity: 'major', status: 'fail', artifact: artifact.path });
      } else if (['starting-handoff', 'baseline-handoff', 'handoff'].includes(artifact.kind)) {
        try {
          const handoff = JSON.parse(bytes.toString('utf8'));
          assert.ok(validateHandoffSchema(handoff), `Invalid Handoff: ${ajv.errorsText(validateHandoffSchema.errors)}`);
          if (artifact.kind === 'starting-handoff') startingHandoff = handoff;
          else if (artifact.kind === 'baseline-handoff') baselineHandoff = handoff;
          else candidateHandoff = handoff;
        } catch (error) {
          result.findings.push({
            code: 'invalid_handoff',
            severity: 'critical',
            status: 'fail',
            artifact: artifact.path,
            reason: error.message,
          });
        }
      } else if (artifact.kind === 'baseline-quality-report' || artifact.kind === 'quality-report') {
        try {
          const report = JSON.parse(bytes.toString('utf8'));
          assert.ok(
            validateQualityReportSchema(report),
            `Invalid Quality Report: ${ajv.errorsText(validateQualityReportSchema.errors)}`,
          );
          if (artifact.kind === 'baseline-quality-report') baselineQualityReport = report;
          else qualityReport = report;
        } catch (error) {
          result.findings.push({
            code: 'invalid_quality_report',
            severity: 'critical',
            status: 'fail',
            artifact: artifact.path,
            reason: error.message,
          });
        }
      }
    }
    if (assessmentPhase === 'correction' && selected.contract.correctionContract) {
      result.preservation = preservationResult(baselineProjection, projection, selected.contract.correctionContract);
    }
    if (assessmentPhase === 'correction' && selected.contract.primaryTask === 'maintenance') {
      const artifactKinds = new Set((attempt.artifacts ?? []).map((artifact) => artifact.kind));
      const missingKinds = [
        'starting-handoff',
        'baseline-handoff',
        'baseline-bpmn',
        'baseline-svg',
        'baseline-quality-report',
        'handoff',
        'bpmn',
        'svg',
        'quality-report',
      ].filter((kind) => !artifactKinds.has(kind));
      if (missingKinds.length) {
        result.preservation = {
          status: 'unavailable',
          reason: `Paired correction evidence is incomplete: missing ${missingKinds.join(', ')}.`,
          violations: [],
        };
      } else if (result.preservation.status === 'pass') {
        const violations = [];
        violations.push(...handoffBundleViolations(baselineHandoff, baselineProjection, 'baseline'));
        violations.push(...handoffBundleViolations(candidateHandoff, projection, 'candidate'));
        if (JSON.stringify(startingHandoff?.request) !== JSON.stringify(baselineHandoff?.request))
          violations.push({ code: 'starting_handoff_baseline_mismatch' });
        const nonModelRequest = (handoff) => {
          const { model: _model, links: _links, ...rest } = handoff?.request ?? {};
          return rest;
        };
        if (JSON.stringify(nonModelRequest(baselineHandoff)) !== JSON.stringify(nonModelRequest(candidateHandoff)))
          violations.push({ code: 'handoff_non_model_state_changed' });
        const correctionIds = new Set([
          ...selected.contract.correctionContract.removableElementIds,
          ...selected.contract.correctionContract.allowedNewElements.map((element) => element.id),
        ]);
        const stableLinks = (handoff) =>
          (handoff?.request?.links ?? []).filter((link) => !correctionIds.has(link.elementRef));
        if (JSON.stringify(stableLinks(baselineHandoff)) !== JSON.stringify(stableLinks(candidateHandoff)))
          violations.push({ code: 'handoff_stable_links_changed' });
        if (baselineQualityReport?.modelKey !== baselineHandoff?.request?.model?.key)
          violations.push({ code: 'baseline_quality_report_model_mismatch' });
        if (JSON.stringify(baselineHandoff?.lastReport) !== JSON.stringify(baselineQualityReport))
          violations.push({ code: 'baseline_handoff_quality_report_mismatch' });
        if (qualityReport?.modelKey !== candidateHandoff?.request?.model?.key)
          violations.push({ code: 'quality_report_model_mismatch' });
        if (JSON.stringify(candidateHandoff?.lastReport) !== JSON.stringify(qualityReport))
          violations.push({ code: 'handoff_quality_report_mismatch' });
        const failedBundleChecks = [...(baselineQualityReport?.checks ?? []), ...(qualityReport?.checks ?? [])]
          .filter((check) => ['xml', 'xsd', 'semantics', 'profile', 'di', 'render'].includes(check.id))
          .filter((check) => check.status !== 'passed')
          .map((check) => check.id);
        if (failedBundleChecks.length)
          violations.push({ code: 'output_bundle_check_failed', checks: failedBundleChecks });
        if (violations.length)
          result.preservation = {
            status: 'fail',
            reason: 'The paired Handoff, Output Bundle, and Quality Report are inconsistent.',
            violations,
          };
      }
    }
    if (result.preservation?.status === 'fail')
      result.findings.push({
        code: 'unrelated_correction_change',
        severity: 'critical',
        status: 'fail',
        reason: result.preservation.reason,
        violations: result.preservation.violations,
      });
    const observations = new Map(
      (attempt.observations ?? []).map((observation) => [observation.assertionId, observation]),
    );
    for (const assertion of effectiveAssertions) {
      let assertionResult;
      if (assertion.appliesTo && !assertion.appliesTo.includes(assessmentPhase)) {
        assertionResult = {
          assertionId: assertion.id,
          status: 'not_applicable',
          method: assertion.evaluation.kind,
          reason: `Assertion applies only to ${assertion.appliesTo.join(' or ')} assessment.`,
        };
      } else if (assertion.evaluation.kind === 'automated') {
        if (!projection) {
          assertionResult = {
            assertionId: assertion.id,
            status: 'blocked',
            method: 'automated',
            reason: 'No readable BPMN artifact.',
          };
        } else {
          const match = matcherResult(projection, assertion.evaluation.matcher, renderedSvg);
          const conclusive = !match.status || match.status === 'fail';
          const passed =
            !match.status && (assertion.evaluation.matcher.expect === 'absent' ? !match.observed : match.observed);
          const status = match.status ?? (passed ? 'pass' : 'fail');
          assertionResult = {
            assertionId: assertion.id,
            status,
            method: 'automated',
            reason: match.reason,
            measurements: match.measurements,
            evidence: [
              {
                artifact: attempt.artifacts.find((artifact) => artifact.kind === 'bpmn')?.path,
                locator: assertion.evaluation.matcher.kind,
              },
            ],
          };
          if (conclusive && status === 'fail')
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
    else if (
      result.preservation?.status === 'unavailable' ||
      result.assertions.some((assertion) => ['not_run', 'unresolved', 'unavailable'].includes(assertion.status))
    )
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
      if (!assertion || assertionResult.status === 'not_applicable') continue;
      dimensions[assertion.dimension] ??= {};
      const dimension = dimensions[assertion.dimension];
      dimension[assertionResult.status] = (dimension[assertionResult.status] ?? 0) + 1;
    }
  }
  const completedHumanChecks = attempts
    .flatMap((attempt) => attempt.assertions)
    .filter(
      (assertion) => assertion.method === 'human' && !['not_run', 'blocked', 'unavailable'].includes(assertion.status),
    );
  const requestedHumanChecks =
    attempts.length * effectiveAssertions.filter((assertion) => assertion.evaluation.kind === 'human').length;
  const proposedAgentChecks = attempts
    .flatMap((attempt) => attempt.assertions)
    .filter((assertion) => assertion.method === 'agent' && assertion.adjudicationStatus === 'proposed').length;
  const supportedAttempts = selected.contract.applicability.status === 'supported' ? attempts : [];
  const qualifyingPasses = supportedAttempts.filter((attempt) => attempt.status === 'pass').length;
  const attemptedCount = run.attempts.filter((attempt) => attempt.status !== 'not_run').length;
  const completedCount = run.attempts.filter((attempt) => attempt.status === 'completed').length;
  const report = {
    assessmentVersion: '2.0.0',
    evaluatorRevision: '2.0.0',
    compatibility: {
      runContractVersion: run.runContractVersion,
      interpretation: 'current',
    },
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
    applicability: selected.contract.applicability,
    reviewRubric: selected.reviewer.reviewRubric,
    inputFindings,
    attempts,
    summary: {
      attemptCount: attempts.length,
      sessions: {
        planned: run.attemptCount,
        attempted: attemptedCount,
        completed: completedCount,
        firstGeneration: attempts[0]?.status ?? 'not_run',
        repairedCompletion: attempts.slice(1).some((attempt) => attempt.status === 'pass'),
      },
      statuses,
      criticalFailures:
        attempts.flatMap((attempt) => attempt.findings).filter((finding) => finding.severity === 'critical').length +
        inputFindings.filter((finding) => finding.severity === 'critical').length,
      humanChecks: {
        requested: requestedHumanChecks,
        completed: completedHumanChecks.length,
        missing: requestedHumanChecks - completedHumanChecks.length,
      },
      reviewState: {
        proposedAgentChecks,
        recordedHumanChecks: completedHumanChecks.length,
        adjudicatedChecks: completedHumanChecks.filter((assertion) => assertion.adjudicationStatus === 'adjudicated')
          .length,
      },
      unresolvedJudgments: attempts
        .flatMap((attempt) => attempt.assertions)
        .filter((assertion) => ['unresolved', 'unavailable'].includes(assertion.status)).length,
      preservation: Object.fromEntries(
        ['pass', 'fail', 'unavailable'].map((status) => [
          status,
          attempts.filter((attempt) => attempt.preservation?.status === status).length,
        ]),
      ),
      supportedProduct: {
        applicable: selected.contract.applicability.status === 'supported',
        denominator: supportedAttempts.length,
        passed: qualifyingPasses,
        qualified:
          supportedAttempts.length > 0 &&
          qualifyingPasses === supportedAttempts.length &&
          requestedHumanChecks === completedHumanChecks.length,
      },
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
    assert.ok(
      ['1.0.0', '2.0.0'].includes(report.assessmentVersion),
      `Unsupported assessment version ${report.assessmentVersion}; no compatibility path is defined.`,
    );
    assert.equal(report.status, 'complete', 'Only completed assessment records can be compared.');
    assert.equal(report.summary.attemptCount, report.attempts.length, 'Assessment summary omits attempts.');
  }
  const baselineEvaluator = baseline.evaluatorRevision ?? baseline.assessmentVersion;
  const candidateEvaluator = candidate.evaluatorRevision ?? candidate.assessmentVersion;
  const gradingChanged = baselineEvaluator !== candidateEvaluator;
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
  const unknownSettings = [
    baseline.model?.id,
    candidate.model?.id,
    baseline.model?.reasoningSettings,
    candidate.model?.reasoningSettings,
    baseline.environment?.browser,
    candidate.environment?.browser,
  ].some((value) => !value || ['unknown', 'not_observed'].includes(value));
  const nonIsolated = [baseline.isolation?.status, candidate.isolation?.status].some((status) => status !== 'isolated');
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
    comparisonVersion: '2.0.0',
    status: 'complete',
    comparability: mismatches.length ? 'mismatched' : gradingChanged ? 'grading-change' : 'comparable',
    comparisonClass:
      mismatches.length || gradingChanged || unknownSettings || nonIsolated ? 'exploratory' : 'controlled',
    controlledComparison: !mismatches.length && !gradingChanged && !unknownSettings && !nonIsolated,
    grading: {
      changed: gradingChanged,
      baselineEvaluator,
      candidateEvaluator,
      candidateImprovementClaimAllowed: !gradingChanged,
    },
    mismatches,
    runs: { baseline: summarize(baseline), candidate: summarize(candidate) },
    delta:
      mismatches.length || gradingChanged
        ? null
        : {
            criticalFailures: candidate.summary.criticalFailures - baseline.summary.criticalFailures,
            attemptCount: candidate.summary.attemptCount - baseline.summary.attemptCount,
          },
    interpretation: mismatches.length
      ? 'Runs are retained side by side but not combined because relevant inputs or settings differ.'
      : gradingChanged
        ? 'The same artifacts were graded by different evaluator revisions; changed findings are grading changes, not candidate improvements.'
        : unknownSettings || nonIsolated
          ? 'Inputs match, but unknown settings or missing isolation limit this to an exploratory comparison.'
          : 'Runs share the declared case, sources, environment, skill, model, reasoning settings, and evaluator revision.',
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
