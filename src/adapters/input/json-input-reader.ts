import type { InputReader } from '../../application/index.js';
import { inputBatchSchema, type InputBatch } from '../../domain/index.js';
import { InputOperationalError } from '../../application/index.js';
import { assertRecordsExist, readUtf8File } from './shared.js';

function readJsonUrl(value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'url')
  ) {
    return (value as Readonly<{ url?: unknown }>).url;
  }

  return value;
}

export class JsonInputReader implements InputReader {
  public readonly format = 'json' as const;
  public readonly extension = '.json' as const;

  public async read(filePath: string): Promise<InputBatch> {
    const content = await readUtf8File(filePath);
    let parsed: unknown;

    try {
      parsed = JSON.parse(content) as unknown;
    } catch (error: unknown) {
      throw new InputOperationalError(
        'INVALID_JSON',
        `O arquivo não contém JSON válido: ${filePath}.`,
        { cause: error },
      );
    }

    if (!Array.isArray(parsed)) {
      throw new InputOperationalError(
        'INVALID_JSON',
        'A raiz do JSON deve ser um array de strings ou objetos com a propriedade url.',
      );
    }

    assertRecordsExist(parsed.length, filePath);

    return inputBatchSchema.parse({
      sourcePath: filePath,
      format: this.format,
      records: parsed.map((value, originalIndex) => ({
        originalIndex,
        lineNumber: null,
        value: readJsonUrl(value),
      })),
    });
  }
}
