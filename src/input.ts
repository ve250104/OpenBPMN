import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FindingInput } from './diagnostics.js';
import type { Handoff, ProcessRequest, QualityReport, ResultEnvelope, ReviewContext, SemanticRecord } from './model.js';

export interface ParsedInput {
  request?: ProcessRequest;
  handoff?: Handoff;
  findings: FindingInput[];
}
export const INPUT_BOUNDS = Object.freeze({
  inputBytes: 5 * 1024 * 1024,
  semanticElements: 2000,
  nestingDepth: 16,
  contextRecords: 5000,
});

const ajv = new Ajv2020({ strict: true, allErrors: false, ownProperties: true });
const validateRequest = ajv.compile(
  JSON.parse(readFileSync(new URL('../schemas/request.schema.json', import.meta.url), 'utf8')),
);
const validateReport = ajv.compile(
  JSON.parse(readFileSync(new URL('../schemas/quality-report.schema.json', import.meta.url), 'utf8')),
);
const validateHandoff = ajv.compile(
  JSON.parse(readFileSync(new URL('../schemas/handoff.schema.json', import.meta.url), 'utf8')),
);
const validateResult = ajv.compile(
  JSON.parse(readFileSync(new URL('../schemas/result.schema.json', import.meta.url), 'utf8')),
);

function refused(code: string, message: string, inputPointer?: string): ParsedInput {
  return {
    findings: [
      {
        code,
        category: 'input',
        message,
        remediation: 'Supply a complete supported Structured Process Evidence request.',
        inputPointer,
      },
    ],
  };
}

class JsonRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Inspect member names before JSON.parse can discard duplicate evidence. */
function inspectJson(text: string): void {
  let cursor = 0;
  const whitespace = () => {
    while (cursor < text.length && /[\t\n\r ]/.test(text[cursor]!)) cursor++;
  };
  function string(): string {
    const start = cursor++;
    while (cursor < text.length) {
      const next = text[cursor++];
      if (next === '\\') cursor++;
      else if (next === '"') return JSON.parse(text.slice(start, cursor)) as string;
    }
    throw new JsonRefusal('INPUT_SCHEMA');
  }
  function value(depth: number): void {
    if (depth > INPUT_BOUNDS.nestingDepth) throw new JsonRefusal('INPUT_LIMIT');
    whitespace();
    const next = text[cursor];
    if (next === '{') {
      cursor++;
      whitespace();
      const keys = new Set<string>();
      if (text[cursor] === '}') {
        cursor++;
        return;
      }
      while (cursor < text.length) {
        if (text[cursor] !== '"') throw new JsonRefusal('INPUT_SCHEMA');
        const key = string();
        if (keys.has(key)) throw new JsonRefusal('KEY_DUPLICATE');
        keys.add(key);
        whitespace();
        if (text[cursor++] !== ':') throw new JsonRefusal('INPUT_SCHEMA');
        value(depth + 1);
        whitespace();
        const separator = text[cursor++];
        if (separator === '}') return;
        if (separator !== ',') throw new JsonRefusal('INPUT_SCHEMA');
        whitespace();
      }
      throw new JsonRefusal('INPUT_SCHEMA');
    }
    if (next === '[') {
      cursor++;
      whitespace();
      if (text[cursor] === ']') {
        cursor++;
        return;
      }
      while (cursor < text.length) {
        value(depth + 1);
        whitespace();
        const separator = text[cursor++];
        if (separator === ']') return;
        if (separator !== ',') throw new JsonRefusal('INPUT_SCHEMA');
      }
      throw new JsonRefusal('INPUT_SCHEMA');
    }
    if (next === '"') {
      string();
      return;
    }
    const start = cursor;
    while (cursor < text.length && !/[\s,\]}]/.test(text[cursor]!)) cursor++;
    if (cursor === start) throw new JsonRefusal('INPUT_SCHEMA');
    JSON.parse(text.slice(start, cursor));
  }
  value(0);
  whitespace();
  if (cursor !== text.length) throw new JsonRefusal('INPUT_SCHEMA');
}

function semanticRecords(request: ProcessRequest): SemanticRecord[] {
  const model = request.model;
  const collaboration = model.collaboration;
  return [
    model,
    ...model.processes,
    ...(model.declarations ?? []),
    ...model.processes.flatMap((process) => [
      ...(process.nodes ?? []),
      ...(process.flows ?? []),
      ...(process.lanes ?? []),
      ...(process.artifacts ?? []),
      ...(process.dataAssociations ?? []),
    ]),
    ...(collaboration
      ? [
          collaboration,
          ...(collaboration.participants ?? []),
          ...(collaboration.messageFlows ?? []),
          ...(collaboration.artifacts ?? []),
        ]
      : []),
  ];
}

