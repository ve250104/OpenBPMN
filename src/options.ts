import { parseArgs } from 'node:util';
import { isAbsolute } from 'node:path';
import type { Command } from './model.js';
import { OperationError } from './diagnostics.js';

export const commands: Command[] = ['generate', 'validate', 'render', 'capabilities'];
export const HELP = `BPMN Weave — local BPMN process modeling

Requires Node.js 24.x. Generation/rendering also require an installed Chrome or Edge.
No browser is downloaded. No account, server, or network is used by the CLI.

  bpmn-weave generate --input <request.json|handoff.openbpmn.json|-> --output <stem>
    [--export auto|clean|snapshot] [--replace] [--handoff <sibling.openbpmn.json>]
    [--expert-invalid] [--browser-executable <absolute-path>]
  bpmn-weave validate --input <process.bpmn> [--compatibility <profile-id>]
  bpmn-weave render --input <process.bpmn> --output <preview.svg>
    [--replace] [--browser-executable <absolute-path>]
  bpmn-weave capabilities [--browser-executable <absolute-path>]

Common: --json (default), --human, --debug (technical stderr only), --help, --version.
generate creates <stem>.bpmn, <stem>.svg, and <stem>.quality.json.
Input '-' reads UTF-8 JSON from stdin. Output directories must already exist.
--replace carries explicit authority to replace the named files, never inferred.
--handoff is explicit opt-in; its destination must share the bundle directory.
--expert-invalid requires --export snapshot; uses distinct .invalid.* names.
Snapshots may retain unresolved evidence/profile findings. Human status is never set.
validate reads only; render uses supplied DI without repairing or rewriting BPMN.
Compatibility: sap-signavio-process-manager, celonis-analysis-conformance,
celonis-process-management. Local fit is not verified tenant compatibility.

Exit: 0 success; 1 internal/dependency; 2 model/profile or invalid expert output;
3 usage/input; 4 filesystem safety. Always inspect the completion signal.
`;
const options = {
  input: { type: 'string' },
  output: { type: 'string' },
  export: { type: 'string' },
  handoff: { type: 'string' },
  compatibility: { type: 'string' },
  'browser-executable': { type: 'string' },
  replace: { type: 'boolean' },
  'expert-invalid': { type: 'boolean' },
  json: { type: 'boolean' },
  human: { type: 'boolean' },
  debug: { type: 'boolean' },
  help: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;
export type ParsedOptions = ReturnType<typeof readOptions>;

export function readOptions(args: string[]) {
  const parsed = (() => {
    try {
      return parseArgs({ args, options, allowPositionals: true, strict: true, tokens: true });
    } catch {
      throw new OperationError(
        'INPUT_SCHEMA',
        'input',
        'Command options are invalid. Use --help for the supported options.',
        3,
        'refused',
      );
    }
  })();
  const { values, positionals, tokens } = parsed;
  const names = tokens.filter((t) => t.kind === 'option').map((t) => t.name);
  const bad = () => {
    throw new OperationError(
      'INPUT_SCHEMA',
      'input',
      'This combination of command options is invalid. Use --help.',
      3,
      'refused',
    );
  };
  if (new Set(names).size !== names.length || (values.human && values.json)) bad();
  if (Object.values(values).some((value) => typeof value === 'string' && value.length === 0)) bad();
  if (values['browser-executable'] !== undefined && !isAbsolute(values['browser-executable'])) bad();
  if (values.help || values.version) {
    if (
      names.length !== 1 ||
      positionals.length > 1 ||
      (positionals[0] && !commands.includes(positionals[0] as Command))
    )
      bad();
    return { command: (positionals[0] ?? 'capabilities') as Command, values };
  }
  if (positionals.length !== 1 || !commands.includes(positionals[0] as Command)) bad();
  const command = positionals[0] as Command;
  const common = ['json', 'human', 'debug'];
  const allowed = {
    generate: ['input', 'output', 'export', 'replace', 'handoff', 'expert-invalid', 'browser-executable'],
    validate: ['input', 'compatibility'],
    render: ['input', 'output', 'replace', 'browser-executable'],
    capabilities: ['browser-executable'],
  }[command];
  if (names.some((name) => !common.includes(name) && !allowed.includes(name))) bad();
  if (command !== 'capabilities' && !values.input) bad();
  if (['generate', 'render'].includes(command) && !values.output) bad();
  if (command === 'generate' && values.export && !['auto', 'clean', 'snapshot'].includes(values.export)) bad();
  if (values['expert-invalid'] && values.export !== 'snapshot') bad();
  if (
    values.compatibility &&
    !['sap-signavio-process-manager', 'celonis-analysis-conformance', 'celonis-process-management'].includes(
      values.compatibility,
    )
  )
    bad();
  if (command !== 'generate' && values.input === '-') bad();
  return { command, values };
}
