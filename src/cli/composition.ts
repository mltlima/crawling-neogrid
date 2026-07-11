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
  JsonBatchReportWriter,
  JsonValidationReportWriter,
} from '../adapters/output/index.js';
import {
  CrawlBatchUseCase,
  CrawlProductUseCase,
  ProbeProductUseCase,
  ValidateInputUseCase,
} from '../application/index.js';
import type {
  CrawlBatchResult,
  InputValidationResult,
  ProbeResult,
} from '../domain/index.js';
import {
  PlaywrightArtifactsWriter,
  PlaywrightBrowserSessionFactory,
} from '../infrastructure/browser/index.js';
import { createLogger } from '../observability/index.js';

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
  browserFactory,
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
  return probeProductUseCase.execute({ ...options, maxJsonBytes: 1_000_000 });
}

export async function crawlBatch(options: {
  readonly inputPath: string;
  readonly limit?: number;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
}): Promise<CrawlBatchResult> {
  return crawlBatchUseCase.execute({ ...options, maxJsonBytes: 1_000_000 });
}

export async function writeBatchReport(
  filePath: string,
  report: CrawlBatchResult,
): Promise<void> {
  await batchReportWriter.write(filePath, report);
}
