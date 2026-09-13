import type { FindingInput } from './diagnostics.js';
import type { Handoff, ProcessRequest } from './model.js';

export interface ReviewAssessment {
  request: ProcessRequest;
  handoff?: Handoff;
  findings: FindingInput[];
}

const displayFields = new Set([
  'name',
  'documentation',
  'condition',
  'timeDate',
  'timeDuration',
  'timeCycle',
  'state',
  'text',
  'value',
  'code',
  'source',
  'summary',
  'locator',
  'description',
  'assertion',
  'expectedOutcome',
  'lifecycleStatus',
  'reviewNotes',
  'message',
  'remediation',
  'reason',
]);
const meaningFields = new Set(['condition', 'timeDate', 'timeDuration', 'timeCycle', 'state', 'value', 'code']);

function masked(value: string): string {
  return [...value].length >= 10 ? '[REDACTED]' : '…';
}

function redact(value: string): string {
  return value
    .replace(
      /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g,
      '[REDACTED]',
    )
    .replace(/\b(?:github_pat_[A-Za-z0-9_]{20,255}|gh[pousr]_[A-Za-z0-9]{20,255})\b/g, (token) => masked(token))
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED]')
    .replace(/\b(?:sk-(?:proj-|ant-(?:api\d+-)?)?|xox[baprs]-)[A-Za-z0-9_-]{20,255}\b/g, '[REDACTED]')
    .replace(
      /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/g,
      (_match, prefix: string) => `${prefix}[REDACTED]@`,
    )
    .replace(
      /\b(Bearer[ \t]+)([A-Za-z0-9._~+/-]+=*)/gi,
      (_match, prefix: string, token: string) => prefix + masked(token),
    )
    .replace(
      /(\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|secret[_ -]?key)["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)/gi,
      (match, prefix: string, secret: string) =>
        /^(?:["']?)(?:\[REDACTED\]|…)(?:["']?)$/.test(secret) ? match : prefix + masked(secret),
    );
}

/** Defense-in-depth detection only; never a claim of exhaustive secret classification. */
export function containsCredential(value: string): boolean {
  return redact(value) !== value;
}

function sourceDisplay(value: string): string {
  const localPath =
    /^(?:\/?\.\.?[\\/]|~[\\/]|[\\/]|[A-Za-z]:[\\/])/.test(value) ||
    (!/^https?:\/\//i.test(value) && /[\\/][^\\/]+\.[A-Za-z0-9]{1,12}$/.test(value));
  return localPath ? (value.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? 'Local source') : value;
}

function minimize(request: ProcessRequest, handoff: Handoff | undefined, findings: FindingInput[]): void {
  function visit(
    value: unknown,
    field: string,
    path: string,
    model = false,
    evidenceRefs: string[] = [],
    elementRef?: string,
    linkIdentity = false,
  ): unknown {
    if (typeof value === 'string') {
      const identity =
        ['key', 'modelKey', 'id', 'code', 'concept'].includes(field) ||
        /Refs?$/.test(field) ||
        (linkIdentity && field === 'name');
      const meaning = identity || (model && meaningFields.has(field));
      if (!displayFields.has(field) && !meaning) return value;
      const redacted = redact(value);
      if (meaning && redacted !== value) {
        findings.push({
          code: 'INPUT_SCHEMA',
          category: 'input',
          severity: 'error',
          blocksClean: true,
          message:
            'A high-confidence credential occurs in process meaning or an identity and cannot safely be rewritten.',
          remediation:
            'Remove credentials from the semantic input and resubmit; no model may be emitted from this request.',
          inputPointer: path,
          instance: 'unsafe-semantic-value',
        });
        return value;
      }
      if (redacted !== value)
        findings.push({
          code: 'SECRET_REDACTED',
          category: 'evidence',
          severity: 'warning',
          blocksClean: false,
          message: 'A high-confidence credential was redacted from display content.',
          remediation: 'Keep credentials outside process evidence and generated artifacts.',
          evidenceRefs,
          elementRefs: elementRef ? [elementRef] : [],
          instance: path,
        });
      return field === 'source' || field === 'locator' ? sourceDisplay(redacted) : redacted;
    }
    if (Array.isArray(value))
      return value.map((entry, index) => visit(entry, field, `${path}/${index}`, model, evidenceRefs, elementRef));
    if (value === null || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (typeof record.source === 'string' && typeof record.summary === 'string' && typeof record.key === 'string')
      evidenceRefs = [record.key];
    if (model && typeof record.key === 'string') elementRef = record.key;
    if (typeof record.elementRef === 'string') {
      elementRef = record.elementRef;
      if (record.basis !== 'decision' && Array.isArray(record.supportRefs))
        evidenceRefs = record.supportRefs as string[];
    }
    for (const [key, entry] of Object.entries(record))
      record[key] = visit(
        entry,
        key,
        `${path}/${key}`,
        model || key === 'model',
        evidenceRefs,
        elementRef,
        record.kind === 'link',
      );
    return record;
  }
  visit(request, '', handoff ? '/request' : '');
  if (handoff)
    for (const [field, value] of Object.entries(handoff))
      if (field !== 'request') {
        (handoff as unknown as Record<string, unknown>)[field] = visit(value, field, `/${field}`);
      }
}

function consulting(request: ProcessRequest, findings: FindingInput[]): void {
  const linked = new Set((request.links ?? []).map((link) => link.elementRef));
  const advisory = (
    code: string,
    elementRef: string,
    message: string,
    remediation: string,
    category: 'consulting' | 'evidence' = 'consulting',
  ) => {
    findings.push({
      code,
      category,
      severity: 'warning',
      blocksClean: false,
      elementRefs: [elementRef],
      message,
      remediation,
    });
  };
  for (const [index, link] of (request.links ?? []).entries())
    if (link.basis === 'inference') {
      findings.push({
        code: 'EVIDENCE_GAP',
        category: 'evidence',
        severity: 'warning',
        blocksClean: false,
        elementRefs: [link.elementRef],
        evidenceRefs: link.supportRefs ?? [],
        instance: `inference:${index}`,
        message: 'A supplied assertion is explicitly identified as inference, not verified process evidence.',
        remediation:
          'Review this inference when it affects a consequential process choice; the Core cannot verify the assertion.',
      });
    }
  for (const process of request.model.processes) {
    const namedOwners = new Set(
      (process.lanes ?? []).filter((lane) => lane.name?.trim()).flatMap((lane) => lane.flowNodeRefs ?? []),
    );
    const participantOwner = request.model.collaboration?.participants?.some(
      (participant) => participant.processRef === process.key && participant.name?.trim(),
    );
    const nodes = new Map((process.nodes ?? []).map((node) => [node.key, node]));
    const hasOwner = (key: string): boolean => {
      const seen = new Set<string>();
      while (!seen.has(key)) {
        if (namedOwners.has(key)) return true;
        seen.add(key);
        const parent = nodes.get(key)?.containerRef;
        if (!parent) return false;
        key = parent;
      }
      return false;
    };
    for (const node of process.nodes ?? []) {
      const activity =
        node.type.endsWith('Task') ||
        node.type === 'task' ||
        node.type === 'callActivity' ||
        node.type === 'subProcess';
      if (activity) {
        if (!node.name?.trim())
          advisory(
            'QUALITY_NAMING',
            node.key,
            'An activity has no visible action label.',
            'Use a concise business action and object, preserving the supplied process meaning.',
          );
        if (!participantOwner && !hasOwner(node.key))
          advisory(
            'QUALITY_OWNERSHIP',
            node.key,
            'No named responsibility is supplied for this activity.',
            'Identify a responsible participant or lane, or keep this as an explicit review question.',
          );
        if (!linked.has(node.key))
          advisory(
            'EVIDENCE_GAP',
            node.key,
            'No Evidence Link records the basis for this activity.',
            'Record a relevant source, human Modeling Decision, or explicitly identified inference; this check does not verify truth.',
            'evidence',
          );
      }
      if (node.type === 'endEvent' && !node.name?.trim())
        advisory(
          'QUALITY_OUTCOME',
          node.key,
          'An end event has no visible business outcome.',
          'Name the resulting business state if known; do not invent an outcome to satisfy this advisory.',
        );
    }
    for (const flow of process.flows ?? [])
      if (flow.condition && !linked.has(flow.key)) {
        advisory(
          'EVIDENCE_GAP',
          flow.key,
          'No Evidence Link records the basis for a routing condition.',
          'Record the source or human decision behind this condition; do not infer that a plausible route is verified.',
          'evidence',
        );
      }
    for (const lane of process.lanes ?? [])
      if (lane.name && lane.flowNodeRefs?.length && !linked.has(lane.key)) {
        advisory(
          'EVIDENCE_GAP',
          lane.key,
          'No Evidence Link records the basis for a supplied responsibility.',
          'Record the source or human decision supporting this ownership assignment.',
          'evidence',
        );
      }
    const scopes = new Map<string, { count: number; hasEnd: boolean }>();
    scopes.set(process.key, { count: 0, hasEnd: false });
    for (const node of process.nodes ?? []) {
      if (node.type === 'subProcess' && !scopes.has(node.key)) scopes.set(node.key, { count: 0, hasEnd: false });
      const scope = scopes.get(node.containerRef) ?? { count: 0, hasEnd: false };
      scope.count++;
      scope.hasEnd ||= node.type === 'endEvent';
      scopes.set(node.containerRef, scope);
    }
    for (const [key, scope] of scopes) {
      // A readability heuristic, not a BPMN validity restriction or a required decomposition.
      if (scope.count > 40)
        advisory(
          'QUALITY_COMPLEXITY',
          key,
          'A single flow scope contains more than 40 flow nodes.',
          'Consider a meaningful subprocess or narrower view if it improves the intended audience’s understanding.',
        );
      if (!scope.hasEnd)
        advisory(
          'QUALITY_OUTCOME',
          key,
          'This flow scope has no explicit end outcome.',
          'Review whether an end result should be shown; an intentionally continuing process may retain this advisory.',
        );
    }
  }
}

/** Assess supplied claims; the deterministic Core cannot establish their truth. */
export function assessReview(request: ProcessRequest, handoff?: Handoff): ReviewAssessment {
  const safeRequest = structuredClone(request);
  const safeHandoff = handoff ? structuredClone(handoff) : undefined;
  if (safeHandoff) safeHandoff.request = safeRequest;
  const findings: FindingInput[] = [];
  minimize(safeRequest, safeHandoff, findings);
  // Unsafe semantic values are retained only internally to avoid inventing a new meaning.
  // Callers must refuse them before compilation and omit request context from the failure report.
  if (findings.some((finding) => finding.category === 'input'))
    return {
      request: safeRequest,
      ...(safeHandoff ? { handoff: safeHandoff } : {}),
      findings: findings.filter((finding) => finding.category === 'input'),
    };
  for (const issue of safeRequest.issues ?? []) {
    const context = {
      elementRefs: issue.elementRefs ?? [],
      evidenceRefs: issue.evidenceRefs ?? [],
      instance: issue.key,
    };
    if (issue.resolution?.kind === 'acceptedOmission') {
      findings.push({
        ...context,
        code: 'DECLARED_OMISSION',
        category: 'evidence',
        severity: 'info',
        blocksClean: false,
        message: 'An explicit Modeling Decision accepts a recorded omission for this model.',
        remediation: 'Retain the omission and its decision when sharing or continuing the process model.',
      });
    } else if (!issue.resolution) {
      const unsupported = issue.kind === 'unsupportedRequirement';
      findings.push({
        ...context,
        code: unsupported ? 'PROFILE_DEFERRED' : issue.kind === 'conflict' ? 'EVIDENCE_CONFLICT' : 'EVIDENCE_GAP',
        category: unsupported ? 'profile' : 'evidence',
        severity: unsupported || issue.affectsMeaning ? 'error' : 'warning',
        blocksClean: unsupported || issue.affectsMeaning,
        message: unsupported
          ? 'A recorded requirement remains outside the supported profile.'
          : 'A recorded process question or conflict remains unresolved.',
        remediation:
          'Discuss the recorded issue and retain the human decision, or request a faithful snapshot for clarification.',
      });
    }
  }
  consulting(safeRequest, findings);
  return { request: safeRequest, ...(safeHandoff ? { handoff: safeHandoff } : {}), findings };
}
