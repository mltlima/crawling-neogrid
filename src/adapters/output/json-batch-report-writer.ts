import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  InputOperationalError,
  type BatchReportWriter,
} from '../../application/index.js';
import type { CrawlBatchResult } from '../../domain/index.js';

export class JsonBatchReportWriter implements BatchReportWriter {
  public constructor(
    private readonly createTemporaryId: () => string = randomUUID,
  ) {}

  public async write(
    filePath: string,
    report: CrawlBatchResult,
  ): Promise<void> {
    const directory = dirname(filePath);
    const temporaryPath = join(
      directory,
      `.${basename(filePath)}.${this.createTemporaryId()}.tmp`,
    );
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(
        temporaryPath,
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8',
      );
      await rename(temporaryPath, filePath);
    } catch (error: unknown) {
      throw new InputOperationalError(
        'BATCH_REPORT_WRITE_FAILED',
        `Não foi possível escrever o relatório batch: ${filePath}.`,
        { cause: error },
      );
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
