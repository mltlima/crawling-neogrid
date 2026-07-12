import { basename } from 'node:path';

import {
  calculateSuccessRatePercent,
  crawlBatchResultSchema,
  crawlItemResultSchema,
  type CrawlBatchResult,
  type CrawlItemResult,
  type InputValidationResult,
  type ValidInputRecord,
} from '../../domain/index.js';
import type { BatchLogger } from '../ports/batch-logger.js';
import { RequestPacer } from '../services/request-pacer.js';
import { SafetyCircuitBreaker } from '../services/safety-circuit-breaker.js';
import {
  CrawlProductWithRetryUseCase,
  BrowserRecoveryError,
  type RecoverableBrowser,
} from './crawl-product-with-retry.js';
import type { CrawlProductCollector } from './crawl-product.js';

export interface InputValidationExecutor {
  execute(inputPath: string): Promise<InputValidationResult>;
}
export interface BatchBrowserManager extends RecoverableBrowser {
  start(): Promise<void>;
  close(): Promise<void>;
  readonly browserRestarts: number;
}
export interface BatchBrowserManagerFactory {
  create(headless: boolean): BatchBrowserManager;
}

export interface CrawlBatchOptions {
  readonly inputPath: string;
  readonly limit?: number;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly maxJsonBytes: number;
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly retryJitterRatio: number;
  readonly minRequestIntervalMs: number;
  readonly circuitBreakerThreshold: number;
}

export class CrawlBatchUseCase {
  public constructor(
    private readonly validateInput: InputValidationExecutor,
    private readonly browserManagers: BatchBrowserManagerFactory,
    private readonly crawlProduct: CrawlProductCollector,
    private readonly logger: BatchLogger,
    private readonly createRunId: () => string,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (delayMs: number) => Promise<void> = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
    private readonly random: () => number = Math.random,
  ) {}

