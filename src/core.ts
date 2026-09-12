import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { parseInput, validateProtocol } from './input.js';
import { compileModel } from './compiler.js';
import { validateModel } from './semantics.js';
import { layoutXml } from './layout.js';
import { renderSvg, browserCapability } from './renderer.js';
import { validateXml } from './xml.js';
import { assessReview } from './review.js';
import { inspectBpmn } from './inspect.js';
import { assessCompatibility } from './compatibility.js';
import { prepareOutputs, commitOutputs, preservedOutputs, type OutputPlan } from './files.js';
import { addFindings, createReport, resultFor, setCheck } from './report.js';
import { OperationError } from './diagnostics.js';
import type { ParsedOptions } from './options.js';
import type { ArtifactResult, CompatibilityProfile, Handoff, ResultEnvelope } from './model.js';
import { INPUT_BYTES } from './version.js';

export async function readInput(path: string, stdin: Readable, signal?: AbortSignal): Promise<string> {
  let stream: Readable | undefined;
  const interrupted = () =>
    stream?.destroy(new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The input operation was interrupted.'));
  try {
    signal?.throwIfAborted();
    if (path !== '-') {
      const info = await stat(path);
      if (!info.isFile())
        throw new OperationError('FS_PATH', 'filesystem', 'The named input must be an ordinary file.', 4, 'refused');
      if (info.size > INPUT_BYTES)
        throw new OperationError('INPUT_LIMIT', 'input', 'The input exceeds the 5 MiB limit.', 3, 'refused');
      stream = createReadStream(path, { signal });
    } else stream = stdin;
    signal?.addEventListener('abort', interrupted, { once: true });
    if (signal?.aborted) interrupted();
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > INPUT_BYTES) {
        stream.destroy();
        throw new OperationError('INPUT_LIMIT', 'input', 'The input exceeds the 5 MiB limit.', 3, 'refused');
      }
      chunks.push(buffer);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new OperationError('INPUT_SCHEMA', 'input', 'Input must be valid UTF-8 text.', 3, 'refused');
    }
  } catch (error) {
    if (error instanceof OperationError) throw error;
    if (signal?.aborted) throw new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The operation was interrupted.');
    throw new OperationError('FS_IO', 'filesystem', 'The named input could not be read.', 4);
  } finally {
    signal?.removeEventListener('abort', interrupted);
  }
}

async function preserved(plan: OutputPlan | undefined, kinds: ArtifactResult['kind'][]): Promise<ArtifactResult[]> {
  if (!plan) return [];
  const unchanged = new Set(await preservedOutputs(plan));
  return plan.paths.flatMap((path, index) =>
    unchanged.has(path) ? [{ path, kind: kinds[index]!, state: 'preserved' as const }] : [],
  );
}

