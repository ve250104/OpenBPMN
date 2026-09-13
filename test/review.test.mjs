import assert from 'node:assert/strict';
import test from 'node:test';
import { assessReview } from '../dist/review.js';

function request() {
  return {
    schemaVersion: '1.0.0',
    profileVersion: '1.0.0',
    model: {
      key: 'document',
      name: 'Request review',
      primaryRef: 'review',
      processes: [
        {
          key: 'review',
          name: 'Request review',
          nodes: [
            {
              key: 'start',
              type: 'startEvent',
              containerRef: 'review',
              name: 'Request received',
              event: { kind: 'none' },
            },
            { key: 'task', type: 'userTask', containerRef: 'review', name: 'Review request' },
            { key: 'end', type: 'endEvent', containerRef: 'review', name: 'Request reviewed', event: { kind: 'none' } },
          ],
          flows: [
            { key: 'begins', containerRef: 'review', sourceRef: 'start', targetRef: 'task' },
            { key: 'finishes', containerRef: 'review', sourceRef: 'task', targetRef: 'end' },
          ],
          lanes: [{ key: 'owner', name: 'Review team', parentRef: 'review', flowNodeRefs: ['start', 'task', 'end'] }],
        },
      ],
    },
    evidence: [{ key: 'account', source: 'Operator notes', summary: 'The team reviews incoming requests.' }],
    links: [{ elementRef: 'task', assertion: 'Review incoming requests', basis: 'evidence', supportRefs: ['account'] }],
  };
}

test('review keeps consequential unresolved issues blocking and explicit omissions advisory without mutating the request', () => {
  const input = request();
  input.decisions = [{ key: 'decision', description: 'Share the selected scope.', elementRefs: ['task'] }];
  input.issues = [
    {
      key: 'conflict',
      kind: 'conflict',
      description: 'Two different owners are reported.',
      affectsMeaning: true,
      elementRefs: ['task'],
      evidenceRefs: ['account'],
    },
    {
      key: 'unsupported',
      kind: 'unsupportedRequirement',
      concept: 'complexGateway',
      description: 'A complex gateway is required.',
      affectsMeaning: false,
      elementRefs: ['review'],
    },
    {
      key: 'omission',
      kind: 'unsupportedRequirement',
      concept: 'transaction',
      description: 'Transaction omitted for this view.',
      affectsMeaning: true,
      elementRefs: ['review'],
      resolution: { decisionRef: 'decision', kind: 'acceptedOmission' },
    },
    {
      key: 'settled',
      kind: 'question',
      description: 'This question was answered.',
      affectsMeaning: true,
      resolution: { decisionRef: 'decision', kind: 'resolved' },
    },
  ];
  const original = structuredClone(input);
  const result = assessReview(input);
  assert.deepEqual(input, original);
  assert.notEqual(result.request, input);
  assert.equal(result.findings.find((finding) => finding.code === 'EVIDENCE_CONFLICT')?.blocksClean, true);
  assert.equal(result.findings.find((finding) => finding.code === 'PROFILE_DEFERRED')?.blocksClean, true);
  assert.equal(result.findings.find((finding) => finding.code === 'DECLARED_OMISSION')?.blocksClean, false);
  assert.ok(result.findings.every((finding) => finding.instance !== 'settled'));
});

