import { extname } from 'node:path';

import {
  inputValidationResultSchema,
  type InputValidationResult,
  type InvalidInputRecord,
  type ValidInputRecord,
} from '../../domain/index.js';
import { InputOperationalError } from '../errors/input-operational-error.js';
import type { InputFileInspector, InputReader } from '../ports/input-reader.js';
import {
  countDuplicateOccurrences,
  detectDuplicates,
  groupRecordsByMerchant,
} from '../services/analyze-input.js';
import {
  isValidInputRecord,
  validateReceivedUrl,
} from '../services/validate-url.js';

function countBy<T>(
  values: readonly T[],
  selectKey: (value: T) => string,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = selectKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

export class ValidateInputUseCase {
  private readonly readersByExtension: ReadonlyMap<string, InputReader>;

  public constructor(
    readers: readonly InputReader[],
    private readonly fileInspector: InputFileInspector,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.readersByExtension = new Map(
      readers.map((reader) => [reader.extension, reader]),
    );
  }

  public async execute(filePath: string): Promise<InputValidationResult> {
    const startedAt = this.now();

    if (filePath.trim().length === 0) {
      throw new InputOperationalError(
        'FILE_NOT_FOUND',
        'O caminho do arquivo de entrada não foi informado.',
      );
    }

    const extension = extname(filePath).toLowerCase();
    const reader = this.readersByExtension.get(extension);
    if (reader === undefined) {
      throw new InputOperationalError(
        'UNSUPPORTED_EXTENSION',
        `Extensão não suportada: ${extension || '(sem extensão)'}.`,
      );
    }

    await this.fileInspector.assertReadableFile(filePath);
    const batch = await reader.read(filePath);
    const validRecords: ValidInputRecord[] = [];
    const invalidRecords: InvalidInputRecord[] = [];

    for (const record of batch.records) {
      const result = validateReceivedUrl(record);
      if (isValidInputRecord(result)) {
        validRecords.push(result);
      } else {
        invalidRecords.push(result);
      }
    }

    const duplicates = detectDuplicates(validRecords);
    const storeGroups = groupRecordsByMerchant(validRecords);
    const recordsByMerchant = countBy(
      validRecords,
      (record) => record.merchantId,
    );
    const recordsByLocality = countBy(
      validRecords,
      (record) => record.locality,
    );
    const errorsByCode = countBy(invalidRecords, (record) => record.errorCode);

    return inputValidationResultSchema.parse({
      batch,
      validRecords,
      invalidRecords,
      duplicates,
      storeGroups,
      summary: {
        totalRecords: batch.records.length,
        validRecords: validRecords.length,
        invalidRecords: invalidRecords.length,
        emptyRecords: invalidRecords.filter(
          (record) => record.errorCode === 'EMPTY_VALUE',
        ).length,
        uniqueMerchants: storeGroups.length,
        duplicateFullUrls: countDuplicateOccurrences(duplicates.fullUrls),
        duplicateItemIds: countDuplicateOccurrences(duplicates.itemIds),
        duplicateMerchantItems: countDuplicateOccurrences(
          duplicates.merchantItems,
        ),
        uniqueUrls: new Set(validRecords.map((record) => record.normalizedUrl))
          .size,
        uniqueItemIds: new Set(validRecords.map((record) => record.itemId))
          .size,
        uniqueLocalities: new Set(validRecords.map((record) => record.locality))
          .size,
        recordsByMerchant,
        recordsByLocality,
        errorsByCode,
        durationMs: Math.max(0, this.now() - startedAt),
      },
    });
  }
}