function contextSize(context?: ReviewContext): number {
  return [context?.evidence, context?.decisions, context?.issues, context?.links].reduce(
    (count, records) => count + (records?.length ?? 0),
    0,
  );
}

function overBudget(request: ProcessRequest, handoff?: Handoff): boolean {
  if (
    semanticRecords(request).length > INPUT_BOUNDS.semanticElements ||
    contextSize(request) +
      (request.scenarios?.length ?? 0) +
      contextSize(handoff?.lastReport?.context) +
      (handoff?.lastReport?.findings.length ?? 0) +
      (handoff?.reviewNotes?.length ?? 0) >
      INPUT_BOUNDS.contextRecords
  )
    return true;
  const parents = new Map<string, string>();
  for (const process of request.model.processes) {
    for (const node of process.nodes ?? []) if (node.type === 'subProcess') parents.set(node.key, node.containerRef);
    for (const lane of process.lanes ?? []) parents.set(lane.key, lane.parentRef);
  }
  for (const key of parents.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = key;
    while (current && parents.has(current) && !seen.has(current)) {
      seen.add(current);
      if (seen.size > INPUT_BOUNDS.nestingDepth) return true;
      current = parents.get(current);
    }
  }
  return false;
}

function inspectContext(request: ProcessRequest): ParsedInput | undefined {
  const records = semanticRecords(request);
  const elements = new Set<string>();
  for (const record of records) {
    if (elements.has(record.key))
      return refused('KEY_DUPLICATE', 'A semantic identity is used more than once.', '/model');
    elements.add(record.key);
  }
  for (const collection of [request.evidence, request.decisions, request.issues, request.scenarios]) {
    const keys = (collection ?? []).map((entry) => entry.key);
    if (new Set(keys).size !== keys.length)
      return refused('KEY_DUPLICATE', 'A review-context identity is repeated within its collection.');
  }
  const evidence = new Set((request.evidence ?? []).map((entry) => entry.key));
  const decisions = new Set((request.decisions ?? []).map((entry) => entry.key));
  const missing = (refs: string[] | undefined, keys: Set<string>) => (refs ?? []).some((key) => !keys.has(key));
  for (const entry of [...(request.decisions ?? []), ...(request.issues ?? [])]) {
    if (missing(entry.elementRefs, elements) || missing(entry.evidenceRefs, evidence))
      return refused('REF_MISSING', 'A review-context reference does not resolve to its declared collection.');
    if ((entry.historicalElementRefs ?? []).some((key) => elements.has(key)))
      return refused('KEY_DUPLICATE', 'A historical element identity cannot be reused in the current model.');
  }
  for (const issue of request.issues ?? []) {
    if (issue.resolution && !decisions.has(issue.resolution.decisionRef))
      return refused('REF_MISSING', 'An issue resolution does not reference a Modeling Decision.');
    if (!issue.resolution && (issue.historicalElementRefs?.length ?? 0) > 0 && (issue.elementRefs?.length ?? 0) === 0)
      return refused('REF_MISSING', 'An active issue must reference current scope rather than only removed elements.');
  }
  for (const link of request.links ?? []) {
    if (!elements.has(link.elementRef) || missing(link.supportRefs, link.basis === 'decision' ? decisions : evidence))
      return refused('REF_MISSING', 'An Evidence Link does not resolve to the declared source or model element.');
  }
  for (const scenario of request.scenarios ?? []) {
    if (
      !elements.has(scenario.startRef) ||
      missing(scenario.steps, elements) ||
      missing(scenario.evidenceRefs, evidence)
    )
      return refused('REF_MISSING', 'A review scenario references an unavailable model element or evidence record.');
  }
  const presentation = request.presentation;
  const participants = new Set((request.model.collaboration?.participants ?? []).map((participant) => participant.key));
  const lanes = new Set(request.model.processes.flatMap((process) => (process.lanes ?? []).map((lane) => lane.key)));
  const subprocesses = new Set(
    request.model.processes.flatMap((process) =>
      (process.nodes ?? []).filter((node) => node.type === 'subProcess').map((node) => node.key),
    ),
  );
  if (
    missing(presentation?.participantOrder, participants) ||
    missing(presentation?.laneOrder, lanes) ||
    missing(
      presentation?.subprocesses?.map((item) => item.elementRef),
      subprocesses,
    )
  )
    return refused('REF_MISSING', 'Presentation references an element of the wrong kind or an unavailable element.');
  const presentations = presentation?.subprocesses?.map((item) => item.elementRef) ?? [];
  if (new Set(presentations).size !== presentations.length)
    return refused('KEY_DUPLICATE', 'A Subprocess has more than one presentation choice.');
  return undefined;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Normalize only documented optional fields; unknown empty fields must still fail. */
function normalizeOptionalText(value: unknown, handoff: boolean): void {
  const dropEmpty = (entry: unknown, fields: string[]) => {
    const record = object(entry);
    if (record) for (const field of fields) if (record[field] === '') delete record[field];
  };
  const items = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.flatMap((item) => (object(item) ? [object(item)!] : [])) : [];
  const normalizeContext = (context: unknown) => {
    for (const evidence of items(object(context)?.evidence)) dropEmpty(evidence, ['locator']);
  };
  const top = object(value);
  if (!top) return;
  if (handoff) {
    dropEmpty(top, ['lifecycleStatus']);
    normalizeContext(object(top.lastReport)?.context);
  }
  const request = handoff ? object(top.request) : top;
  if (!request) return;
  normalizeContext(request);
  const model = object(request.model);
  if (!model) return;
  dropEmpty(model, ['documentation']);
  const common = (record: unknown) => dropEmpty(record, ['name', 'documentation']);
  const artifact = (record: Record<string, unknown>) => {
    dropEmpty(
      record,
      ['textAnnotation', 'group', 'association'].includes(String(record.type))
        ? ['documentation']
        : ['name', 'documentation'],
    );
    if (record.type === 'dataObjectReference' || record.type === 'dataStoreReference') dropEmpty(record, ['state']);
  };
  for (const process of items(model.processes)) {
    common(process);
    for (const node of items(process.nodes)) common(node);
    for (const flow of items(process.flows)) dropEmpty(flow, ['name', 'documentation', 'condition']);
    for (const lane of items(process.lanes)) common(lane);
    for (const dataAssociation of items(process.dataAssociations)) dropEmpty(dataAssociation, ['documentation']);
    for (const item of items(process.artifacts)) artifact(item);
  }
  for (const declaration of items(model.declarations)) {
    common(declaration);
    if (declaration.type === 'error' || declaration.type === 'escalation') dropEmpty(declaration, ['code']);
  }
  const collaboration = object(model.collaboration);
  if (collaboration) {
    common(collaboration);
    for (const participant of items(collaboration.participants)) common(participant);
    for (const flow of items(collaboration.messageFlows)) common(flow);
    for (const item of items(collaboration.artifacts)) artifact(item);
  }
}

function normalizeFlowLabels(request: ProcessRequest): ParsedInput | undefined {
  for (const [processIndex, process] of request.model.processes.entries()) {
    for (const [flowIndex, flow] of (process.flows ?? []).entries()) {
      if (flow.condition && flow.name === undefined) {
        if ([...flow.condition].length > 500)
          return refused(
            'INPUT_SCHEMA',
            'A long conditional Sequence Flow needs an explicit short visible name; its condition will not be truncated.',
            `/model/processes/${processIndex}/flows/${flowIndex}/name`,
          );
        flow.name = flow.condition;
      }
    }
  }
  return undefined;
}

function coherentReport(report: QualityReport): boolean {
  const findings = new Set(report.findings.map((finding) => finding.id));
  if (
    findings.size !== report.findings.length ||
    report.checks.some((check) => check.findingRefs.some((id) => !findings.has(id)))
  )
    return false;
  const passed = new Set(report.checks.filter((check) => check.status === 'passed').map((check) => check.id));
  const structural = ['xml', 'xsd', 'semantics', 'di'] as const;
  const { requested, outcome, cleanEligible, expertOverride } = report.export;
  if (
    cleanEligible &&
    (![...structural, 'profile' as const].every((id) => passed.has(id)) ||
      report.findings.some((finding) => finding.category === 'evidence' && finding.blocksClean))
  )
    return false;
  if (expertOverride !== (outcome === 'invalid')) return false;
  if (outcome === 'clean' && (!cleanEligible || (requested !== 'auto' && requested !== 'clean'))) return false;
  if (outcome === 'snapshot' && (requested !== 'snapshot' || !structural.every((id) => passed.has(id)))) return false;
  if (outcome === 'invalid' && (requested !== 'snapshot' || cleanEligible)) return false;
  return true;
}

function coherentResult(result: ResultEnvelope): boolean {
  if (!coherentReport(result.report)) return false;
  const produced = result.artifacts.filter((artifact) => artifact.state === 'produced');
  const kinds = produced.map((artifact) => artifact.kind);
  if (
    new Set(result.artifacts.map((artifact) => artifact.path)).size !== result.artifacts.length ||
    new Set(kinds).size !== kinds.length
  )
    return false;
  const normal = result.signal === 'clean_export_ready' || result.signal === 'snapshot_ready';
  if (
    normal &&
    (!['bpmn', 'svg', 'quality'].every((kind) => kinds.includes(kind as (typeof kinds)[number])) ||
      !result.report.checks.some((check) => check.id === 'render' && check.status === 'passed'))
  )
    return false;
  if (
    result.signal === 'clean_export_ready' &&
    (result.report.export.outcome !== 'clean' ||
      !result.report.checks.some((check) => check.id === 'input' && check.status === 'passed'))
  )
    return false;
  if (result.signal === 'snapshot_ready' && result.report.export.outcome !== 'snapshot') return false;
  if (
    result.signal === 'invalid_exported' &&
    (result.report.export.outcome !== 'invalid' || !kinds.includes('bpmn') || !kinds.includes('quality'))
  )
    return false;
  if (result.signal === 'render_completed' && (produced.length !== 1 || kinds[0] !== 'svg')) return false;
  if (result.signal === 'capabilities_reported' && result.artifacts.length !== 0) return false;
  if (!normal && result.signal !== 'invalid_exported' && result.signal !== 'render_completed' && produced.length !== 0)
    return false;
  if (
    result.command !== 'generate' &&
    (result.report.export.requested !== 'none' || result.report.export.outcome !== 'none')
  )
    return false;
  if ((result.command === 'capabilities' || result.command === 'render') && result.report.export.cleanEligible)
    return false;
  return true;
}

/** Validate a complete protocol object before publishing or writing it. Does not mutate. */
export function validateProtocol(kind: 'request' | 'handoff' | 'report' | 'result', value: unknown): boolean {
  if (kind === 'request')
    return (
      Boolean(validateRequest(value)) &&
      !overBudget(value as ProcessRequest) &&
      !inspectContext(value as ProcessRequest)
    );
  if (kind === 'handoff') {
    if (!validateHandoff(value)) return false;
    const handoff = value as Handoff;
    return (
      !overBudget(handoff.request, handoff) &&
      !inspectContext(handoff.request) &&
      (!handoff.lastReport || coherentReport(handoff.lastReport))
    );
  }
  if (kind === 'report') return Boolean(validateReport(value)) && coherentReport(value as QualityReport);
  return Boolean(validateResult(value)) && coherentResult(value as ResultEnvelope);
}

export function parseInput(text: string): ParsedInput {
  if (Buffer.byteLength(text, 'utf8') > INPUT_BOUNDS.inputBytes)
    return refused('INPUT_LIMIT', 'Input exceeds the byte limit.');
  let value: unknown;
  try {
    inspectJson(text);
    value = JSON.parse(text);
  } catch (error) {
    const code = error instanceof JsonRefusal ? error.code : 'INPUT_SCHEMA';
    return refused(
      code,
      code === 'KEY_DUPLICATE'
        ? 'Input repeats a JSON member name.'
        : code === 'INPUT_LIMIT'
          ? 'Input exceeds the nesting limit.'
          : 'Input is not a well-formed JSON document.',
    );
  }
  const isHandoff = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'handoffVersion'));
  normalizeOptionalText(value, isHandoff);
  const versions = isHandoff
    ? [
        [(value as Handoff).handoffVersion, '/handoffVersion'],
        [(value as Handoff).request?.schemaVersion, '/request/schemaVersion'],
        [(value as Handoff).request?.profileVersion, '/request/profileVersion'],
        [(value as Handoff).lastReport?.reportVersion, '/lastReport/reportVersion'],
        [(value as Handoff).lastReport?.profileVersion, '/lastReport/profileVersion'],
      ]
    : [
        [(value as ProcessRequest | null)?.schemaVersion, '/schemaVersion'],
        [(value as ProcessRequest | null)?.profileVersion, '/profileVersion'],
      ];
  for (const [version, pointer] of versions) {
    if (version !== undefined && version !== '1.0.0')
      return refused('INPUT_VERSION', 'An input schema or profile version is not supported.', pointer);
  }
  const validate = isHandoff ? validateHandoff : validateRequest;
  if (!validate(value)) {
    return refused(
      validate.errors?.some((error) => error.keyword === 'maxItems') ? 'INPUT_LIMIT' : 'INPUT_SCHEMA',
      'Input does not match the versioned Structured Process Evidence or Handoff schema.',
      validate.errors?.[0]?.instancePath,
    );
  }
  const handoff = isHandoff ? (value as Handoff) : undefined;
  const request = handoff ? handoff.request : (value as ProcessRequest);
  if (overBudget(request, handoff))
    return refused('INPUT_LIMIT', 'Input exceeds the semantic-element, nesting, or context-record limit.');
  if (handoff?.lastReport && !coherentReport(handoff.lastReport))
    return refused(
      'INPUT_SCHEMA',
      'The historical Quality Report contains inconsistent checks, findings, or export claims.',
      '/lastReport',
    );
  const contextFailure = inspectContext(request);
  if (contextFailure) return contextFailure;
  const labelFailure = normalizeFlowLabels(request);
  if (labelFailure) return labelFailure;
  return { request, ...(handoff ? { handoff } : {}), findings: [] };
}
