import { Worker } from 'node:worker_threads';
import type { FindingInput } from './diagnostics.js';
import { OperationError } from './diagnostics.js';
import { INPUT_BYTES } from './version.js';

export interface XmlAssessment {
  xmlValid: boolean;
  schemaValid: boolean;
  findings: FindingInput[];
}

export async function validateXml(xml: string, options: { signal?: AbortSignal } = {}): Promise<XmlAssessment> {
  if (Buffer.byteLength(xml) > INPUT_BYTES) {
    return {
      xmlValid: false,
      schemaValid: false,
      findings: [{ code: 'INPUT_LIMIT', category: 'input', message: 'The XML exceeds the 5 MiB input limit.' }],
    };
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || /<\?(?!xml(?:\s|\?))/i.test(xml)) {
    return {
      xmlValid: false,
      schemaValid: false,
      findings: [
        {
          code: 'XML_UNSAFE',
          category: 'xml',
          message: 'DTD, entity declarations, and processing instructions are not accepted.',
        },
      ],
    };
  }
  options.signal?.throwIfAborted();
  return new Promise<XmlAssessment>((resolve, reject) => {
    const worker = new Worker(new URL('./xml-worker.js', import.meta.url), {
      workerData: { xml },
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 96 },
    });
    worker.stdout.on('data', () => {});
    worker.stderr.on('data', () => {});
    let settled = false;
    const finish = (result?: XmlAssessment, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () =>
      finish(undefined, new OperationError('DEPENDENCY_FAILURE', 'runtime', 'Validation was interrupted.'));
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new OperationError('DEPENDENCY_FAILURE', 'runtime', 'Local schema validation exceeded its time limit.'),
        ),
      10_000,
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    worker.once('message', (message: XmlAssessment | { failure: true }) => {
      if ('failure' in message)
        finish(
          undefined,
          new OperationError(
            'DEPENDENCY_FAILURE',
            'runtime',
            'The packaged local validator could not initialize. Reinstall the package.',
          ),
        );
      else finish(message);
    });
    worker.once('error', () =>
      finish(undefined, new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The local schema validator failed.')),
    );
    worker.once('exit', () => {
      if (!settled)
        finish(
          undefined,
          new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The local schema validator stopped before completing.'),
        );
    });
  });
}
