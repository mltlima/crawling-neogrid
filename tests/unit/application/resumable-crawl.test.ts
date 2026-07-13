/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import type {
  CrawlBatchResult,
  RunManifest,
} from '../../../src/domain/index.js';
import {
  ResumableCrawlUseCase,
  type CheckpointStorePort,
  type ResumableCrawlOptions,
} from '../../../src/application/use-cases/resumable-crawl.js';
import type { CrawlBatchUseCase } from '../../../src/application/use-cases/crawl-batch.js';

const hash = 'a'.repeat(64);
const merchantId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
function manifest(): RunManifest {
  const at = '2026-01-01T00:00:00.000Z';
  return {
    schemaVersion: 1,
    runId: 'run',
    status: 'CREATED',
    createdAt: at,
    updatedAt: at,
    input: { fileName: 'input.xlsx', format: 'xlsx', sha256: hash },
    totalRecords: 1,
    validRecords: 1,
    selectedRecords: 1,
    limit: null,
    selectedInputs: [{ originalIndex: 0, merchantId, itemId }],
    effectiveConfig: {},
    appVersion: null,
    completedRecords: 0,
    pendingRecords: 1,
    skippedRecords: 0,
    files: {
      resultsJournal: 'results.journal.jsonl',
      eventsJournal: 'events.journal.jsonl',
    },
  };
}
const options: ResumableCrawlOptions = {
  inputPath: 'input.xlsx',
  resume: false,
  forceUnlock: false,
  inputSha256: hash,
  selectedInputs: [{ originalIndex: 0, merchantId, itemId }],
  headless: true,
  timeoutMs: 1,
  settleTimeoutMs: 1,
  maxJsonBytes: 1,
  concurrency: 1,
  maxRetries: 0,
  retryDelayMs: 0,
  retryMaxDelayMs: 0,
  retryJitterRatio: 0,
  minRequestIntervalMs: 0,
  circuitBreakerThreshold: 1,
};
function result(): CrawlBatchResult {
  return {
    invalidRecords: [],
    skippedInputs: [],
    results: [],
    summary: { selectedRecords: 1, processedRecords: 1, skippedRecords: 0 },
    runId: 'run',
    source: { fileName: 'input.xlsx', format: 'xlsx' },
  } as unknown as CrawlBatchResult;
}
function store(): CheckpointStorePort {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    replay: vi.fn(),
    writeManifest: vi.fn().mockResolvedValue(undefined),
    appendResult: vi.fn().mockResolvedValue(undefined),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    acquireLock: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}
describe('ResumableCrawlUseCase', () => {
  it('locks, journals, completes and releases a new run', async () => {
    const checkpoint = store();
    const batch = {
      execute: vi.fn().mockResolvedValue(result()),
    } as unknown as CrawlBatchUseCase;
    const useCase = new ResumableCrawlUseCase(
      batch,
      checkpoint,
      () => new Date('2026-01-02T00:00:00.000Z'),
    );
    await expect(
      useCase.execute(options, async () => manifest()),
    ).resolves.toEqual(result());
    expect(checkpoint.acquireLock).toHaveBeenCalledWith('run', false);
    expect(checkpoint.create).toHaveBeenCalledWith(manifest());
    expect(batch.execute).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run' }),
    );
    expect(checkpoint.writeManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        completedRecords: 0,
        pendingRecords: 1,
      }),
    );
    expect(checkpoint.releaseLock).toHaveBeenCalledOnce();
  });

  it.each([
    { limit: 1 },
    { selectedInputs: [{ originalIndex: 1, merchantId, itemId }] },
    {
      selectedInputs: [
        {
          originalIndex: 0,
          merchantId: '33333333-3333-4333-8333-333333333333',
          itemId,
        },
      ],
    },
    {
      selectedInputs: [
        {
          originalIndex: 0,
          merchantId,
          itemId: '44444444-4444-4444-8444-444444444444',
        },
      ],
    },
  ])('rejects incompatible selection %#', async (override) => {
    const checkpoint = store();
    vi.mocked(checkpoint.replay).mockResolvedValue({
      manifest: manifest(),
      results: [],
      repairedTrailingLine: false,
    });
    const batch = { execute: vi.fn() } as unknown as CrawlBatchUseCase;
    await expect(
      new ResumableCrawlUseCase(batch, checkpoint).execute(
        { ...options, ...override, resume: true },
        async () => manifest(),
      ),
    ).rejects.toThrow('Checkpoint incompat');
  });

  it('rejects incompatible resume journals and still releases the lock', async () => {
    const checkpoint = store();
    vi.mocked(checkpoint.replay).mockResolvedValue({
      manifest: {
        ...manifest(),
        input: { ...manifest().input, sha256: 'b'.repeat(64) },
      },
      results: [],
      repairedTrailingLine: false,
    });
    const batch = { execute: vi.fn() } as unknown as CrawlBatchUseCase;
    const useCase = new ResumableCrawlUseCase(batch, checkpoint);
    await expect(
      useCase.execute({ ...options, resume: true }, async () => manifest()),
    ).rejects.toThrow('Checkpoint incompat');
    expect(batch.execute).not.toHaveBeenCalled();
    expect(checkpoint.releaseLock).toHaveBeenCalledOnce();
  });

  it('replays compatible results and persists newly confirmed records', async () => {
    const checkpoint = store();
    const confirmed = {
      originalIndex: 0,
      merchantId,
      itemId,
    } as never;
    vi.mocked(checkpoint.replay).mockResolvedValue({
      manifest: manifest(),
      results: [{ inputSha256: hash, originalIndex: 0, result: confirmed }],
      repairedTrailingLine: false,
    });
    const batch = {
      execute: vi.fn(async (batchOptions) => {
        await batchOptions.onResultConfirmed?.(confirmed);
        return result();
      }),
    } as unknown as CrawlBatchUseCase;
    const useCase = new ResumableCrawlUseCase(batch, checkpoint);
    await useCase.execute({ ...options, resume: true }, async () => manifest());
    expect(checkpoint.appendResult).toHaveBeenCalledWith({
      inputSha256: hash,
      originalIndex: 0,
      result: confirmed,
    });
    expect(checkpoint.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESUMED' }),
    );
  });
});
