import { readFileSync } from 'node:fs';

export const TOOL_VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
export const PROFILE_VERSION = '1.0.0';
export const FORMAT_VERSION = '1.0.0';
export const INPUT_BYTES = 5 * 1024 * 1024;
