import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonValidationReportWriter } from '../../src/adapters/output/index.js';
import type { InputValidationResult } from '../../src/domain/index.js';

const report: InputValidationResult = {
  batch: { sourcePath: 'input.txt', format: 'txt', records: [] },
  validRecords: [],
  invalidRecords: [],
  duplicates: { fullUrls: [], itemIds: [], merchantItems: [] },
  storeGroups: [],
  summary: {
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    emptyRecords: 0,
    uniqueMerchants: 0,
    duplicateFullUrls: 0,
    duplicateItemIds: 0,
    duplicateMerchantItems: 0,
    uniqueUrls: 0,
    uniqueItemIds: 0,
    uniqueLocalities: 0,
    recordsByMerchant: {},
    recordsByLocality: {},
    errorsByCode: {},
    durationMs: 1,
  },
};

describe('JsonValidationReportWriter', () => {
  let directory: string;
  const writer = new JsonValidationReportWriter();

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ifood-report-writer-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes the complete report and creates parent directories', async () => {
    const reportPath = join(directory, 'nested', 'report.json');

    await writer.write(reportPath, report);

    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toEqual(report);
  });

  it('maps filesystem failures to an operational error', async () => {
    const reportPath = join(directory, 'existing-directory');
    await mkdir(reportPath);

    await expect(writer.write(reportPath, report)).rejects.toMatchObject({
      code: 'REPORT_WRITE_FAILED',
    });
  });

  it('rejects an empty report path', async () => {
    await expect(writer.write(' ', report)).rejects.toMatchObject({
      code: 'REPORT_WRITE_FAILED',
    });
  });
});
