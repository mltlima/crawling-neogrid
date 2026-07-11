import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  InputOperationalError,
  type ValidationReportWriter,
} from '../../application/index.js';
import type { InputValidationResult } from '../../domain/index.js';

export class JsonValidationReportWriter implements ValidationReportWriter {
  public async write(
    filePath: string,
    report: InputValidationResult,
  ): Promise<void> {
    if (filePath.trim().length === 0) {
      throw new InputOperationalError(
        'REPORT_WRITE_FAILED',
        'O caminho do relatório não foi informado.',
      );
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    } catch (error: unknown) {
      throw new InputOperationalError(
        'REPORT_WRITE_FAILED',
        `Não foi possível escrever o relatório: ${filePath}.`,
        { cause: error },
      );
    }
  }
}