test('source paths and high-confidence credentials are minimized throughout the request and optional Handoff without altering identities', () => {
  const input = request();
  const token = 'ghp_' + 'A'.repeat(36);
  const password = 'synthetic-password-only';
  input.evidence[0].source = '/Users/operator/private/client-interview.md';
  input.evidence[0].locator = 'C:\\Users\\operator\\notes\\account.txt';
  input.evidence[0].summary = `Use password="${password}". The review team also has ${token}.`;
  input.model.processes[0].nodes[1].documentation = `Access with ${token}.`;
  const handoff = {
    handoffVersion: '1.0.0',
    request: input,
    lifecycleStatus: 'Human-selected working copy',
    reviewNotes: [`Authorization: Bearer ${token}`],
    lastReport: {
      reportVersion: '1.0.0',
      toolVersion: '0.1.0',
      profileVersion: '1.0.0',
      export: { requested: 'none', outcome: 'none', cleanEligible: false, expertOverride: false },
      checks: ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render', 'evidence', 'consulting'].map((id) => ({
        id,
        status: 'not_run',
        findingRefs: [],
        reason: `password=${password}`,
      })),
      findings: [],
      context: { evidence: structuredClone(input.evidence) },
    },
  };
  const original = structuredClone(handoff);
  const result = assessReview(input, handoff);
  assert.deepEqual(handoff, original);
  assert.equal(result.request.evidence[0].source, 'client-interview.md');
  assert.equal(result.request.evidence[0].locator, 'account.txt');
  assert.equal(result.request.model.processes[0].nodes[1].key, 'task');
  assert.equal(result.request.links[0].elementRef, 'task');
  assert.equal(result.request.links[0].supportRefs[0], 'account');
  assert.equal(result.handoff.request, result.request);
  assert.equal(result.handoff.lifecycleStatus, 'Human-selected working copy');
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes(password));
  assert.ok(!JSON.stringify(result).includes('/Users/operator/private'));
  assert.ok(
    result.findings.some((finding) => finding.code === 'SECRET_REDACTED' && finding.evidenceRefs.includes('account')),
  );
});

test('recognizable private keys, cloud tokens, and URL credentials are removed while ordinary process language stays intact', () => {
  const input = request();
  const secrets = [
    'AKIA' + 'B'.repeat(16),
    'sk-proj-' + 'c'.repeat(32),
    'xoxb-' + 'd'.repeat(32),
    'synthetic-password',
    '-----BEGIN PRIVATE KEY-----\nQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=\n-----END PRIVATE KEY-----',
  ];
  input.evidence[0].summary =
    secrets.slice(0, 3).join(' ') + ` https://user:${secrets[3]}@example.invalid/api ${secrets[4]}`;
  input.evidence.push({
    key: 'plain',
    source: 'Sales / Operations',
    summary: 'Reset password, rotate the API key, and then review the request.',
  });
  input.evidence.push({
    key: 'url',
    source: 'https://example.invalid/process',
    summary: 'A cited URL is context only.',
  });
  const result = assessReview(input);
  const serialized = JSON.stringify(result);
  for (const secret of secrets)
    assert.ok(!serialized.includes(secret), 'Credential must not survive in display artifacts or findings.');
  assert.equal(result.request.evidence[1].source, 'Sales / Operations');
  assert.equal(result.request.evidence[1].summary, input.evidence[1].summary);
  assert.equal(result.request.evidence[2].source, input.evidence[2].source);
  assert.equal(
    assessReview(result.request).findings.some((finding) => finding.code === 'SECRET_REDACTED'),
    false,
  );
});

test('missing names, ownership, outcomes, and supplied support are consulting advisories rather than invented meaning or clean-export blockers', () => {
  const input = request();
  delete input.model.processes[0].nodes[1].name;
  delete input.model.processes[0].nodes[2].name;
  delete input.model.processes[0].lanes;
  delete input.links;
  const original = structuredClone(input);
  const result = assessReview(input);
  for (const code of ['QUALITY_NAMING', 'QUALITY_OWNERSHIP', 'QUALITY_OUTCOME', 'EVIDENCE_GAP']) {
    assert.ok(
      result.findings.some((finding) => finding.code === code),
      `Expected advisory ${code}.`,
    );
  }
  assert.ok(result.findings.every((finding) => finding.blocksClean === false && finding.severity !== 'error'));
  assert.deepEqual(result.request, original);
  assert.equal(result.handoff, undefined);
});

test('responsibility supplied by a named participant or enclosing subprocess lane is recognized without requiring redundant lanes', () => {
  const input = request();
  delete input.model.processes[0].lanes;
  input.model.collaboration = {
    key: 'collaboration',
    participants: [{ key: 'team', name: 'Review team', processRef: 'review' }],
  };
  input.model.primaryRef = 'collaboration';
  assert.equal(
    assessReview(input).findings.some((finding) => finding.code === 'QUALITY_OWNERSHIP'),
    false,
  );

  delete input.model.collaboration;
  input.model.primaryRef = 'review';
  input.model.processes[0].nodes.push({
    key: 'sub',
    type: 'subProcess',
    name: 'Review supporting material',
    containerRef: 'review',
  });
  input.model.processes[0].nodes[1].containerRef = 'sub';
  input.model.processes[0].lanes = [{ key: 'owner', name: 'Review team', parentRef: 'review', flowNodeRefs: ['sub'] }];
  assert.equal(
    assessReview(input).findings.some((finding) => finding.code === 'QUALITY_OWNERSHIP'),
    false,
  );
});

