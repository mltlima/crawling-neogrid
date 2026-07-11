import { describe, expect, it, vi } from 'vitest';

import {
  CrawlProductUseCase,
  type ManagedBrowserSession,
  type ProductExtractionPipeline,
} from '../../../src/application/index.js';
import type {
  PageProbe,
  PageState,
  ValidInputRecord,
} from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

const input: ValidInputRecord = {
  originalIndex: 4,
  lineNumber: 6,
  originalUrl: makeIfoodUrl(),
  normalizedUrl: makeIfoodUrl(),
  storeBaseUrl: makeIfoodUrl().split('?')[0] ?? '',
  locality: 'local',
  storeSlug: 'store',
  merchantId: MERCHANT_ID,
  itemId: ITEM_ID,
};

const page: PageProbe = {
  finalUrl: makeIfoodUrl(),
  httpStatus: 200,
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

const options = {
  timeoutMs: 100,
  settleTimeoutMs: 20,
  trace: false,
  captureScreenshot: false,
  maxJsonBytes: 100,
};

describe('CrawlProductUseCase', () => {
  it.each(['network', 'embedded-data', 'dom'] as const)(
    'returns a successful %s result',
    async (source) => {
      const session: ManagedBrowserSession = {
        probe: () => Promise.resolve(page),
        close: () => Promise.resolve(),
      };
      const extractor: ProductExtractionPipeline = {
        extract: () =>
          Promise.resolve({
            source,
            product: {
              title: 'Produto',
              normal_price: 100,
              discount_price: null,
              product_url: input.normalizedUrl,
              image_url: null,
              status: 'success',
              error_message: null,
            },
          }),
      };
      const collected = await new CrawlProductUseCase(
        extractor,
        () => 'PRODUCT_FOUND',
        () => 10,
      ).execute(session, input, options);
      expect(collected.result).toMatchObject({
        source,
        pageState: 'PRODUCT_FOUND',
        operationalErrorCode: null,
        product: { status: 'success' },
      });
      expect(collected.page).toBe(page);
    },
  );

  it.each([
    'ACCESS_BLOCKED',
    'RATE_LIMITED',
    'PRODUCT_UNAVAILABLE',
    'LOCATION_REQUIRED',
  ] as const)('produces a coherent error for %s', async (state: PageState) => {
    const session: ManagedBrowserSession = {
      probe: () => Promise.resolve(page),
      close: () => Promise.resolve(),
    };
    const collected = await new CrawlProductUseCase(
      {
        extract: (): ReturnType<ProductExtractionPipeline['extract']> =>
          Promise.resolve({ source: 'none', product: null }),
      },
      (): PageState => state,
      () => 10,
    ).execute(session, input, options);
    expect(collected.result).toMatchObject({
      pageState: state,
      operationalErrorCode: null,
      product: { status: 'error' },
    });
    expect(collected.result.product.error_message).toContain(state);
  });

  it('maps browser, extraction and unexpected failures to stable codes', async () => {
    const browserFailure: ManagedBrowserSession = {
      probe: () => Promise.reject(new Error('secret third-party error')),
      close: () => Promise.resolve(),
    };
    const extractorFailure: ProductExtractionPipeline = {
      extract: () => Promise.reject(new Error('secret parser error')),
    };
    const normalSession: ManagedBrowserSession = {
      probe: () => Promise.resolve(page),
      close: () => Promise.resolve(),
    };
    const browserResult = await new CrawlProductUseCase(
      { extract: vi.fn() },
      () => 'UNKNOWN_PAGE_STATE',
    ).execute(browserFailure, input, options);
    const extractionResult = await new CrawlProductUseCase(
      extractorFailure,
      () => 'UNKNOWN_PAGE_STATE',
    ).execute(normalSession, input, options);
    const unexpectedResult = await new CrawlProductUseCase(
      {
        extract: (): ReturnType<ProductExtractionPipeline['extract']> =>
          Promise.resolve({ source: 'none', product: null }),
      },
      (): PageState => {
        throw new Error('unexpected secret');
      },
    ).execute(normalSession, input, options);

    expect(browserResult.result.operationalErrorCode).toBe(
      'BROWSER_OPERATIONAL_ERROR',
    );
    expect(extractionResult.result.operationalErrorCode).toBe(
      'EXTRACTION_ERROR',
    );
    expect(unexpectedResult.result.operationalErrorCode).toBe(
      'UNEXPECTED_ERROR',
    );
    expect(
      JSON.stringify([browserResult, extractionResult, unexpectedResult]),
    ).not.toContain('secret');
  });
});
