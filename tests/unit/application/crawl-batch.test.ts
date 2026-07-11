import { describe, expect, it, vi } from 'vitest';

import {
  CrawlBatchUseCase,
  ValidateInputUseCase,
  type BatchLogger,
  type BrowserSessionFactory,
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
  success: boolean,
): CrawlItemResult {
  return {
    originalIndex: record.originalIndex,
    lineNumber: record.lineNumber,
    merchantId: record.merchantId,
    itemId: record.itemId,
    source: success ? 'dom' : 'none',
    pageState: success ? 'PRODUCT_FOUND' : 'UNKNOWN_PAGE_STATE',
    product: {
      title: success ? 'Produto' : null,
      normal_price: success ? 100 : null,
      discount_price: null,
      product_url: record.normalizedUrl,
      image_url: null,
      status: success ? 'success' : 'error',
      error_message: success ? null : 'Falha operacional durante a navegação.',
    },
    durationMs: 1,
    operationalErrorCode: success ? null : 'BROWSER_OPERATIONAL_ERROR',
  };
}

const logger: BatchLogger = {
  info: vi.fn(),
  warn: vi.fn(),
};

const options = {
  inputPath: 'input.txt',
  headless: true,
  timeoutMs: 100,
  settleTimeoutMs: 20,
  maxJsonBytes: 100,
};

describe('CrawlBatchUseCase', () => {
  it('processes duplicates independently, in order and sequentially after failures', async () => {
    const validation = validationFor([
      makeIfoodUrl(),
      makeIfoodUrl(),
      'invalid',
      makeIfoodUrl(MERCHANT_ID, SECOND_ITEM_ID),
    ]);
    let active = 0;
    let maxActive = 0;
    const processedIndexes: number[] = [];
    const collector: CrawlProductCollector = {
      execute: async (_session, record, probeOptions) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        processedIndexes.push(record.originalIndex);
        expect(probeOptions).toMatchObject({
          captureScreenshot: false,
          trace: false,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return {
          result: itemResult(record, record.originalIndex !== 1),
          page: null,
        };
      },
    };
    const close = vi.fn(() => Promise.resolve());
    const session: ManagedBrowserSession = { probe: vi.fn(), close };
    const open = vi.fn(() => Promise.resolve(session));
    const factory: BrowserSessionFactory = { open };
    const batch = await new CrawlBatchUseCase(
      validation,
      factory,
      collector,
      logger,
      () => 'batch-1',
      () => 10,
    ).execute(options);

    expect(processedIndexes).toEqual([0, 1, 3]);
    expect(maxActive).toBe(1);
    expect(open).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(batch.results.map((result) => result.originalIndex)).toEqual([
      0, 1, 3,
    ]);
    expect(batch.summary).toMatchObject({
      totalRecords: 4,
      validRecords: 3,
      invalidRecords: 1,
      selectedRecords: 3,
      processedRecords: 3,
      successfulRecords: 2,
      failedRecords: 1,
      successRatePercent: 66.67,
      recordsByOperationalError: { BROWSER_OPERATIONAL_ERROR: 1 },
    });
    expect(
      batch.results[0] === undefined ? true : 'page' in batch.results[0],
    ).toBe(false);
  });

  it('applies limit only to valid records', async () => {
    const validation = validationFor([
      'invalid',
      makeIfoodUrl(),
      makeIfoodUrl(MERCHANT_ID, SECOND_ITEM_ID),
    ]);
    const execute = vi.fn(
      (_session: ManagedBrowserSession, record: ValidInputRecord) =>
        Promise.resolve({ result: itemResult(record, true), page: null }),
    );
    const session: ManagedBrowserSession = {
      probe: vi.fn(),
      close: () => Promise.resolve(),
    };
    const batch = await new CrawlBatchUseCase(
      validation,
      { open: (): Promise<ManagedBrowserSession> => Promise.resolve(session) },
      { execute },
      logger,
      () => 'limited',
    ).execute({ ...options, limit: 1 });
    expect(execute).toHaveBeenCalledOnce();
    expect(batch.results[0]?.originalIndex).toBe(1);
    expect(batch.summary.selectedRecords).toBe(1);
  });

  it('does not open a browser when there are no valid records', async () => {
    const open = vi.fn(() => Promise.reject(new Error('must not open')));
    const batch = await new CrawlBatchUseCase(
      validationFor(['invalid']),
      { open },
      { execute: vi.fn() },
      logger,
      () => 'empty',
    ).execute(options);
    expect(open).not.toHaveBeenCalled();
    expect(batch.summary).toMatchObject({
      processedRecords: 0,
      successRatePercent: 0,
      invalidRecords: 1,
    });
  });

  it('treats browser opening failure as fatal', async () => {
    const useCase = new CrawlBatchUseCase(
      validationFor([makeIfoodUrl()]),
      {
        open: (): Promise<ManagedBrowserSession> =>
          Promise.reject(new Error('launch failed')),
      },
      { execute: vi.fn() },
      logger,
      () => 'fatal',
    );
    await expect(useCase.execute(options)).rejects.toThrow('launch failed');
  });

  it('closes the session when the loop throws unexpectedly', async () => {
    const close = vi.fn(() => Promise.resolve());
    const session: ManagedBrowserSession = { probe: vi.fn(), close };
    const collector: CrawlProductCollector = {
      execute: (): ReturnType<CrawlProductCollector['execute']> =>
        Promise.reject(new Error('unexpected collector failure')),
    };
    const batch = await new CrawlBatchUseCase(
      validationFor([makeIfoodUrl()]),
      { open: (): Promise<ManagedBrowserSession> => Promise.resolve(session) },
      collector,
      logger,
      () => 'isolated',
    ).execute(options);
    expect(close).toHaveBeenCalledOnce();
    expect(batch.results[0]?.operationalErrorCode).toBe('UNEXPECTED_ERROR');
  });
});
