import { randomUUID } from 'node:crypto';

import { destination } from 'pino';

import {
  DomExtractor,
  EmbeddedDataExtractor,
  IfoodProductExtractor,
  NetworkExtractor,
  classifyPageState,
} from '../adapters/crawler/ifood/index.js';
import {
  CsvInputReader,
  JsonInputReader,
  NodeInputFileInspector,
  TxtInputReader,
  XlsxInputReader,
} from '../adapters/input/index.js';
import {
  ArtifactManifestWriter,
  CsvProductExporter,
  JsonlProductExporter,
  JsonBatchReportWriter,
  JsonValidationReportWriter,
} from '../adapters/output/index.js';
import {
  CrawlBatchUseCase,
  CrawlProductUseCase,
  ProbeProductUseCase,
  ValidateInputUseCase,
  ResumableCrawlUseCase,
} from '../application/index.js';
import type {
  CrawlBatchResult,
  InputValidationResult,
  ProbeResult,
} from '../domain/index.js';
import {
  PlaywrightArtifactsWriter,
  PlaywrightBrowserSessionFactory,
  RecoverableBrowserManager,
} from '../infrastructure/browser/index.js';
import { loadConfig } from '../config/index.js';
import { createLogger } from '../observability/index.js';
import {
  FilesystemCheckpointStore,
  safeFileName,
  sha256File,
} from '../infrastructure/persistence/index.js';

const logger = createLogger({ level: 'info' }, destination(2));
const validateInputUseCase = new ValidateInputUseCase(
  [
    new XlsxInputReader(),
    new CsvInputReader(),
    new TxtInputReader(),
    new JsonInputReader(),
  ],
  new NodeInputFileInspector(),
);
const browserFactory = new PlaywrightBrowserSessionFactory(logger);
const config = loadConfig();
const extractionPipeline = new IfoodProductExtractor([
  new NetworkExtractor(),
  new EmbeddedDataExtractor(),
  new DomExtractor(),
]);
const crawlProductUseCase = new CrawlProductUseCase(
  extractionPipeline,
  classifyPageState,
);
const probeProductUseCase = new ProbeProductUseCase(
  browserFactory,
  crawlProductUseCase,
  new PlaywrightArtifactsWriter(),
  randomUUID,
);
const crawlBatchUseCase = new CrawlBatchUseCase(
  validateInputUseCase,
  {
    create: (headless): RecoverableBrowserManager =>
      new RecoverableBrowserManager(browserFactory, headless),
  },
  crawlProductUseCase,
  logger,
  randomUUID,
);
const validationReportWriter = new JsonValidationReportWriter();
const batchReportWriter = new JsonBatchReportWriter();

export async function validateInputFile(
  filePath: string,
): Promise<InputValidationResult> {
  return validateInputUseCase.execute(filePath);
}

export async function writeValidationReport(
  filePath: string,
  report: InputValidationResult,
): Promise<void> {
  await validationReportWriter.write(filePath, report);
}

export async function probeProduct(options: {
  readonly url: string;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly artifactsDirectory: string;
  readonly trace: boolean;
}): Promise<ProbeResult> {
  return probeProductUseCase.execute({
    ...options,
    maxJsonBytes: 1_000_000,
    maxRetryAfterMs: config.crawlerRetryMaxDelayMs,
  });
}

export async function crawlBatch(options: {
  readonly inputPath: string;
  readonly limit?: number;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly retryJitterRatio: number;
  readonly minRequestIntervalMs: number;
  readonly circuitBreakerThreshold: number;
  readonly checkpointDir: string;
  readonly resume: boolean;
  readonly forceUnlock: boolean;
  readonly syncEvery: number;
  readonly outputJsonl: string;
  readonly outputCsv: string;
}): Promise<CrawlBatchResult> {
  const validation = await validateInputUseCase.execute(options.inputPath);
  const inputSha256 = await sha256File(options.inputPath);
  const store = new FilesystemCheckpointStore(
    options.checkpointDir,
    options.syncEvery,
  );
  const resumable = new ResumableCrawlUseCase(crawlBatchUseCase, store);
  const result = await resumable.execute(
    { ...options, maxJsonBytes: 1_000_000, inputSha256 },
    () => {
      const timestamp = new Date().toISOString();
      const ordered = [...validation.validRecords].sort(
        (a, b) => a.originalIndex - b.originalIndex,
      );
      const selected =
        options.limit === undefined ? ordered : ordered.slice(0, options.limit);
      return Promise.resolve({
        schemaVersion: 1 as const,
        runId: randomUUID(),
        status: 'CREATED' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
        input: {
          fileName: safeFileName(options.inputPath),
          format: validation.batch.format,
          sha256: inputSha256,
        },
        totalRecords: validation.summary.totalRecords,
        validRecords: validation.summary.validRecords,
        selectedRecords: selected.length,
        limit: options.limit ?? null,
        selectedInputs: selected.map((record) => ({
          originalIndex: record.originalIndex,
          merchantId: record.merchantId,
          itemId: record.itemId,
        })),
        effectiveConfig: {
          concurrency: options.concurrency,
          maxRetries: options.maxRetries,
        },
        appVersion: null,
        completedRecords: 0,
        pendingRecords: selected.length,
        skippedRecords: 0,
        files: {
          resultsJournal: 'results.journal.jsonl' as const,
          eventsJournal: 'events.journal.jsonl' as const,
        },
      });
    },
  );
  const complete =
    result.invalidRecords.length === 0 &&
    result.summary.skippedRecords === 0 &&
    result.summary.processedRecords === result.summary.selectedRecords;
  if (complete) {
    const products = result.results.map((entry) => entry.product);
    await new JsonlProductExporter().write(options.outputJsonl, products);
    await new CsvProductExporter().write(options.outputCsv, products);
    await new ArtifactManifestWriter().write(
      `${options.checkpointDir}/artifacts-manifest.json`,
      {
        schemaVersion: 1,
        runId: result.runId,
        inputSha256,
        generatedAt: new Date().toISOString(),
        productsCount: products.length,
        pricesInCents: true,
        summary: {
          successfulRecords: result.summary.successfulRecords,
          failedRecords: result.summary.failedRecords,
        },
        files: [options.outputJsonl, options.outputCsv],
      },
    );
  }
  return result;
}

export { config as appConfig };

export async function writeBatchReport(
  filePath: string,
  report: CrawlBatchResult,
): Promise<void> {
  await batchReportWriter.write(filePath, report);
}
