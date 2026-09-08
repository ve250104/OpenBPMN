import { createHash } from 'node:crypto';
import type { FindingInput } from './diagnostics.js';
import type { CheckId, Command, Finding, QualityCheck, QualityReport, ResultEnvelope } from './model.js';
import { FORMAT_VERSION, PROFILE_VERSION, TOOL_VERSION } from './version.js';

const checkIds: CheckId[] = ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render', 'evidence', 'consulting'];

export function createReport(requested: QualityReport['export']['requested'] = 'none'): QualityReport {
  return {
    reportVersion: FORMAT_VERSION,
    toolVersion: TOOL_VERSION,
    profileVersion: PROFILE_VERSION,
    export: { requested, outcome: 'none', cleanEligible: false, expertOverride: false },
    checks: checkIds.map((id) => ({ id, status: 'not_run', findingRefs: [], reason: 'No model assessment has run.' })),
    findings: [],
    context: {},
  };
}

export function addFindings(report: QualityReport, inputs: FindingInput[]): Finding[] {
  const added = inputs.map((input) => {
    const elementRefs = [...new Set(input.elementRefs ?? [])].sort();
    const evidenceRefs = [...new Set(input.evidenceRefs ?? [])].sort();
    const identity = JSON.stringify([
      input.code,
      elementRefs,
      evidenceRefs,
      input.inputPointer ?? '',
      input.instance ?? '',
    ]);
    const finding: Finding = {
      id: 'F_' + createHash('sha256').update(identity).digest('hex').slice(0, 20),
      code: input.code,
      category: input.category,
      severity: input.severity ?? 'error',
      blocksClean: input.blocksClean ?? true,
      message: input.message,
      remediation: input.remediation ?? 'Correct the indicated requirement and run the command again.',
      elementRefs,
      evidenceRefs,
      ...(input.inputPointer === undefined ? {} : { inputPointer: input.inputPointer }),
    };
    return finding;
  });
  report.findings = [...new Map([...report.findings, ...added].map((f) => [f.id, f])).values()].sort((a, b) => {
    const ak = a.category + ':' + a.code + ':' + a.id;
    const bk = b.category + ':' + b.code + ':' + b.id;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  return added;
}

export function setCheck(
  report: QualityReport,
  id: CheckId,
  status: QualityCheck['status'],
  findings: Finding[] = [],
  reason?: string,
): void {
  const check = {
    id,
    status,
    findingRefs: [...new Set(findings.map((f) => f.id))].sort(),
    ...(reason ? { reason } : {}),
  } as QualityCheck;
  if ((status === 'not_run' || status === 'not_applicable') && !reason) {
    throw new Error('An unrun check must explain why it did not run.');
  }
  const index = report.checks.findIndex((c) => c.id === id);
  if (index === -1) report.checks.push(check);
  else report.checks[index] = check;
}

export function resultFor(command: Command, report = createReport()): ResultEnvelope {
  return {
    resultVersion: FORMAT_VERSION,
    command,
    toolVersion: TOOL_VERSION,
    profileVersion: PROFILE_VERSION,
    status: 'refused',
    signal: command === 'generate' ? 'generation_failed' : 'operation_failed',
    exitCode: 3,
    artifacts: [],
    report,
  };
}