export async function runCommand(
  options: ParsedOptions,
  runtime: { stdin?: Readable; signal?: AbortSignal } = {},
): Promise<ResultEnvelope> {
  const { command, values } = options;
  const requested = command === 'generate' ? ((values.export ?? 'auto') as 'auto' | 'clean' | 'snapshot') : 'none';
  const report = createReport(requested);
  const result = resultFor(command, report);
  let plan: OutputPlan | undefined;
  let omittedPreview: OutputPlan | undefined;
  let kinds: ArtifactResult['kind'][] = ['bpmn', 'svg', 'quality'];
  try {
    if (command === 'capabilities') {
      const browser = await browserCapability(values['browser-executable']);
      result.capabilities = {
        schemaVersions: { request: '1.0.0', handoff: '1.0.0', report: '1.0.0', result: '1.0.0' },
        profile: {
          name: 'OpenBPMN Consulting Core',
          version: '1.0.0',
          bpmnVersion: '2.0.2',
          complete: false,
          implementedConcepts: [
            'process',
            'collaboration',
            'participant',
            'lane',
            'nestedLane',
            'sequenceFlow',
            'messageFlow',
            'task',
            'userTask',
            'manualTask',
            'serviceTask',
            'businessRuleTask',
            'scriptTask',
            'sendTask',
            'receiveTask',
            'subProcess',
            'callActivity',
            'standardLoop',
            'multiInstanceLoop',
            'exclusiveGateway',
            'parallelGateway',
            'inclusiveGateway',
            'eventBasedGateway',
            'noneStartEvent',
            'noneEndEvent',
            'boundaryEvent',
            'messageEvent',
            'timerEvent',
            'conditionalEvent',
            'signalEvent',
            'errorEvent',
            'escalationEvent',
            'terminateEvent',
            'linkEvent',
            'message',
            'signal',
            'error',
            'escalation',
            'dataObject',
            'dataObjectReference',
            'dataStore',
            'dataStoreReference',
            'dataInput',
            'dataOutput',
            'dataAssociation',
            'documentation',
            'textAnnotation',
            'association',
            'group',
            'category',
          ],
        },
        runtime: {
          nodeVersion: process.versions.node,
          supported: Number(process.versions.node.split('.')[0]) === 24,
          browser: {
            available: browser.available,
            ...(browser.path ? { executable: browser.path } : {}),
            ...(browser.reason ? { reason: browser.reason } : {}),
          },
        },
        bounds: { inputBytes: INPUT_BYTES, semanticElements: 2000, nestingDepth: 16, contextRecords: 5000 },
        compatibilityProfiles: [
          { id: 'sap-signavio-process-manager', verification: 'unverified' },
          { id: 'celonis-analysis-conformance', verification: 'unverified' },
          { id: 'celonis-process-management', verification: 'unverified' },
        ],
      };
      for (const check of report.checks)
        setCheck(report, check.id, 'not_applicable', [], 'Capability inspection does not assess a model.');
      result.signal = 'capabilities_reported';
      result.status = 'completed';
      result.exitCode = 0;
      return result;
    }
    if (Number(process.versions.node.split('.')[0]) !== 24) {
      throw new OperationError('RUNTIME_MISSING', 'runtime', 'This build requires Node.js 24.x.');
    }
    if (command !== 'generate') {
      const xml = await readInput(values.input!, runtime.stdin ?? process.stdin, runtime.signal);
      const inspected = await inspectBpmn(xml, { signal: runtime.signal });
      const findings = addFindings(report, inspected.findings);
      if (inspected.modelKey) report.modelKey = inspected.modelKey;
      setCheck(report, 'input', 'not_applicable', [], 'The supplied document is XML, not Structured Process Evidence.');
      setCheck(report, 'evidence', 'not_applicable', [], 'No source evidence accompanies this supplied BPMN file.');
      setCheck(
        report,
        'consulting',
        'not_run',
        [],
        'Evidence-dependent consulting review is unavailable for this supplied document.',
      );
      setCheck(
        report,
        'xml',
        inspected.xmlValid ? 'passed' : 'failed',
        findings.filter((f) => f.category === 'xml' && f.code !== 'BPMN_XSD'),
      );
      for (const id of ['semantics', 'profile', 'di'] as const) {
        const status = inspected[id];
        setCheck(
          report,
          id,
          status,
          findings.filter(
            (f) => f.category === (id === 'semantics' ? 'semantic' : id === 'di' ? 'diagram' : 'profile'),
          ),
          status === 'not_run'
            ? 'A prerequisite or unsupported source construct prevents a complete assessment.'
            : undefined,
        );
      }
      if (inspected.xmlValid)
        setCheck(
          report,
          'xsd',
          inspected.schemaValid ? 'passed' : 'failed',
          findings.filter((f) => f.code === 'BPMN_XSD'),
        );
      if (!inspected.xmlValid || findings.some((f) => f.category === 'input' || f.code === 'XML_UNSAFE')) {
        result.exitCode = 3;
        return result;
      }
      if (command === 'validate') {
        setCheck(
          report,
          'render',
          'not_applicable',
          [],
          'Read-only validation does not launch a browser or create a preview.',
        );
        report.export.cleanEligible =
          inspected.schemaValid &&
          inspected.semantics === 'passed' &&
          inspected.profile === 'passed' &&
          inspected.di === 'passed';
        let compatible = true;
        if (values.compatibility) {
          const profile = values.compatibility as CompatibilityProfile;
          const fit = await assessCompatibility(xml, profile, { signal: runtime.signal });
          setCheck(report, `compatibility:${profile}`, fit.fit, addFindings(report, fit.findings), fit.reason);
          compatible = fit.fit === 'passed';
        }
        result.status = 'completed';
        result.signal = 'validation_completed';
        result.exitCode = report.export.cleanEligible && compatible ? 0 : 2;
        return result;
      }
      // Rendering claims only safe source presentation, never complete Model Validity.
      for (const id of ['xsd', 'semantics', 'profile'] as const)
        setCheck(
          report,
          id,
          'not_run',
          [],
          'This rendering command does not certify full model validity; use validate for that assessment.',
        );
      if (!inspected.renderable) {
        result.exitCode = 2;
        return result;
      }
      kinds = ['svg'];
      plan = await prepareOutputs([values.output!], { replace: values.replace, inputPath: values.input });
      const svg = await renderSvg(xml, { browserExecutable: values['browser-executable'], signal: runtime.signal });
      setCheck(report, 'render', 'passed');
      result.status = 'completed';
      result.signal = 'render_completed';
      result.exitCode = 0;
      result.artifacts = [{ kind: 'svg', path: plan.paths[0]!, state: 'produced' }];
      if (!validateProtocol('result', result))
        throw new OperationError(
          'INTERNAL_FAILURE',
          'runtime',
          'The render result did not satisfy the output contract.',
        );
      await commitOutputs(plan, [svg], undefined, { signal: runtime.signal });
      return result;
    }
    const parsed = parseInput(await readInput(values.input!, runtime.stdin ?? process.stdin, runtime.signal));
    const parseFindings = addFindings(report, parsed.findings);
    if (!parsed.request) {
      setCheck(report, 'input', 'failed', parseFindings);
      return result;
    }
    const review = assessReview(parsed.request, parsed.handoff);
    const context = addFindings(report, review.findings);
    if (context.some((f) => f.category === 'input')) {
      setCheck(report, 'input', 'failed', context);
      result.exitCode = 3;
      return result;
    }
    const request = review.request;
    setCheck(report, 'input', 'passed');
    report.modelKey = request.model.key;
    report.context = {
      evidence: request.evidence ?? [],
      decisions: request.decisions ?? [],
      issues: request.issues ?? [],
      links: request.links ?? [],
    };
    const semantic = addFindings(report, validateModel(request));
    const semanticErrors = semantic.filter((f) => f.category === 'semantic' || f.category === 'input');
    const profileErrors = [...semantic, ...context].filter((f) => f.category === 'profile' && f.blocksClean);
    setCheck(report, 'semantics', semanticErrors.length ? 'failed' : 'passed', semanticErrors);
    setCheck(report, 'profile', profileErrors.length ? 'failed' : 'passed', profileErrors);
    setCheck(
      report,
      'evidence',
      context.some((f) => f.category === 'evidence' && f.blocksClean) ? 'failed' : 'passed',
      context.filter((f) => f.category === 'evidence'),
    );
    setCheck(
      report,
      'consulting',
      'passed',
      context.filter((f) => f.category === 'consulting'),
    );
    const expert = Boolean(values['expert-invalid']);
    if (
      (!expert && semanticErrors.length) ||
      semantic.some((f) => f.code === 'CAPABILITY_UNAVAILABLE') ||
      (profileErrors.length && requested !== 'snapshot')
    ) {
      result.exitCode = 2;
      return result;
    }
    const meaningUnresolved = context.some((f) => f.category === 'evidence' && f.blocksClean);
    if (meaningUnresolved && requested !== 'snapshot') {
      result.signal = 'clarification_needed';
      result.exitCode = 2;
      return result;
    }
    const stem = resolve(values.output!) + (expert ? '.invalid' : '');
    const destinations = [stem + '.bpmn', stem + '.svg', stem + '.quality.json'];
    if (values.handoff) {
      destinations.push(resolve(values.handoff));
      kinds.push('handoff');
    }
    plan = await prepareOutputs(destinations, {
      replace: values.replace,
      inputPath: values.input === '-' ? undefined : values.input,
    });
    const compiled = await compileModel(request, { allowInvalid: requested === 'snapshot' });
    let xml = compiled;
    try {
      xml = await layoutXml(compiled, request, { signal: runtime.signal });
      setCheck(report, 'di', 'passed');
    } catch (error) {
      if (!expert || !(error instanceof OperationError) || error.category !== 'diagram') throw error;
      setCheck(
        report,
        'di',
        'failed',
        addFindings(report, [{ code: error.code, category: error.category, message: error.message }]),
      );
    }
    const assessment = await validateXml(xml, { signal: runtime.signal });
    const xmlFindings = addFindings(report, assessment.findings);
    setCheck(
      report,
      'xml',
      assessment.xmlValid ? 'passed' : 'failed',
      xmlFindings.filter((f) => f.code !== 'BPMN_XSD'),
    );
    if (assessment.xmlValid)
      setCheck(
        report,
        'xsd',
        assessment.schemaValid ? 'passed' : 'failed',
        xmlFindings.filter((f) => f.code === 'BPMN_XSD'),
      );
    if (!assessment.xmlValid || (!expert && !assessment.schemaValid)) {
      result.exitCode = 2;
      result.artifacts = await preserved(plan, kinds);
      return result;
    }
    const modelValid =
      assessment.schemaValid &&
      !semanticErrors.length &&
      !profileErrors.length &&
      report.checks.find((c) => c.id === 'di')?.status === 'passed';
    report.export.cleanEligible = modelValid && !meaningUnresolved;
    if (expert && modelValid) {
      throw new OperationError(
        'INPUT_SCHEMA',
        'input',
        'The model passes Model Validity checks. Remove --expert-invalid to request a normal snapshot.',
        3,
        'refused',
      );
    }
    let svg: string | undefined;
    try {
      svg = await renderSvg(xml, { browserExecutable: values['browser-executable'], signal: runtime.signal });
      setCheck(report, 'render', 'passed');
    } catch (error) {
      if (!expert || !(error instanceof OperationError) || runtime.signal?.aborted) throw error;
      setCheck(
        report,
        'render',
        'failed',
        addFindings(report, [{ code: error.code, category: error.category, message: error.message }]),
      );
      omittedPreview = { ...plan, paths: [plan.paths[1]!], originals: [plan.originals[1]] };
      plan = {
        ...plan,
        paths: plan.paths.filter((_, index) => index !== 1),
        originals: plan.originals.filter((_, index) => index !== 1),
      };
      kinds = kinds.filter((kind) => kind !== 'svg');
    }
    report.export.outcome = expert ? 'invalid' : requested === 'snapshot' ? 'snapshot' : 'clean';
    report.export.expertOverride = expert;
    const contents = [xml, ...(svg === undefined ? [] : [svg]), JSON.stringify(report, null, 2) + '\n'];
    if (values.handoff) {
      const handoff: Handoff = {
        handoffVersion: '1.0.0',
        request,
        ...(review.handoff?.lifecycleStatus ? { lifecycleStatus: review.handoff.lifecycleStatus } : {}),
        ...(review.handoff?.reviewNotes ? { reviewNotes: review.handoff.reviewNotes } : {}),
        lastReport: report,
      };
      let handoffText = JSON.stringify(handoff) + '\n';
      if (!parseInput(handoffText).request) {
        delete handoff.lastReport;
        handoffText = JSON.stringify(handoff) + '\n';
      }
      if (!validateProtocol('handoff', handoff) || !parseInput(handoffText).request) {
        throw new OperationError(
          'INPUT_LIMIT',
          'input',
          'The requested Handoff cannot fit the versioned input bounds.',
          3,
          'refused',
        );
      }
      contents.push(handoffText);
    }
    runtime.signal?.throwIfAborted();
    result.artifacts = plan.paths.map((path, index) => ({ kind: kinds[index]!, path, state: 'produced' as const }));
    result.signal = expert ? 'invalid_exported' : requested === 'snapshot' ? 'snapshot_ready' : 'clean_export_ready';
    result.status = 'completed';
    result.exitCode = expert ? 2 : 0;
    if (!validateProtocol('report', report) || !validateProtocol('result', result)) {
      throw new OperationError(
        'INTERNAL_FAILURE',
        'runtime',
        'Generated results did not satisfy the output contract. Existing artifacts were preserved.',
      );
    }
    await commitOutputs(plan, contents, undefined, { signal: runtime.signal });
    result.artifacts.push(...(await preserved(omittedPreview, ['svg'])));
    return result;
  } catch (error) {
    const known =
      error instanceof OperationError
        ? error
        : new OperationError(
            'INTERNAL_FAILURE',
            'runtime',
            runtime.signal?.aborted ? 'The operation was interrupted.' : 'The operation failed unexpectedly.',
          );
    const findings = addFindings(
      report,
      known.findings ?? [{ code: known.code, category: known.category, message: known.message }],
    );
    if (known.category === 'input' && report.checks.find((c) => c.id === 'input')?.status !== 'passed')
      setCheck(report, 'input', 'failed', findings);
    if (known.category === 'diagram')
      setCheck(
        report,
        report.checks.find((c) => c.id === 'di')?.status === 'passed' ? 'render' : 'di',
        'failed',
        findings,
      );
    result.status = known.status;
    result.signal = command === 'generate' ? 'generation_failed' : 'operation_failed';
    result.exitCode = known.exitCode as 1 | 2 | 3 | 4;
    result.artifacts = [...(await preserved(plan, kinds)), ...(await preserved(omittedPreview, ['svg']))];
    report.export.outcome = 'none';
    report.export.expertOverride = false;
    return result;
  }
}
