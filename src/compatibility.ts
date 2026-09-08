import { inspectBpmn } from './inspect.js';
import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import { containsCredential } from './review.js';
import type { CompatibilityProfile } from './model.js';
import type { FindingInput } from './diagnostics.js';

export const COMPATIBILITY_RULES = {
  'sap-signavio-process-manager': {
    version: '1.0.0',
    sourceChecked: '2026-09-08',
    source:
      'https://help.sap.com/docs/signavio-process-manager/sap-signavio-process-manager-api/import-export-api-reference',
    sourceScope: 'Standard BPMN XML import/export route; no element-preservation certification.',
  },
  'celonis-analysis-conformance': {
    version: '1.0.0',
    sourceChecked: '2026-09-08',
    source: 'https://help.celonis.com/cpm47/en/conformance-checker',
    sourceScope: 'Legacy Celonis 4.7 control-flow envelope; not a current-cloud or execution claim.',
  },
  'celonis-process-management': {
    version: '1.0.0',
    sourceChecked: '2026-09-08',
    source: 'https://developer.celonis.com/cpm/developer/rest-api/overview/bpmn-api',
    sourceScope: 'Process Management BPMN import/export route, documented as a legacy API; no API integration.',
  },
} as const;

export interface CompatibilityAssessment {
  fit: 'passed' | 'failed' | 'not_run';
  reason?: string;
  findings: FindingInput[];
  ruleVersion: '1.0.0';
  verification: 'unverified';
  tenantChecks: { import: 'not_run'; roundTrip: 'not_run' };
}

function contained(root: ModdleElement): ModdleElement[] {
  const result = [root];
  for (const property of root.$descriptor?.properties ?? []) {
    if (property.isVirtual || property.isReference) continue;
    const value = root[property.name];
    for (const entry of Array.isArray(value) ? value : [value])
      if (entry && typeof entry === 'object' && typeof entry.$type === 'string') result.push(...contained(entry));
  }
  return result;
}
const analysisTypes = new Set([
  'bpmn:Definitions',
  'bpmn:Process',
  'bpmn:Task',
  'bpmn:SequenceFlow',
  'bpmn:ExclusiveGateway',
  'bpmn:ParallelGateway',
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:FormalExpression',
  'bpmn:Expression',
]);

/** Local target-fit evidence is distinct from generic validity and real consumer observations. */
export async function assessCompatibility(
  xml: string,
  profile: CompatibilityProfile,
  options: { signal?: AbortSignal } = {},
): Promise<CompatibilityAssessment> {
  const result: CompatibilityAssessment = {
    fit: 'passed',
    ruleVersion: '1.0.0',
    verification: 'unverified',
    tenantChecks: { import: 'not_run', roundTrip: 'not_run' },
    findings: [
      {
        code: 'COMPATIBILITY_UNVERIFIED',
        category: 'profile',
        severity: 'info',
        blocksClean: false,
        instance: profile,
        message:
          'Only local target-fit rules were assessed; tenant import and round-trip verification have not been run.',
        remediation:
          'Use the synthetic qualification pack in the named product/version before making a verified compatibility claim.',
      },
    ],
  };
  const inspection = await inspectBpmn(xml, options);
  if (
    !inspection.xmlValid ||
    !inspection.schemaValid ||
    inspection.semantics !== 'passed' ||
    inspection.profile !== 'passed' ||
    inspection.di !== 'passed'
  ) {
    result.fit = 'not_run';
    result.reason = 'Complete supported core validity and supplied DI are prerequisites for this local fit assessment.';
    return result;
  }
  if (profile === 'celonis-analysis-conformance') {
    const { rootElement } = await new BpmnModdle().fromXML(xml);
    const elements = contained(rootElement);
    if (elements.filter((element) => element.$type === 'bpmn:Process').length !== 1) {
      result.fit = 'failed';
      result.findings.push({
        code: 'COMPATIBILITY_LIMITATION',
        category: 'profile',
        severity: 'warning',
        blocksClean: false,
        instance: `${profile}:process-count`,
        message: 'The Analysis qualification envelope contains exactly one Process.',
        remediation:
          'Choose a human-approved single-process scope rather than merging or silently dropping other Processes.',
      });
    }
    result.findings.push({
      code: 'COMPATIBILITY_UNVERIFIED',
      category: 'profile',
      severity: 'info',
      blocksClean: false,
      instance: `${profile}:dictionary`,
      message:
        'Activity-name alignment with an event-data dictionary and actual conformance execution were not verified.',
      remediation:
        'Compare activity names with independently supplied event data in an explicitly authorized conformance test.',
    });
    for (const [index, element] of elements.entries())
      if (element.$type === 'bpmn:Task' && !element.name?.trim()) {
        result.fit = 'failed';
        result.findings.push({
          code: 'COMPATIBILITY_ACTIVITY_NAME',
          category: 'profile',
          severity: 'warning',
          blocksClean: false,
          instance: `${profile}:activity:${index}`,
          message: 'A generic activity has no supplied name for Analysis matching.',
          remediation:
            'Supply the intended activity name from process evidence; do not invent a match to unseen event data.',
        });
      }
    for (const [index, element] of elements.entries())
      if (element.$type.startsWith('bpmn:') && !analysisTypes.has(element.$type)) {
        result.fit = 'failed';
        const id = element.id;
        result.findings.push({
          code: 'COMPATIBILITY_LIMITATION',
          category: 'profile',
          severity: 'warning',
          blocksClean: false,
          instance: `${profile}:${index}`,
          elementRefs:
            typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(id) && !containsCredential(id) ? [id] : [],
          message: 'A supplied concept is outside the qualified Celonis Analysis control-flow envelope.',
          remediation:
            'Retain the original model. Use a separately reviewed generic-activity/XOR/AND view only if a human accepts that scope.',
        });
      }
  }
  return result;
}
