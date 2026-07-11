import { describe, expect, it } from 'vitest';

import {
  calculateSuccessRatePercent,
  crawlBatchResultSchema,
  crawlBatchSummarySchema,
} from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

const summary = {
  totalRecords: 1,
  validRecords: 1,
  invalidRecords: 0,
  selectedRecords: 1,
  processedRecords: 1,
  successfulRecords: 1,
  failedRecords: 0,
  successRatePercent: 100,
  recordsByPageState: { PRODUCT_FOUND: 1 },
  recordsBySource: { network: 1 },
  recordsByOperationalError: {},
  durationMs: 10,
};

const result = {
  runId: 'batch-1',
  source: { fileName: 'input.xlsx', format: 'xlsx' },
  invalidRecords: [],
  results: [
    {
      originalIndex: 0,
      lineNumber: 2,
      merchantId: MERCHANT_ID,
      itemId: ITEM_ID,
      source: 'network',
      pageState: 'PRODUCT_FOUND',
      product: {
        title: 'Produto',
        normal_price: 1000,
        discount_price: null,
        product_url: makeIfoodUrl(),
        image_url: null,
        status: 'success',
        error_message: null,
      },
      durationMs: 5,
      operationalErrorCode: null,
    },
  ],
  summary,
};

describe('crawl batch contracts', () => {
  it('accepts a strict result with the seven-field product', () => {
    expect(crawlBatchResultSchema.parse(result)).toEqual(result);
    expect(Object.keys(result.results[0]?.product ?? {})).toHaveLength(7);
  });

  it('rejects extra fields and inconsistent counts', () => {
    expect(() =>
      crawlBatchResultSchema.parse({ ...result, unexpected: true }),
    ).toThrow();
    expect(() =>
      crawlBatchSummarySchema.parse({ ...summary, processedRecords: 2 }),
    ).toThrow('inconsistentes');
    expect(() =>
      crawlBatchResultSchema.parse({ ...result, results: [] }),
    ).toThrow('não corresponde');
  });

  it.each([
    [0, 0, 0],
    [4, 4, 100],
    [0, 4, 0],
    [1, 3, 33.33],
  ])(
    'calculates %s successes from %s as %s%%',
    (successes, total, expected) => {
      expect(calculateSuccessRatePercent(successes, total)).toBe(expected);
    },
  );
});
