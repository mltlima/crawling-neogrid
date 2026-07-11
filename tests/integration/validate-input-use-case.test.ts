import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  NodeInputFileInspector,
  TxtInputReader,
} from '../../src/adapters/input/index.js';
import {
  InputOperationalError,
  ValidateInputUseCase,
} from '../../src/application/index.js';
import { makeIfoodUrl } from '../fixtures/input-values.js';

describe('ValidateInputUseCase', () => {
  let directory: string;
  let useCase: ValidateInputUseCase;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ifood-use-case-'));
    let currentTime = 100;
    useCase = new ValidateInputUseCase(
      [new TxtInputReader()],
      new NodeInputFileInspector(),
      () => {
        const value = currentTime;
        currentTime += 25;
        return value;
      },
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('validates all rows and summarizes duplicates without dropping them', async () => {
    const filePath = join(directory, 'input.txt');
    await writeFile(
      filePath,
      `${makeIfoodUrl()}\n${makeIfoodUrl()}\n\nnot-a-url`,
      'utf8',
    );

    const result = await useCase.execute(filePath);

    expect(result.validRecords).toHaveLength(2);
    expect(result.invalidRecords.map((record) => record.errorCode)).toEqual([
      'EMPTY_VALUE',
      'INVALID_URL',
    ]);
    expect(result.storeGroups[0]?.originalIndexes).toEqual([0, 1]);
    expect(result.summary).toEqual({
      totalRecords: 4,
      validRecords: 2,
      invalidRecords: 2,
      emptyRecords: 1,
      uniqueMerchants: 1,
      duplicateFullUrls: 1,
      duplicateItemIds: 1,
      duplicateMerchantItems: 1,
      uniqueUrls: 1,
      uniqueItemIds: 1,
      uniqueLocalities: 1,
      recordsByMerchant: {
        '11111111-1111-4111-8111-111111111111': 2,
      },
      recordsByLocality: { 'sao-paulo-sp': 2 },
      errorsByCode: { EMPTY_VALUE: 1, INVALID_URL: 1 },
      durationMs: 25,
    });
  });

  it('rejects unsupported, missing and byte-empty files operationally', async () => {
    const emptyPath = join(directory, 'empty.txt');
    await writeFile(emptyPath, '', 'utf8');

    await expect(useCase.execute('input.xml')).rejects.toMatchObject({
      code: 'UNSUPPORTED_EXTENSION',
    });
    await expect(
      useCase.execute(join(directory, 'missing.txt')),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    await expect(useCase.execute(emptyPath)).rejects.toMatchObject({
      code: 'FILE_EMPTY',
    });
    await expect(useCase.execute('')).rejects.toBeInstanceOf(
      InputOperationalError,
    );
  });
});
