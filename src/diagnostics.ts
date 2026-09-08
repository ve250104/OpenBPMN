export type Category =
  | 'input'
  | 'xml'
  | 'semantic'
  | 'profile'
  | 'diagram'
  | 'evidence'
  | 'consulting'
  | 'runtime'
  | 'filesystem';
export type ResultStatus = 'completed' | 'refused' | 'failed';

export interface FindingInput {
  code: string;
  category: Category;
  message: string;
  remediation?: string;
  elementRefs?: string[];
  evidenceRefs?: string[];
  inputPointer?: string;
  severity?: 'error' | 'warning' | 'info';
  blocksClean?: boolean;
  instance?: string;
}

export class OperationError extends Error {
  constructor(
    public readonly code: string,
    public readonly category: Category,
    message: string,
    public readonly exitCode = 1,
    public readonly status: ResultStatus = 'failed',
    public readonly findings?: FindingInput[],
  ) {
    super(message);
    this.name = 'OperationError';
  }
}
