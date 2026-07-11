import type {
  DuplicateGroup,
  DuplicateReport,
  StoreGroup,
  ValidInputRecord,
} from '../../domain/index.js';

function findDuplicateGroups(
  records: readonly ValidInputRecord[],
  kind: DuplicateGroup['kind'],
  selectKey: (record: ValidInputRecord) => string,
): DuplicateGroup[] {
  const indexesByKey = new Map<string, number[]>();

  for (const record of records) {
    const key = selectKey(record);
    const indexes = indexesByKey.get(key) ?? [];
    indexes.push(record.originalIndex);
    indexesByKey.set(key, indexes);
  }

  return [...indexesByKey.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, originalIndexes]) => ({ kind, key, originalIndexes }));
}

export function detectDuplicates(
  records: readonly ValidInputRecord[],
): DuplicateReport {
  return {
    fullUrls: findDuplicateGroups(
      records,
      'FULL_URL',
      (record) => record.normalizedUrl,
    ),
    itemIds: findDuplicateGroups(records, 'ITEM_ID', (record) => record.itemId),
    merchantItems: findDuplicateGroups(
      records,
      'MERCHANT_ITEM',
      (record) => `${record.merchantId}:${record.itemId}`,
    ),
  };
}

export function countDuplicateOccurrences(
  groups: readonly DuplicateGroup[],
): number {
  return groups.reduce(
    (total, group) => total + group.originalIndexes.length - 1,
    0,
  );
}

export function groupRecordsByMerchant(
  records: readonly ValidInputRecord[],
): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();

  for (const record of records) {
    const current = groups.get(record.merchantId);
    if (current === undefined) {
      groups.set(record.merchantId, {
        merchantId: record.merchantId,
        storeBaseUrl: record.storeBaseUrl,
        locality: record.locality,
        storeSlug: record.storeSlug,
        items: [record],
        originalIndexes: [record.originalIndex],
      });
      continue;
    }

    current.items.push(record);
    current.originalIndexes.push(record.originalIndex);
  }

  return [...groups.values()];
}
