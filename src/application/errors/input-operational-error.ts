export type InputOperationalErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_EMPTY'
  | 'FILE_UNREADABLE'
  | 'UNSUPPORTED_EXTENSION'
  | 'MISSING_URL_COLUMN'
  | 'INVALID_JSON'
  | 'REPORT_WRITE_FAILED'
  | 'PROBE_FAILED'
  | 'ARTIFACT_WRITE_FAILED'
  | 'BATCH_REPORT_WRITE_FAILED'
  | 'CHECKPOINT_FAILED'
  | 'CHECKPOINT_LOCKED'
  | 'EXPORT_FAILED';

export class InputOperationalError extends Error {
  public readonly code: InputOperationalErrorCode;

  public constructor(
    code: InputOperationalErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'InputOperationalError';
    this.code = code;
  }
}
