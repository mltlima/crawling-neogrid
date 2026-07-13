import type {
  CrawlBatchResult,
  CrawlItemResult,
  RunManifest,
} from '../../domain/index.js';
import type { CrawlBatchOptions, CrawlBatchUseCase } from './crawl-batch.js';

type EventType =
  | 'CREATED'
  | 'STARTED'
  | 'INTERRUPT_REQUESTED'
  | 'RESUMED'
  | 'CONFIG_CHANGED'
  | 'CIRCUIT_BREAKER_OPENED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REPAIRED_JOURNAL';
export interface CheckpointStorePort {
  create(manifest: RunManifest): Promise<void>;
  replay(): Promise<{
    manifest: RunManifest;
    results: readonly {
      inputSha256: string;
      originalIndex: number;
      result: CrawlItemResult;
    }[];
    repairedTrailingLine: boolean;
  }>;
  writeManifest(manifest: RunManifest): Promise<void>;
  appendResult(entry: {
    inputSha256: string;
    originalIndex: number;
    result: CrawlItemResult;
  }): Promise<void>;
  appendEvent(event: {
    at: string;
    type: EventType;
    details: Record<string, string | number | boolean | null>;
  }): Promise<void>;
  acquireLock(runId: string, forceUnlock?: boolean): Promise<void>;
  releaseLock(): Promise<void>;
  flush(): Promise<void>;
}
export interface ResumableCrawlOptions extends CrawlBatchOptions {
  readonly resume: boolean;
  readonly forceUnlock: boolean;
  readonly inputSha256: string;
  readonly selectedInputs: RunManifest['selectedInputs'];
}

export class ResumableCrawlUseCase {
  public constructor(
    private readonly batch: CrawlBatchUseCase,
    private readonly store: CheckpointStorePort,
    private readonly now: () => Date = () => new Date(),
  ) {}
  public async execute(
    options: ResumableCrawlOptions,
    createManifest: () => Promise<RunManifest>,
  ): Promise<CrawlBatchResult> {
    const proposed = options.resume ? null : await createManifest();
    await this.store.acquireLock(
      proposed?.runId ?? 'resume',
      options.forceUnlock,
    );
    try {
      let manifest: RunManifest;
      let confirmed: readonly CrawlItemResult[] = [];
      if (options.resume) {
        const replay = await this.store.replay();
        manifest = replay.manifest;
        this.assertCompatible(manifest, options);
        for (const entry of replay.results) {
          this.assertEntry(manifest, entry);
        }
        if (replay.repairedTrailingLine) {
          await this.store.appendEvent(this.event('REPAIRED_JOURNAL', {}));
        }
        confirmed = replay.results.map((entry) => entry.result);
        await this.store.appendEvent(
          this.event('RESUMED', { confirmed: confirmed.length }),
        );
      } else {
        if (proposed === null) {
          throw new Error('Manifesto inicial ausente.');
        }
        manifest = proposed;
        await this.store.create(manifest);
        await this.store.appendEvent(this.event('CREATED', {}));
      }
      await this.store.appendEvent(this.event('STARTED', {}));
      const confirmedIndexes = new Set(
        confirmed.map((result) => result.originalIndex),
      );
      const result = await this.batch.execute({
        ...options,
        runId: manifest.runId,
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
      const skipped = result.summary.skippedRecords;
      const complete =
        result.invalidRecords.length === 0 &&
        skipped === 0 &&
        result.summary.processedRecords === result.summary.selectedRecords;
      await this.store.flush();
      await this.store.writeManifest({
        ...manifest,
        status: complete ? 'COMPLETED' : 'PAUSED',
        updatedAt: this.now().toISOString(),
        completedRecords: confirmedIndexes.size,
        pendingRecords: Math.max(
          0,
          manifest.selectedRecords - confirmedIndexes.size - skipped,
        ),
        skippedRecords: skipped,
      });
      const finalEvent = complete
        ? 'COMPLETED'
        : result.summary.circuitBreakerOpened
          ? 'CIRCUIT_BREAKER_OPENED'
          : 'INTERRUPT_REQUESTED';
      await this.store.appendEvent(
        this.event(finalEvent, { completed: confirmedIndexes.size }),
      );
      return result;
    } catch (error: unknown) {
      await this.store
        .appendEvent(this.event('FAILED', {}))
        .catch(() => undefined);
      throw error;
    } finally {
      await this.store.releaseLock();
    }
  }
  private assertCompatible(
    manifest: RunManifest,
    options: ResumableCrawlOptions,
  ): void {
    if (
      manifest.input.sha256 !== options.inputSha256 ||
      manifest.limit !== (options.limit ?? null) ||
      JSON.stringify(manifest.selectedInputs) !==
        JSON.stringify(options.selectedInputs)
    ) {
      throw new Error(
        'Checkpoint incompatível com a entrada ou seleção atual.',
      );
    }
  }
  private assertEntry(
    manifest: RunManifest,
    entry: {
      inputSha256: string;
      originalIndex: number;
      result: CrawlItemResult;
    },
  ): void {
    const expected = manifest.selectedInputs.find(
      (input) => input.originalIndex === entry.originalIndex,
    );
    if (
      entry.inputSha256 !== manifest.input.sha256 ||
      expected === undefined ||
      entry.result.originalIndex !== expected.originalIndex ||
      entry.result.merchantId !== expected.merchantId ||
      entry.result.itemId !== expected.itemId
    ) {
      throw new Error('Resultado do journal incompatível com a entrada.');
    }
  }
  private event(
    type: EventType,
    details: Record<string, string | number | boolean | null>,
  ): {
    at: string;
    type: EventType;
    details: Record<string, string | number | boolean | null>;
  } {
    return { at: this.now().toISOString(), type, details };
  }
}
