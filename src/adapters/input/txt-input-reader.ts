import type { InputReader } from '../../application/index.js';
import { inputBatchSchema, type InputBatch } from '../../domain/index.js';
import { readUtf8File } from './shared.js';

export class TxtInputReader implements InputReader {
  public readonly format = 'txt' as const;
  public readonly extension = '.txt' as const;

  public async read(filePath: string): Promise<InputBatch> {
    const content = await readUtf8File(filePath);
    const lines = content.split(/\r?\n/);

    return inputBatchSchema.parse({
      sourcePath: filePath,
      format: this.format,
      records: lines.map((value, originalIndex) => ({
        originalIndex,
        lineNumber: originalIndex + 1,
        value,
      })),
    });
  }
}
