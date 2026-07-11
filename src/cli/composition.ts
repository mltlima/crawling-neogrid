import { randomUUID } from 'node:crypto';

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
import { JsonValidationReportWriter } from '../adapters/output/index.js';
import {
  ProbeProductUseCase,
  ValidateInputUseCase,
} from '../application/index.js';
import type { InputValidationResult, ProbeResult } from '../domain/index.js';
import {
  PlaywrightArtifactsWriter,
  PlaywrightBrowserSession,
} from '../infrastructure/browser/index.js';
import { createLogger } from '../observability/index.js';

const validateInputUseCase = new ValidateInputUseCase(
  [
    new XlsxInputReader(),
    new CsvInputReader(),
    new TxtInputReader(),
    new JsonInputReader(),
  ],
  new NodeInputFileInspector(),
);
const validationReportWriter = new JsonValidationReportWriter();
const logger = createLogger({ level: 'info' });
const probeProductUseCase = new ProbeProductUseCase(
  new PlaywrightBrowserSession(logger),
  new IfoodProductExtractor([
    new NetworkExtractor(),
    new EmbeddedDataExtractor(),
    new DomExtractor(),
  ]),
  new PlaywrightArtifactsWriter(),
  classifyPageState,
  randomUUID,
);

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
