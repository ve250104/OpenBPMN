/** Versioned process meaning; XML, geometry, and review context are not model state. */
export interface SemanticRecord {
  key: string;
  name?: string;
  documentation?: string;
}

export type Loop =
  | { kind: 'standard'; condition: string; testBefore?: boolean }
  | { kind: 'multiInstance'; sequential: boolean };

export type EventDefinition =
  | { kind: 'none' | 'terminate' }
  | { kind: 'message' | 'signal'; ref: string }
  | { kind: 'error' | 'escalation'; ref?: string }
  | { kind: 'timer'; timeDate: string; timeDuration?: never; timeCycle?: never }
  | { kind: 'timer'; timeDuration: string; timeDate?: never; timeCycle?: never }
  | { kind: 'timer'; timeCycle: string; timeDate?: never; timeDuration?: never }
  | { kind: 'conditional'; condition: string }
  | { kind: 'link'; name: string };

export interface NodeRecord extends SemanticRecord {
  containerRef: string;
}
export type TaskType =
  | 'task'
  | 'userTask'
  | 'manualTask'
  | 'serviceTask'
  | 'businessRuleTask'
  | 'scriptTask'
  | 'subProcess';
interface ActivityRecord extends NodeRecord {
  loop?: Loop;
  defaultFlowRef?: string;
}
export type Activity =
  | (ActivityRecord & { type: TaskType })
  | (ActivityRecord & { type: 'sendTask' | 'receiveTask'; messageRef?: string })
  | (ActivityRecord & { type: 'callActivity'; calledProcessRef: string });
export type Gateway =
  | (NodeRecord & { type: 'exclusiveGateway' | 'inclusiveGateway'; defaultFlowRef?: string })
  | (NodeRecord & { type: 'parallelGateway' })
  | (NodeRecord & { type: 'eventBasedGateway'; instantiate?: boolean; eventGatewayType?: 'Exclusive' | 'Parallel' });
export type ProcessEvent =
  | (NodeRecord & {
      type: 'startEvent' | 'intermediateCatchEvent' | 'intermediateThrowEvent' | 'endEvent';
      event: EventDefinition;
    })
  | (NodeRecord & { type: 'boundaryEvent'; event: EventDefinition; attachedToRef: string; interrupting: boolean });
export type ProcessNode = Activity | Gateway | ProcessEvent;
export interface SequenceFlow extends SemanticRecord {
  containerRef: string;
  sourceRef: string;
  targetRef: string;
  condition?: string;
}
export interface Lane extends SemanticRecord {
  parentRef: string;
  flowNodeRefs?: string[];
}
export interface Participant extends SemanticRecord {
  processRef?: string;
}
export interface MessageFlow extends SemanticRecord {
  sourceRef: string;
  targetRef: string;
  messageRef?: string;
}
export type Declaration =
  | (SemanticRecord & { type: 'message' | 'signal' })
  | (SemanticRecord & { type: 'error' | 'escalation'; code?: string })
  | (SemanticRecord & { type: 'dataStore'; capacity?: number; unlimited?: boolean })
  | (SemanticRecord & { type: 'category'; value: string });

export type DocumentationArtifact =
  | (Omit<SemanticRecord, 'name'> & { type: 'textAnnotation'; containerRef: string; text: string })
  | (Omit<SemanticRecord, 'name'> & { type: 'group'; containerRef: string; categoryRef: string; memberRefs: string[] })
  | (Omit<SemanticRecord, 'name'> & {
      type: 'association';
      containerRef: string;
      sourceRef: string;
      targetRef: string;
      direction?: 'none' | 'one' | 'both';
    });
export type Artifact =
  | DocumentationArtifact
  | (SemanticRecord & { type: 'dataObject'; containerRef: string; isCollection?: boolean })
  | (SemanticRecord & { type: 'dataObjectReference'; containerRef: string; dataObjectRef: string; state?: string })
  | (SemanticRecord & { type: 'dataStoreReference'; containerRef: string; dataStoreRef: string; state?: string })
  | (SemanticRecord & { type: 'dataInput' | 'dataOutput'; ownerRef: string; isCollection?: boolean });
export interface DataAssociation extends Omit<SemanticRecord, 'name'> {
  direction: 'input' | 'output';
  ownerRef: string;
  sourceRefs: string[];
  targetRef: string;
}
export interface Process extends SemanticRecord {
  nodes?: ProcessNode[];
  flows?: SequenceFlow[];
  lanes?: Lane[];
  artifacts?: Artifact[];
  dataAssociations?: DataAssociation[];
}
export interface Collaboration extends SemanticRecord {
  participants?: Participant[];
  messageFlows?: MessageFlow[];
  artifacts?: DocumentationArtifact[];
}
export interface ProcessModel extends SemanticRecord {
  name: string;
  primaryRef: string;
  processes: Process[];
  collaboration?: Collaboration;
  declarations?: Declaration[];
}
export interface Evidence {
  key: string;
  source: string;
  summary: string;
  locator?: string;
}
export interface ModelingDecision {
  key: string;
  description: string;
  elementRefs?: string[];
  evidenceRefs?: string[];
  historicalElementRefs?: string[];
}
interface IssueRecord {
  key: string;
  description: string;
  elementRefs?: string[];
  evidenceRefs?: string[];
  affectsMeaning: boolean;
  resolution?: { decisionRef: string; kind: 'resolved' | 'acceptedOmission' };
  historicalElementRefs?: string[];
}
export type ProcessIssue =
  | (IssueRecord & { kind: 'question' | 'conflict' })
  | (IssueRecord & { kind: 'unsupportedRequirement'; concept: string });
