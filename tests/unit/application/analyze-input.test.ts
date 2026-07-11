import { describe, expect, it } from 'vitest';

import {
  countDuplicateOccurrences,
  detectDuplicates,
  groupRecordsByMerchant,
  validateReceivedUrl,
} from '../../../src/application/index.js';
import type { ValidInputRecord } from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  SECOND_ITEM_ID,
  SECOND_MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

function valid(url: string, originalIndex: number): ValidInputRecord {
  const result = validateReceivedUrl({
    originalIndex,
    lineNumber: originalIndex + 1,
    value: url,
  });
  if (!('normalizedUrl' in result)) {
    throw new Error(`Invalid test fixture: ${result.message}`);
  }
  return result;
}

describe('input analysis', () => {
  const records = [
    valid(makeIfoodUrl(), 0),
    valid(makeIfoodUrl(), 2),
    valid(makeIfoodUrl(MERCHANT_ID, SECOND_ITEM_ID), 4),
    valid(makeIfoodUrl(SECOND_MERCHANT_ID, ITEM_ID), 7),
  ];

  it('retains source indexes in every duplicate category', () => {
    const duplicates = detectDuplicates(records);

    expect(duplicates.fullUrls[0]?.originalIndexes).toEqual([0, 2]);
    expect(duplicates.itemIds[0]?.originalIndexes).toEqual([0, 2, 7]);
    expect(duplicates.merchantItems[0]?.originalIndexes).toEqual([0, 2]);
    expect(countDuplicateOccurrences(duplicates.itemIds)).toBe(2);
  });

  it('groups records by merchant without removing duplicate items', () => {
    const groups = groupRecordsByMerchant(records);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      merchantId: MERCHANT_ID,
      locality: 'sao-paulo-sp',
      storeSlug: 'loja-teste',
      originalIndexes: [0, 2, 4],
    });
    expect(groups[0]?.items).toHaveLength(3);
  });
});
