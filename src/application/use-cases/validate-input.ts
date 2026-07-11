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

export class ValidateInputUseCase {
  private readonly readersByExtension: ReadonlyMap<string, InputReader>;

  public constructor(
    readers: readonly InputReader[],
    private readonly fileInspector: InputFileInspector,
  ) {
    this.readersByExtension = new Map(
      readers.map((reader) => [reader.extension, reader]),
    );
  }

  public async execute(filePath: string): Promise<InputValidationResult> {
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
      },
    });
  }
}
