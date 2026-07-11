import { basename } from 'node:path';

import {
  calculateSuccessRatePercent,
  crawlBatchResultSchema,
  crawlItemResultSchema,
  type CrawlBatchResult,
  type CrawlItemResult,
  type CrawlOperationalErrorCode,
  type InputValidationResult,
  type ValidInputRecord,
} from '../../domain/index.js';
import type { BatchLogger } from '../ports/batch-logger.js';
import type { BrowserSessionFactory } from '../ports/browser-session.js';
import type { CrawlProductCollector } from './crawl-product.js';

export interface InputValidationExecutor {
  execute(inputPath: string): Promise<InputValidationResult>;
}

export interface CrawlBatchOptions {
  readonly inputPath: string;
  readonly limit?: number;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly maxJsonBytes: number;
}

export class CrawlBatchUseCase {
  public constructor(
    private readonly validateInput: InputValidationExecutor,
    private readonly browserFactory: BrowserSessionFactory,
    private readonly crawlProduct: CrawlProductCollector,
    private readonly logger: BatchLogger,
    private readonly createRunId: () => string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public async execute(options: CrawlBatchOptions): Promise<CrawlBatchResult> {
    const startedAt = this.now();
    const runId = this.createRunId();
    const validation = await this.validateInput.execute(options.inputPath);
    const ordered = [...validation.validRecords].sort(
      (left, right) => left.originalIndex - right.originalIndex,
    );
    const selected =
      options.limit === undefined ? ordered : ordered.slice(0, options.limit);
    const results: CrawlItemResult[] = [];

    this.logger.info(
      { runId, selectedRecords: selected.length },
      'Batch started',
    );

    if (selected.length > 0) {
      const session = await this.browserFactory.open(options.headless);
      try {
        for (const record of selected) {
          this.logger.info(
            this.itemLogFields(runId, record),
            'Batch item started',
          );
          let result: CrawlItemResult;
          try {
            const collected = await this.crawlProduct.execute(session, record, {
              timeoutMs: options.timeoutMs,
              settleTimeoutMs: options.settleTimeoutMs,
              trace: false,
              captureScreenshot: false,
              maxJsonBytes: options.maxJsonBytes,
            });
            result = collected.result;
          } catch {
            result = this.unexpectedFailure(record);
          }
          results.push(result);
          const fields = {
            ...this.itemLogFields(runId, record),
            pageState: result.pageState,
            source: result.source,
            status: result.product.status,
            durationMs: result.durationMs,
          };
          if (result.operationalErrorCode === null) {
            this.logger.info(fields, 'Batch item finished');
          } else {
            this.logger.warn(
              { ...fields, operationalErrorCode: result.operationalErrorCode },
              'Batch item failed in isolation',
            );
          }
        }
      } finally {
        await session.close();
      }
    }

    const successfulRecords = results.filter(
      (result) => result.product.status === 'success',
    ).length;
    const failedRecords = results.length - successfulRecords;
    const summary = {
      totalRecords: validation.summary.totalRecords,
      validRecords: validation.summary.validRecords,
      invalidRecords: validation.summary.invalidRecords,
      selectedRecords: selected.length,
      processedRecords: results.length,
      successfulRecords,
      failedRecords,
      successRatePercent: calculateSuccessRatePercent(
        successfulRecords,
        results.length,
      ),
      recordsByPageState: this.countBy(results, (result) => result.pageState),
      recordsBySource: this.countBy(results, (result) => result.source),
      recordsByOperationalError: this.countBy(
        results.filter((result) => result.operationalErrorCode !== null),
        (result) => result.operationalErrorCode ?? 'UNEXPECTED_ERROR',
      ),
      durationMs: Math.max(0, this.now() - startedAt),
    };
    const batch = crawlBatchResultSchema.parse({
      runId,
      source: {
        fileName: basename(validation.batch.sourcePath),
        format: validation.batch.format,
      },
      invalidRecords: validation.invalidRecords,
      results,
      summary,
    });
    this.logger.info({ runId, ...summary }, 'Batch finished');
    return batch;
  }

  private itemLogFields(
    runId: string,
    record: ValidInputRecord,
  ): Readonly<Record<string, unknown>> {
    return {
      runId,
      originalIndex: record.originalIndex,
      merchantId: record.merchantId,
      itemId: record.itemId,
    };
  }

  private unexpectedFailure(record: ValidInputRecord): CrawlItemResult {
    return crawlItemResultSchema.parse({
      originalIndex: record.originalIndex,
      lineNumber: record.lineNumber,
      merchantId: record.merchantId,
      itemId: record.itemId,
      source: 'none',
      pageState: 'UNKNOWN_PAGE_STATE',
      product: {
        title: null,
        normal_price: null,
        discount_price: null,
        product_url: record.normalizedUrl,
        image_url: null,
        status: 'error',
        error_message: 'Falha inesperada ao processar o item.',
      },
      durationMs: 0,
      operationalErrorCode:
        'UNEXPECTED_ERROR' satisfies CrawlOperationalErrorCode,
    });
  }

  private countBy<T>(
    values: readonly T[],
    keyOf: (value: T) => string,
  ): Record<string, number> {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = keyOf(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Object.fromEntries(counts);
  }
}