export type EvidenceLink = { elementRef: string; assertion: string } & (
  | { basis: 'evidence' | 'decision'; supportRefs: string[] }
  | { basis: 'inference'; supportRefs?: string[] }
);
export interface ReviewScenario {
  key: string;
  name: string;
  startRef: string;
  steps?: string[];
  expectedOutcome: string;
  evidenceRefs?: string[];
}
export interface Presentation {
  direction: 'leftToRight';
  participantOrder?: string[];
  laneOrder?: string[];
  subprocesses?: { elementRef: string; expanded: boolean }[];
}
export interface ReviewContext {
  evidence?: Evidence[];
  decisions?: ModelingDecision[];
  issues?: ProcessIssue[];
  links?: EvidenceLink[];
}
export interface ProcessRequest extends ReviewContext {
  schemaVersion: '1.0.0';
  profileVersion: '1.0.0';
  model: ProcessModel;
  scenarios?: ReviewScenario[];
  presentation?: Presentation;
}

export type CompatibilityProfile =
  | 'sap-signavio-process-manager'
  | 'celonis-analysis-conformance'
  | 'celonis-process-management';
export type CheckId =
  | 'input'
  | 'xml'
  | 'xsd'
  | 'semantics'
  | 'profile'
  | 'di'
  | 'render'
  | 'evidence'
  | 'consulting'
  | `compatibility:${CompatibilityProfile}`;
export type FindingCategory =
  | 'input'
  | 'xml'
  | 'semantic'
  | 'profile'
  | 'diagram'
  | 'evidence'
  | 'consulting'
  | 'runtime'
  | 'filesystem';
export interface Finding {
  id: string;
  code: string;
  category: FindingCategory;
  severity: 'error' | 'warning' | 'info';
  blocksClean: boolean;
  message: string;
  remediation: string;
  elementRefs: string[];
  evidenceRefs: string[];
  inputPointer?: string;
}
export type QualityCheck =
  | { id: CheckId; status: 'passed' | 'failed'; findingRefs: string[]; reason?: string }
  | { id: CheckId; status: 'not_run' | 'not_applicable'; findingRefs: string[]; reason: string };
export interface QualityReport {
  reportVersion: '1.0.0';
  toolVersion: string;
  profileVersion: '1.0.0';
  modelKey?: string;
  export: {
    requested: 'auto' | 'clean' | 'snapshot' | 'none';
    outcome: 'clean' | 'snapshot' | 'invalid' | 'none';
    cleanEligible: boolean;
    expertOverride: boolean;
  };
  checks: QualityCheck[];
  findings: Finding[];
  context: ReviewContext;
}
export interface Handoff {
  handoffVersion: '1.0.0';
  request: ProcessRequest;
  lifecycleStatus?: string;
  reviewNotes?: string[];
  lastReport?: QualityReport;
}
export type Command = 'generate' | 'validate' | 'render' | 'capabilities';
export type ResultSignal =
  | 'clean_export_ready'
  | 'snapshot_ready'
  | 'clarification_needed'
  | 'generation_failed'
  | 'invalid_exported'
  | 'validation_completed'
  | 'render_completed'
  | 'capabilities_reported'
  | 'operation_failed';
export interface ArtifactResult {
  kind: 'bpmn' | 'svg' | 'quality' | 'handoff';
  path: string;
  state: 'produced' | 'preserved';
}
export interface Capabilities {
  schemaVersions: { request: '1.0.0'; handoff: '1.0.0'; report: '1.0.0'; result: '1.0.0' };
  profile: {
    name: 'OpenBPMN Consulting Core';
    version: '1.0.0';
    bpmnVersion: '2.0.2';
    implementedConcepts: string[];
    complete: boolean;
  };
  runtime: {
    nodeVersion: string;
    supported: boolean;
    browser: { available: boolean; executable?: string; version?: string; reason?: string };
  };
  bounds: { inputBytes: number; semanticElements: number; nestingDepth: number; contextRecords: number };
  compatibilityProfiles: {
    id: CompatibilityProfile;
    verification: 'unverified' | 'verified' | 'verified_with_limitations' | 'failed';
  }[];
}
export interface ResultEnvelope {
  resultVersion: '1.0.0';
  command: Command;
  toolVersion: string;
  profileVersion: '1.0.0';
  status: 'completed' | 'refused' | 'failed';
  signal: ResultSignal;
  exitCode: 0 | 1 | 2 | 3 | 4;
  artifacts: ArtifactResult[];
  report: QualityReport;
  capabilities?: Capabilities;
}
