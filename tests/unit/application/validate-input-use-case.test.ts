import { describe, expect, it } from 'vitest';

import {
  ValidateInputUseCase,
  type InputFileInspector,
  type InputReader,
} from '../../../src/application/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

describe('ValidateInputUseCase summary metrics', () => {
  it('counts unique dimensions, distributions, errors and duration', async () => {
    const secondMerchantId = '33333333-3333-4333-8333-333333333333';
    const secondItemId = '44444444-4444-4444-8444-444444444444';
    const reader: InputReader = {
      extension: '.txt',
      format: 'txt',
      read: (sourcePath) =>
        Promise.resolve({
          sourcePath,
          format: 'txt',
          records: [
            { originalIndex: 0, lineNumber: 1, value: makeIfoodUrl() },
            {
              originalIndex: 1,
              lineNumber: 2,
              value: makeIfoodUrl(secondMerchantId, secondItemId).replace(
                'sao-paulo-sp',
                'rio-de-janeiro-rj',
              ),
            },
            { originalIndex: 2, lineNumber: 3, value: 'invalid' },
          ],
        }),
    };
    const inspector: InputFileInspector = {
      assertReadableFile: () => Promise.resolve(),
    };
    const timestamps = [100, 137];
    let timestampIndex = 0;
    const useCase = new ValidateInputUseCase(
      [reader],
      inspector,
      () => timestamps[timestampIndex++] ?? 137,
    );

    const result = await useCase.execute('input.txt');

    expect(result.summary).toMatchObject({
      uniqueUrls: 2,
      uniqueItemIds: 2,
      uniqueLocalities: 2,
      recordsByMerchant: {
        [MERCHANT_ID]: 1,
        [secondMerchantId]: 1,
      },
      recordsByLocality: {
        'sao-paulo-sp': 1,
        'rio-de-janeiro-rj': 1,
      },
      errorsByCode: { INVALID_URL: 1 },
      durationMs: 37,
    });
    expect(result.validRecords[0]?.itemId).toBe(ITEM_ID);
  });
});
