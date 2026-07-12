import type {
  CrawlBatchResult,
  CrawlItemResult,
  RunManifest,
} from '../../domain/index.js';
import type { CrawlBatchOptions, CrawlBatchUseCase } from './crawl-batch.js';

/* v8 ignore start -- filesystem integration exercises this composed orchestration. */

export interface CheckpointStorePort {
  create(manifest: RunManifest): Promise<void>;
  replay(): Promise<{
    manifest: RunManifest;
    results: readonly {
      inputSha256: string;
      originalIndex: number;
      result: CrawlItemResult;
    }[];
  }>;
  writeManifest(manifest: RunManifest): Promise<void>;
  appendResult(entry: {
    inputSha256: string;
    originalIndex: number;
    result: CrawlItemResult;
  }): Promise<void>;
  acquireLock(runId: string, forceUnlock?: boolean): Promise<void>;
  releaseLock(): Promise<void>;
}

export interface ResumableCrawlOptions extends CrawlBatchOptions {
  readonly resume: boolean;
  readonly forceUnlock: boolean;
  readonly inputSha256: string;
}

export class ResumableCrawlUseCase {
  public constructor(
    private readonly batch: CrawlBatchUseCase,
    private readonly store: CheckpointStorePort,
  ) {}

  public async execute(
    options: ResumableCrawlOptions,
    createManifest: () => Promise<RunManifest>,
  ): Promise<CrawlBatchResult> {
    let manifest: RunManifest;
    let confirmed: readonly CrawlItemResult[] = [];
    if (options.resume) {
      const replay = await this.store.replay();
      if (replay.manifest.input.sha256 !== options.inputSha256) {
        throw new Error('Checkpoint incompatível com a entrada atual.');
      }
      manifest = replay.manifest;
      confirmed = replay.results.map((entry) => entry.result);
    } else {
      manifest = await createManifest();
      await this.store.create(manifest);
    }
    await this.store.acquireLock(manifest.runId, options.forceUnlock);
    try {
      const confirmedIndexes = new Set(
        confirmed.map((result) => result.originalIndex),
      );
      const result = await this.batch.execute({
        ...options,
        confirmedResults: confirmed,
        onResultConfirmed: async (item) => {
          await this.store.appendResult({
            inputSha256: options.inputSha256,
            originalIndex: item.originalIndex,
            result: item,
          });
          confirmedIndexes.add(item.originalIndex);
        },
      });
      const complete =
        result.invalidRecords.length === 0 &&
        result.summary.skippedRecords === 0 &&
        result.summary.processedRecords === result.summary.selectedRecords;
      await this.store.writeManifest({
        ...manifest,
        status: complete ? 'COMPLETED' : 'PAUSED',
        updatedAt: new Date().toISOString(),
        completedRecords: confirmedIndexes.size,
        pendingRecords: Math.max(
          0,
          manifest.selectedRecords - confirmedIndexes.size,
        ),
        skippedRecords: result.summary.skippedRecords,
      });
      return result;
    } finally {
      await this.store.releaseLock();
    }
  }
}
/* v8 ignore stop */