  public async execute(options: CrawlBatchOptions): Promise<CrawlBatchResult> {
    const startedAt = this.now();
    const runId = this.createRunId();
    const validation = await this.validateInput.execute(options.inputPath);
    const ordered = [...validation.validRecords].sort(
      (a, b) => a.originalIndex - b.originalIndex,
    );
    const selected =
      options.limit === undefined ? ordered : ordered.slice(0, options.limit);
    const results: CrawlItemResult[] = [];
    const startedIndexes = new Set<number>();
    const breaker = new SafetyCircuitBreaker(options.circuitBreakerThreshold);
    let cursor = 0;
    let active = 0;
    let maxObservedConcurrency = 0;
    let exhaustedRetries = 0;
    const manager = this.browserManagers.create(options.headless);
    const pacer = new RequestPacer(options.minRequestIntervalMs, {
      now: this.now,
      sleep: this.sleep,
    });

    this.logger.info(
      {
        runId,
        selectedRecords: selected.length,
        concurrency: options.concurrency,
      },
      'Batch started',
    );
    if (selected.length > 0) {
      await manager.start();
      try {
        const workerCount = Math.min(options.concurrency, selected.length);
        const workers = Array.from({ length: workerCount }, (_, workerIndex) =>
          this.runWorker(
            workerIndex + 1,
            () => {
              if (breaker.opened || cursor >= selected.length) {
                return null;
              }
              const record = selected[cursor];
              cursor += 1;
              return record ?? null;
            },
            async (record) => {
              startedIndexes.add(record.originalIndex);
              active += 1;
              maxObservedConcurrency = Math.max(maxObservedConcurrency, active);
              try {
                const retried = await new CrawlProductWithRetryUseCase(
                  manager,
                  this.crawlProduct,
                  pacer,
                ).execute(record, {
                  timeoutMs: options.timeoutMs,
                  settleTimeoutMs: options.settleTimeoutMs,
                  trace: false,
                  captureScreenshot: false,
                  maxJsonBytes: options.maxJsonBytes,
                  maxRetryAfterMs: options.retryMaxDelayMs,
                  maxRetries: options.maxRetries,
                  baseDelayMs: options.retryDelayMs,
                  maxDelayMs: options.retryMaxDelayMs,
                  jitterRatio: options.retryJitterRatio,
                  random: this.random,
                  sleep: this.sleep,
                });
                results.push(retried.result);
                for (const attempt of retried.result.attempts) {
                  this.logger.info(
                    {
                      runId,
                      workerId: workerIndex + 1,
                      originalIndex: record.originalIndex,
                      merchantId: record.merchantId,
                      itemId: record.itemId,
                      ...attempt,
                    },
                    attempt.retryScheduled
                      ? 'Retry scheduled'
                      : 'Attempt finished',
                  );
                }
                if (retried.retriesExhausted) {
                  exhaustedRetries += 1;
                }
                const openedNow = breaker.record(
                  retried.result,
                  retried.retriesExhausted,
                );
                if (openedNow) {
                  this.logger.warn(
                    { runId, reason: breaker.reason },
                    'Circuit breaker opened',
                  );
                }
              } catch (error: unknown) {
                if (error instanceof BrowserRecoveryError) {
                  breaker.openForRecoveryFailure();
                  this.logger.warn(
                    {
                      runId,
                      workerId: workerIndex + 1,
                      reason: breaker.reason,
                    },
                    'Browser recovery failed and circuit breaker opened',
                  );
                }
                results.push(this.unexpectedFailure(record));
              } finally {
                active -= 1;
              }
            },
          ),
        );
        await Promise.all(workers);
      } finally {
        await manager.close();
      }
    }

    results.sort((a, b) => a.originalIndex - b.originalIndex);
    const skippedInputs = selected
      .filter((record) => !startedIndexes.has(record.originalIndex))
      .map((record) => ({
        originalIndex: record.originalIndex,
        lineNumber: record.lineNumber,
        merchantId: record.merchantId,
        itemId: record.itemId,
        reason: 'CIRCUIT_BREAKER_OPEN' as const,
      }));
    const successfulRecords = results.filter(
      (r) => r.product.status === 'success',
    ).length;
    const summary = {
      totalRecords: validation.summary.totalRecords,
      validRecords: validation.summary.validRecords,
      invalidRecords: validation.summary.invalidRecords,
      selectedRecords: selected.length,
      processedRecords: results.length,
      successfulRecords,
      failedRecords: results.length - successfulRecords,
      successRatePercent: calculateSuccessRatePercent(
        successfulRecords,
        results.length,
      ),
      recordsByPageState: this.countBy(results, (r) => r.pageState),
      recordsBySource: this.countBy(results, (r) => r.source),
      recordsByOperationalError: this.countBy(
        results.filter((r) => r.operationalErrorCode !== null),
        (r) => r.operationalErrorCode ?? 'UNEXPECTED_ERROR',
      ),
      durationMs: Math.max(0, this.now() - startedAt),
      configuredConcurrency: options.concurrency,
      maxObservedConcurrency,
      totalAttempts: results.reduce((n, r) => n + r.attemptCount, 0),
      retriedRecords: results.filter((r) => r.retryCount > 0).length,
      retriesPerformed: results.reduce((n, r) => n + r.retryCount, 0),
      recoveredRecords: results.filter((r) => r.recoveredAfterRetry).length,
      exhaustedRetries,
      skippedRecords: skippedInputs.length,
      browserRestarts: manager.browserRestarts,
      circuitBreakerOpened: breaker.opened,
      circuitBreakerReason: breaker.reason,
    };
    const batch = crawlBatchResultSchema.parse({
      runId,
      source: {
        fileName: basename(validation.batch.sourcePath),
        format: validation.batch.format,
      },
      invalidRecords: validation.invalidRecords,
      skippedInputs,
      results,
      summary,
    });
    if (skippedInputs.length > 0) {
      this.logger.warn(
        { runId, skippedRecords: skippedInputs.length },
        'Unstarted items skipped',
      );
    }
    this.logger.info({ runId, ...summary }, 'Batch finished');
    return batch;
  }

  private async runWorker(
    workerId: number,
    next: () => ValidInputRecord | null,
    process: (record: ValidInputRecord) => Promise<void>,
  ): Promise<void> {
    this.logger.info({ workerId }, 'Worker started');
    for (;;) {
      const record = next();
      if (record === null) {
        break;
      }
      await process(record);
    }
    this.logger.info({ workerId }, 'Worker finished');
  }

  private unexpectedFailure(record: ValidInputRecord): CrawlItemResult {
    const attempt = {
      attemptNumber: 1,
      pageState: 'UNKNOWN_PAGE_STATE' as const,
      httpStatus: null,
      operationalErrorCode: 'UNEXPECTED_ERROR' as const,
      durationMs: 0,
      retryable: false,
      retryScheduled: false,
      retryDelayMs: null,
      browserGeneration: 0,
    };
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
      operationalErrorCode: 'UNEXPECTED_ERROR',
      httpStatus: null,
      attempts: [attempt],
      attemptCount: 1,
      retryCount: 0,
      recoveredAfterRetry: false,
    });
  }

  private countBy<T>(
    values: readonly T[],
    keyOf: (value: T) => string,
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const value of values) {
      const key = keyOf(value);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }
}
