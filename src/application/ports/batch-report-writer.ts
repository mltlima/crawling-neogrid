import type { CrawlBatchResult } from '../../domain/index.js';

export interface BatchReportWriter {
  write(filePath: string, report: CrawlBatchResult): Promise<void>;
}
