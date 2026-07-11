import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonBatchReportWriter } from '../../src/adapters/output/index.js';
import type { CrawlBatchResult } from '../../src/domain/index.js';

const directories: string[] = [];

function report(): CrawlBatchResult {
  return {
    runId: 'run-safe',
    source: { fileName: 'input.txt', format: 'txt' },
    invalidRecords: [],
    results: [],
    summary: {
      totalRecords: 0,
      validRecords: 0,
      invalidRecords: 0,
      selectedRecords: 0,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      successRatePercent: 0,
      recordsByPageState: {},
      recordsBySource: {},
      recordsByOperationalError: {},
      durationMs: 1,
    },
  };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('JsonBatchReportWriter', () => {
  it('creates parents and atomically writes valid UTF-8 JSON with a final newline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'batch-report-'));
    directories.push(root);
    const target = join(root, 'nested', 'report.json');
    await new JsonBatchReportWriter(() => 'fixed').write(target, report());
    const content = await readFile(target, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    expect(JSON.parse(content)).toEqual(report());
    expect(await readdir(join(root, 'nested'))).toEqual(['report.json']);
  });

  it('removes the temporary file and returns a stable error when rename fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'batch-report-fail-'));
    directories.push(root);
    const target = join(root, 'target-directory');
    await mkdir(target, { recursive: true });
    const writer = new JsonBatchReportWriter(() => 'fixed');
    await expect(writer.write(target, report())).rejects.toMatchObject({
      code: 'BATCH_REPORT_WRITE_FAILED',
    });
    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    );
  });
});
