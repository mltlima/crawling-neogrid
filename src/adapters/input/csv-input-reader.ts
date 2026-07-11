import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import { InputOperationalError, type InputReader } from '../../application/index.js';
import { inputBatchSchema, type InputBatch } from '../../domain/index.js';
import { assertRecordsExist, readUtf8File } from './shared.js';

const parsedCsvRecordSchema = z.object({
  record: z.array(z.string()),
  info: z.object({ lines: z.number().int().positive() }).passthrough(),
});

export class CsvInputReader implements InputReader {
  public readonly format = 'csv' as const;
  public readonly extension = '.csv' as const;

  public async read(filePath: string): Promise<InputBatch> {
    const content = await readUtf8File(filePath);
    let parsed: unknown;

    try {
      parsed = parse(content, {
        bom: true,
        info: true,
        relax_column_count: true,
        skip_empty_lines: false,
      }) as unknown;
    } catch (error: unknown) {
      throw new InputOperationalError(
        'FILE_UNREADABLE',
        `Não foi possível interpretar o CSV: ${filePath}.`,
        { cause: error },
      );
    }

    const rows = z.array(parsedCsvRecordSchema).parse(parsed);
    const header = rows[0]?.record;
    if (header === undefined) {
      throw new InputOperationalError(
        'FILE_EMPTY',
        `O arquivo CSV está vazio: ${filePath}.`,
      );
    }

    const urlColumnIndex = header.findIndex(
      (column) => column.trim().toLowerCase() === 'url',
    );
    if (urlColumnIndex === -1) {
      throw new InputOperationalError(
        'MISSING_URL_COLUMN',
        'O arquivo CSV deve possuir uma coluna url.',
      );
    }

    const dataRows = rows.slice(1);
    assertRecordsExist(dataRows.length, filePath);

    return inputBatchSchema.parse({
      sourcePath: filePath,
      format: this.format,
      records: dataRows.map((row, originalIndex) => ({
        originalIndex,
        lineNumber: row.info.lines,
        value: row.record[urlColumnIndex] ?? '',
      })),
    });
  }
}
