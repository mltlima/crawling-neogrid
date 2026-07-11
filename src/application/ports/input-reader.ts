import type { InputBatch, InputFormat } from '../../domain/index.js';

export interface InputReader {
  readonly format: InputFormat;
  readonly extension: `.${InputFormat}`;
  read(filePath: string): Promise<InputBatch>;
}

export interface InputFileInspector {
  assertReadableFile(filePath: string): Promise<void>;
}
