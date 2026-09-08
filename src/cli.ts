#!/usr/bin/env node
import { TOOL_VERSION } from './version.js';
import { commands, HELP, readOptions } from './options.js';
import { OperationError } from './diagnostics.js';
import { addFindings, createReport, resultFor, setCheck } from './report.js';
import type { Command } from './model.js';
import { runCommand } from './core.js';
import { validateProtocol } from './input.js';

const args = process.argv.slice(2);
try {
  const options = readOptions(args);
  if (options.values.version) process.stdout.write(TOOL_VERSION + '\n');
  else if (options.values.help) process.stdout.write(HELP);
  else {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
    for (const signal of signals) process.once(signal, abort);
    try {
      const result = await runCommand(options, { signal: controller.signal });
      if (!validateProtocol('result', result))
        throw new OperationError(
          'INTERNAL_FAILURE',
          'runtime',
          'The operation returned an inconsistent result. Inspect the named destinations before retrying.',
        );
      if (options.values.human) {
        process.stdout.write(
          [
            result.signal,
            ...result.artifacts.map((a) => a.state + ' ' + a.kind + ': ' + a.path),
            ...result.report.findings.map((f) => f.code + ': ' + f.message),
          ].join('\n') + '\n',
        );
      } else process.stdout.write(JSON.stringify(result) + '\n');
      if (options.values.debug)
        process.stderr.write(
          'command=' + result.command + ' signal=' + result.signal + ' exit=' + result.exitCode + '\n',
        );
      process.exitCode = result.exitCode;
    } finally {
      for (const signal of signals) process.removeListener(signal, abort);
    }
  }
} catch (error) {
  const command = commands.includes(args[0] as Command) ? (args[0] as Command) : 'capabilities';
  const report = createReport(command === 'generate' ? 'auto' : 'none');
  const known =
    error instanceof OperationError
      ? error
      : new OperationError('INTERNAL_FAILURE', 'runtime', 'The operation failed unexpectedly.');
  const findings = addFindings(report, [{ code: known.code, category: known.category, message: known.message }]);
  if (known.category === 'input') setCheck(report, 'input', 'failed', findings);
  const result = resultFor(command, report);
  result.exitCode = known.exitCode as 1 | 2 | 3 | 4;
  result.status = known.status;
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.exitCode;
}
