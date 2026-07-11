export { InputOperationalError } from './errors/input-operational-error.js';
export type { InputFileInspector, InputReader } from './ports/input-reader.js';
export type { ValidationReportWriter } from './ports/validation-report-writer.js';
export type {
  BrowserSessionFactory,
  ManagedBrowserProbeOptions,
  ManagedBrowserSession,
} from './ports/browser-session.js';
export type {
  ExtractedProduct,
  ExtractionContext,
  ProductExtractionPipeline,
  ProductExtractor,
} from './ports/product-extractor.js';
export type {
  ProbeArtifactsOptions,
  ProbeArtifactsWriter,
} from './ports/probe-artifacts.js';
export {
  countDuplicateOccurrences,
  detectDuplicates,
  groupRecordsByMerchant,
} from './services/analyze-input.js';
export {
  isValidInputRecord,
  validateReceivedUrl,
} from './services/validate-url.js';
export { ValidateInputUseCase } from './use-cases/validate-input.js';
export {
  ProbeProductUseCase,
  type ProbeProductOptions,
} from './use-cases/probe-product.js';
export {
  CrawlProductUseCase,
  type CollectedCrawlProduct,
  type CrawlProductCollector,
} from './use-cases/crawl-product.js';
export {
  CrawlBatchUseCase,
  type CrawlBatchOptions,
} from './use-cases/crawl-batch.js';
export type { BatchLogger } from './ports/batch-logger.js';
export type { BatchReportWriter } from './ports/batch-report-writer.js';
