import { describe, expect, it, vi } from 'vitest';

import {
  CrawlProductWithRetryUseCase,
  RequestPacer,
  type CrawlProductCollector,
  type ManagedBrowserSession,
  type RecoverableBrowser,
} from '../../../src/application/index.js';
import type {
  CrawlItemResult,
  PageProbe,
  ValidInputRecord,
} from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

const input: ValidInputRecord = {
  originalIndex: 0,
  lineNumber: 1,
  originalUrl: makeIfoodUrl(),
  normalizedUrl: makeIfoodUrl(),
  locality: 'local',
  storeSlug: 'loja',
  storeBaseUrl: `https://www.ifood.com.br/delivery/local/loja/${MERCHANT_ID}`,
  merchantId: MERCHANT_ID,
  itemId: ITEM_ID,
};
const session: ManagedBrowserSession = {
  probe: vi.fn(),
  close: vi.fn(() => Promise.resolve()),
  isConnected: () => true,
};
const page: PageProbe = {
  finalUrl: makeIfoodUrl(),
  httpStatus: 503,
  retryAfterMs: 30,
  html: '',
  responses: [],
  consoleErrors: [],
  pageErrors: [],
  dom: {
    title: null,
    normalPrice: null,
    discountPrice: null,
    imageUrl: null,
    bodyText: '',
  },
  timedOut: false,
  screenshot: new Uint8Array(),
  trace: null,
};

function result(success: boolean): CrawlItemResult {
  const pageState = success ? 'PRODUCT_FOUND' : 'HTTP_ERROR';
  const httpStatus = success ? 200 : 503;
  const attempt = {
    attemptNumber: 1,
    pageState,
    httpStatus,
    operationalErrorCode: null,
    durationMs: 1,
    retryable: false,
    retryScheduled: false,
    retryDelayMs: null,
    browserGeneration: 0,
  } as const;
  return {
    originalIndex: 0,
    lineNumber: 1,
    merchantId: MERCHANT_ID,
    itemId: ITEM_ID,
    source: success ? 'dom' : 'none',
    pageState,
    product: {
      title: success ? 'Produto' : null,
      normal_price: success ? 100 : null,
      discount_price: null,
      product_url: makeIfoodUrl(),
      image_url: null,
      status: success ? 'success' : 'error',
      error_message: success ? null : 'HTTP 503.',
    },
    durationMs: 1,
    operationalErrorCode: null,
    httpStatus,
    attempts: [attempt],
    attemptCount: 1,
    retryCount: 0,
    recoveredAfterRetry: false,
  };
}

const options = {
  timeoutMs: 100,
  settleTimeoutMs: 10,
  trace: false,
  captureScreenshot: false,
  maxJsonBytes: 100,
  maxRetryAfterMs: 100,
  maxRetries: 3,
  baseDelayMs: 10,
  maxDelayMs: 100,
  jitterRatio: 0,
  random: (): number => 0,
  sleep: vi.fn(() => Promise.resolve()),
};

describe('CrawlProductWithRetryUseCase', () => {
  it('retries transient failures in the same slot and records recovery', async () => {
    const execute = vi
      .fn<CrawlProductCollector['execute']>()
      .mockResolvedValueOnce({ result: result(false), page })
      .mockResolvedValueOnce({ result: result(false), page })
      .mockResolvedValueOnce({
        result: result(true),
        page: { ...page, httpStatus: 200, retryAfterMs: null },
      });
    const browser: RecoverableBrowser = {
      acquire: () => Promise.resolve({ session, generation: 0 }),
      invalidate: vi.fn(() => Promise.resolve()),
    };
    const retried = await new CrawlProductWithRetryUseCase(
      browser,
      { execute },
      new RequestPacer(0, {
        now: (): number => 0,
        sleep: (): Promise<void> => Promise.resolve(),
      }),
    ).execute(input, options);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(retried.result).toMatchObject({
      attemptCount: 3,
      retryCount: 2,
      recoveredAfterRetry: true,
    });
    expect(
      retried.result.attempts.map((attempt) => attempt.retryScheduled),
    ).toEqual([true, true, false]);
  });

  it('stops exactly at maxRetries and preserves the final cause', async () => {
    const execute = vi
      .fn<CrawlProductCollector['execute']>()
      .mockResolvedValue({ result: result(false), page });
    const browser: RecoverableBrowser = {
      acquire: () => Promise.resolve({ session, generation: 0 }),
      invalidate: vi.fn(() => Promise.resolve()),
    };
    const retried = await new CrawlProductWithRetryUseCase(
      browser,
      { execute },
      new RequestPacer(0, {
        now: (): number => 0,
        sleep: (): Promise<void> => Promise.resolve(),
      }),
    ).execute(input, { ...options, maxRetries: 1 });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(retried.retriesExhausted).toBe(true);
    expect(retried.result).toMatchObject({
      pageState: 'HTTP_ERROR',
      httpStatus: 503,
      attemptCount: 2,
    });
  });
});
