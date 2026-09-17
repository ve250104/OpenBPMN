#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultPrefix, doctor, setup, type ManagementResult } from './installation.js';
import type { Host } from './installation-hosts.js';
import { recover, uninstall, update } from './installation-lifecycle.js';

const HELP = `BPMN Weave installation management (separate from the modeling CLI)
  setup --bundle <extracted-platform-directory> --host codex|claude|copilot
  doctor
  update --bundle <extracted-platform-directory>
  uninstall
Options: --prefix <directory> --project <directory> --browser-executable <absolute-path>
         --output <example-directory> --json --non-interactive --recover
Setup registers only the selected Modeling Skill and adds the owned bin directory
to user shell startup files (or the Windows user PATH). Restart the agent afterward.
No system Node/npm is required. No management command downloads anything implicitly.
Exit: 0 requested local checks passed; 1 failed or incomplete; 3 invalid usage.
Actual Host Agent sessions and full release qualification are separate checks.
`;
let json = process.argv.includes('--json');
let operation = 'setup';
let usage = false;
const controller = new AbortController();
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const abort = () => controller.abort(new Error('Installation management was interrupted.'));
for (const signal of signals) process.once(signal, abort);
try {
  const parsed = (() => {
    try {
      return parseArgs({
        allowPositionals: true,
        tokens: true,
        options: {
          bundle: { type: 'string' },
          prefix: { type: 'string' },
          host: { type: 'string' },
          project: { type: 'string' },
          'browser-executable': { type: 'string' },
          output: { type: 'string' },
          json: { type: 'boolean' },
          'non-interactive': { type: 'boolean' },
          recover: { type: 'boolean' },
          help: { type: 'boolean' },
        },
      });
    } catch {
      usage = true;
      throw new Error('Invalid management options. Run bpmn-weave-manage --help.');
    }
  })();
  const { values, positionals } = parsed;
  const seen = new Map<string, string | boolean>();
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    const value = token.value ?? true;
    if (
      seen.has(token.name) &&
      !(
        token.name === 'prefix' &&
        typeof value === 'string' &&
        resolve(String(seen.get(token.name))) === resolve(value)
      )
    ) {
      usage = true;
      throw new Error('Conflicting or repeated management option: --' + token.name);
    }
    seen.set(token.name, value);
  }
  json = Boolean(values.json);
  if (values.help) process.stdout.write(HELP);
  else {
    operation = positionals[0] ?? 'setup';
    if (positionals.length > 1 || !['setup', 'doctor', 'update', 'uninstall'].includes(operation)) {
      usage = true;
      throw new Error('Choose setup, doctor, update, or uninstall. See bpmn-weave-manage --help.');
    }
    const allowed: Record<string, string[]> = {
      setup: ['bundle', 'host', 'project', 'browser-executable', 'output', 'recover'],
      doctor: ['browser-executable'],
      update: ['bundle', 'browser-executable', 'output', 'recover'],
      uninstall: ['recover'],
    };
    for (const name of seen.keys())
      if (!['prefix', 'json', 'non-interactive'].includes(name) && !allowed[operation]!.includes(name)) {
        usage = true;
        throw new Error('--' + name + ' is not supported by ' + operation + '.');
      }
    for (const value of Object.values(values))
      if (value === '') {
        usage = true;
        throw new Error('Management option values must not be empty.');
      }
    if (values['browser-executable'] && !isAbsolute(values['browser-executable'])) {
      usage = true;
      throw new Error('--browser-executable must be an absolute path.');
    }
    if (
      operation === 'setup' &&
      !values.recover &&
      !values.host &&
      !values['non-interactive'] &&
      process.stdin.isTTY &&
      !json
    ) {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        values.host = (await prompt.question('Existing Host Agent (codex / claude / copilot): ')).trim().toLowerCase();
      } finally {
        prompt.close();
      }
    }
    if (values.host && !['codex', 'claude', 'copilot'].includes(values.host)) {
      usage = true;
      throw new Error('Host must be codex, claude, or copilot.');
    }
    if (!values.recover && operation === 'setup' && !values.host) {
      usage = true;
      throw new Error('Select your existing Host Agent with --host codex, claude, or copilot.');
    }
    if (!values.recover && ['setup', 'update'].includes(operation) && !values.bundle) {
      usage = true;
      throw new Error('Select an extracted platform archive with --bundle.');
    }
    const options = {
      prefix: resolve(values.prefix ?? defaultPrefix()),
      bundle: values.bundle,
      host: values.host as Host | undefined,
      project: values.project,
      browser: values['browser-executable'],
      output: values.output,
      recover: values.recover,
      signal: controller.signal,
    };
    const result = await (operation === 'setup'
      ? options.recover
        ? recover(options)
        : setup(options)
      : operation === 'doctor'
        ? doctor(options)
        : operation === 'update'
          ? update(options)
          : uninstall(options));
    display(result);
    process.exitCode = result.status === 'ready' || result.status === 'removed' ? 0 : 1;
  }
} catch (error) {
  display({
    schemaVersion: 1,
    operation,
    status: 'failed',
    message: error instanceof Error ? error.message : 'Installation management failed.',
    checks: [],
    nextSteps: ['Run bpmn-weave-manage --help for supported operations.'],
  });
  process.exitCode = usage ? 3 : 1;
} finally {
  for (const signal of signals) process.removeListener(signal, abort);
}

function display(result: ManagementResult): void {
  process.stdout.write(
    json
      ? JSON.stringify(result) + '\n'
      : [
          result.message,
          ...(result.prefix ? ['Installation: ' + result.prefix] : []),
          ...result.checks.map((check) => `${check.status}: ${check.name} — ${check.message}`),
          ...(result.artifacts ?? []).map((path) => 'Output: ' + path),
          ...(result.retained ?? []).map((path) => 'Retained: ' + path),
          ...result.nextSteps,
        ].join('\n') + '\n',
  );
}
