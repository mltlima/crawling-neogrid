import { describe, expect, it, vi } from 'vitest';

import {
  CrawlBatchUseCase,
  ValidateInputUseCase,
  type BatchBrowserManager,
  type BatchLogger,
  type CrawlProductCollector,
  type InputFileInspector,
  type InputReader,
  type ManagedBrowserSession,
} from '../../../src/application/index.js';
import type {
  CrawlItemResult,
  InputBatch,
  ValidInputRecord,
} from '../../../src/domain/index.js';
import {
  MERCHANT_ID,
  SECOND_ITEM_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

function validationFor(values: readonly unknown[]): ValidateInputUseCase {
  const batch: InputBatch = {
    sourcePath: 'fixtures/input.txt',
    format: 'txt',
    records: values.map((value, originalIndex) => ({
      originalIndex,
      lineNumber: originalIndex + 1,
      value,
    })),
  };
  const reader: InputReader = {
    extension: '.txt',
    format: 'txt',
    read: () => Promise.resolve(batch),
  };
  const inspector: InputFileInspector = {
    assertReadableFile: () => Promise.resolve(),
  };
  return new ValidateInputUseCase([reader], inspector, () => 0);
}

function itemResult(
  record: ValidInputRecord,
  success = true,
  state: CrawlItemResult['pageState'] = success
    ? 'PRODUCT_FOUND'
    : 'PRODUCT_UNAVAILABLE',
): CrawlItemResult {
  const operationalErrorCode = null;
  const attempt = {
    attemptNumber: 1,
    pageState: state,
    httpStatus: 200,
    operationalErrorCode,
    durationMs: 1,
    retryable: false,
    retryScheduled: false,
    retryDelayMs: null,
    browserGeneration: 0,
  } as const;
  return {
    originalIndex: record.originalIndex,
    lineNumber: record.lineNumber,
    merchantId: record.merchantId,
    itemId: record.itemId,
    source: success ? 'dom' : 'none',
    pageState: state,
    product: {
      title: success ? 'Produto' : null,
      normal_price: success ? 100 : null,
      discount_price: null,
      product_url: record.normalizedUrl,
      image_url: null,
      status: success ? 'success' : 'error',
      error_message: success ? null : 'Indisponível.',
    },
    durationMs: 1,
    operationalErrorCode,
    httpStatus: 200,
    attempts: [attempt],
    attemptCount: 1,
    retryCount: 0,
    recoveredAfterRetry: false,
  };
}

function manager(): BatchBrowserManager {
  const session: ManagedBrowserSession = {
    probe: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
    isConnected: () => true,
  };
  return {
    start: vi.fn(() => Promise.resolve()),
    acquire: () => Promise.resolve({ session, generation: 0 }),
    invalidate: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    browserRestarts: 0,
  };
}

const logger: BatchLogger = { info: vi.fn(), warn: vi.fn() };
const options = {
  inputPath: 'input.txt',
  headless: true,
  timeoutMs: 100,
  settleTimeoutMs: 20,
  maxJsonBytes: 100,
  concurrency: 2,
  maxRetries: 0,
  retryDelayMs: 0,
  retryMaxDelayMs: 100,
  retryJitterRatio: 0,
  minRequestIntervalMs: 0,
  circuitBreakerThreshold: 3,
};

describe('CrawlBatchUseCase resilient pool', () => {
  it('bounds concurrency, preserves order and processes duplicates independently', async () => {
    const records = [
      makeIfoodUrl(),
      makeIfoodUrl(),
      makeIfoodUrl(MERCHANT_ID, SECOND_ITEM_ID),
    ];
    let active = 0;
    let maximum = 0;
    const collector: CrawlProductCollector = {
      execute: async (_session, record) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        return { result: itemResult(record), page: null };
      },
    };
    const browser = manager();
    const batch = await new CrawlBatchUseCase(
      validationFor(records),
      { create: (): BatchBrowserManager => browser },
      collector,
      logger,
      () => 'run',
    ).execute(options);
    expect(maximum).toBeLessThanOrEqual(2);
    expect(batch.results.map((item) => item.originalIndex)).toEqual([0, 1, 2]);
    expect(batch.summary).toMatchObject({
      configuredConcurrency: 2,
      maxObservedConcurrency: 2,
      processedRecords: 3,
      totalAttempts: 3,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(browser.start).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('does not start a browser with no valid selected input', async () => {
    const browser = manager();
    const batch = await new CrawlBatchUseCase(
      validationFor(['invalid']),
      { create: (): BatchBrowserManager => browser },
      { execute: vi.fn() },
      logger,
      () => 'empty',
    ).execute(options);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(browser.start).not.toHaveBeenCalled();
    expect(batch.summary.processedRecords).toBe(0);
  });

  it('opens the breaker and records inputs not started', async () => {
    const collector: CrawlProductCollector = {
      execute: (
        _session,
        record,
      ): ReturnType<CrawlProductCollector['execute']> =>
        Promise.resolve({
          result: itemResult(record, false, 'ACCESS_BLOCKED'),
          page: null,
        }),
    };
    const batch = await new CrawlBatchUseCase(
      validationFor([makeIfoodUrl(), makeIfoodUrl(), makeIfoodUrl()]),
      { create: (): BatchBrowserManager => manager() },
      collector,
      logger,
      () => 'blocked',
    ).execute({ ...options, concurrency: 1, circuitBreakerThreshold: 1 });
    expect(batch.summary).toMatchObject({
      circuitBreakerOpened: true,
      skippedRecords: 2,
      processedRecords: 1,
    });
    expect(batch.skippedInputs).toHaveLength(2);
  });

  it('treats initial browser opening failure as fatal', async () => {
    const browser = manager();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(browser.start).mockRejectedValueOnce(new Error('launch failed'));
    const useCase = new CrawlBatchUseCase(
      validationFor([makeIfoodUrl()]),
      { create: (): BatchBrowserManager => browser },
      { execute: vi.fn() },
      logger,
      () => 'fatal',
    );
    await expect(useCase.execute(options)).rejects.toThrow('launch failed');
  });
});
