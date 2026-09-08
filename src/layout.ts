import { Worker } from 'node:worker_threads';
import { OperationError, type Category, type ResultStatus, type FindingInput } from './diagnostics.js';
import type { ProcessRequest } from './model.js';

type LayoutResult =
  | { ok: true; xml: string }
  | {
      ok: false;
      error: {
        code: string;
        category: Category;
        message: string;
        exitCode: number;
        status: ResultStatus;
        findings?: FindingInput[];
      };
    };

/** Layout runs off the CLI thread so interruption and the time limit remain enforceable. */
export async function layoutXml(
  xml: string,
  request: ProcessRequest,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  if (options.signal?.aborted) throw interrupted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layout-worker.js', import.meta.url), {
      workerData: { xml, request },
      stdout: true,
      stderr: true,
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
    });
    // Upstream diagnostics can contain model text. Only controlled messages
    // cross this adapter boundary, never worker console output.
    worker.stdout.on('data', () => {});
    worker.stderr.on('data', () => {});
    let settled = false;
    const finish = (error?: OperationError, result?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      void worker.terminate().then(
        () => (error ? reject(error) : resolve(result!)),
        () =>
          reject(
            error ?? new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The layout worker could not be stopped.'),
          ),
      );
    };
    const abort = () => finish(interrupted());
    const timeout = setTimeout(
      () =>
        finish(new OperationError('DEPENDENCY_FAILURE', 'runtime', 'Layout exceeded the 30 second processing limit.')),
      30_000,
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    worker.on('message', (message: LayoutResult) => {
      if (message.ok) finish(undefined, message.xml);
      else
        finish(
          new OperationError(
            message.error.code,
            message.error.category,
            message.error.message,
            message.error.exitCode,
            message.error.status,
            message.error.findings,
          ),
        );
    });
    worker.on('error', () =>
      finish(new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The local layout worker could not complete.')),
    );
    worker.on('exit', () => {
      if (!settled)
        finish(
          new OperationError(
            'DEPENDENCY_FAILURE',
            'runtime',
            'The local layout worker ended before returning a diagram.',
          ),
        );
    });
  });
}

function interrupted(): OperationError {
  return new OperationError('DEPENDENCY_FAILURE', 'runtime', 'Diagram layout was interrupted.');
}