test('inference remains visible and routing or ownership without a supplied Evidence Link is advisory, not automatically accepted as fact', () => {
  const input = request();
  input.links[0].basis = 'inference';
  input.model.processes[0].flows[1].condition = 'The request is complete';
  input.model.processes[0].flows[1].name = 'Request complete';
  const findings = assessReview(input).findings.filter((finding) => finding.code === 'EVIDENCE_GAP');
  assert.ok(
    findings.some((finding) => finding.elementRefs.includes('task') && finding.evidenceRefs.includes('account')),
  );
  assert.ok(findings.some((finding) => finding.elementRefs.includes('finishes')));
  assert.ok(findings.some((finding) => finding.elementRefs.includes('owner')));
  assert.ok(findings.every((finding) => finding.blocksClean === false));
});

test('oversized flow scopes and scopes without explicit outcomes receive focused, nonblocking review advice', () => {
  const input = request();
  input.model.processes[0].nodes = Array.from({ length: 41 }, (_, index) => ({
    key: `step${index}`,
    name: `Review item ${index}`,
    type: 'task',
    containerRef: 'review',
  }));
  input.model.processes[0].flows = [];
  input.model.processes[0].lanes = [];
  const findings = assessReview(input).findings;
  assert.ok(
    findings.some((finding) => finding.code === 'QUALITY_COMPLEXITY' && finding.elementRefs.includes('review')),
  );
  assert.ok(findings.some((finding) => finding.code === 'QUALITY_OUTCOME' && finding.elementRefs.includes('review')));
  assert.ok(findings.every((finding) => finding.blocksClean === false));
  input.model.processes[0].nodes.pop();
  assert.equal(
    assessReview(input).findings.some((finding) => finding.code === 'QUALITY_COMPLEXITY'),
    false,
  );
});

test('credentials in semantic conditions, declaration codes, and identities refuse input without rewriting meaning or disclosing the credential', () => {
  const token = 'ghp_' + 'Z'.repeat(36);
  for (const mutation of [
    (input) => {
      input.model.processes[0].flows[1].condition = `api_key=${token}`;
    },
    (input) => {
      input.model.declarations = [{ key: 'failure', type: 'error', code: token }];
    },
    (input) => {
      input.model.processes[0].nodes[1].key = token;
    },
    (input) => {
      input.model.processes[0].nodes.push({
        key: 'link',
        type: 'intermediateThrowEvent',
        containerRef: 'review',
        event: { kind: 'link', name: token },
      });
    },
  ]) {
    const input = request();
    mutation(input);
    const result = assessReview(input);
    assert.deepEqual(
      result.request,
      input,
      'Unsafe semantic meaning must remain unmodified for the caller to refuse, never compiled as a sanitized approximation.',
    );
    assert.ok(
      result.findings.some(
        (finding) => finding.category === 'input' && finding.code === 'INPUT_SCHEMA' && finding.blocksClean,
      ),
    );
    assert.ok(!JSON.stringify(result.findings).includes(token), 'Diagnostics must not expose unsafe identities.');
  }
});

test('historical Handoff report identities cannot carry credentials into companion artifacts', () => {
  const token = 'AKIA' + 'B'.repeat(16);
  for (const report of [
    { modelKey: token },
    { findings: [{ id: token }] },
    { checks: [{ findingRefs: [token] }] },
    { context: { issues: [{ concept: `https://example.invalid/?api_key=${token}#Extension` }] } },
  ]) {
    const input = request();
    const result = assessReview(input, { handoffVersion: '1.0.0', request: input, lastReport: report });
    assert.ok(result.findings.some((finding) => finding.code === 'INPUT_SCHEMA' && finding.blocksClean));
    assert.ok(!JSON.stringify(result.findings).includes(token));
  }
});
