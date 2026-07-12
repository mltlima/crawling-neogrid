import { join } from 'node:path';

import { probeResultSchema, type ProbeResult } from '../../domain/index.js';
import { InputOperationalError } from '../errors/input-operational-error.js';
import type { BrowserSessionFactory } from '../ports/browser-session.js';
import type { ProbeArtifactsWriter } from '../ports/probe-artifacts.js';
import {
  isValidInputRecord,
  validateReceivedUrl,
} from '../services/validate-url.js';
import type { CrawlProductCollector } from './crawl-product.js';

export interface ProbeProductOptions {
  readonly url: string;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly artifactsDirectory: string;
  readonly trace: boolean;
  readonly maxJsonBytes: number;
  readonly maxRetryAfterMs?: number;
}

export class ProbeProductUseCase {
  public constructor(
    private readonly browserFactory: BrowserSessionFactory,
    private readonly crawlProduct: CrawlProductCollector,
    private readonly artifacts: ProbeArtifactsWriter,
    private readonly createRunId: () => string,
  ) {}

  public async execute(options: ProbeProductOptions): Promise<ProbeResult> {
    const input = validateReceivedUrl({
      originalIndex: 0,
      lineNumber: null,
      value: options.url,
    });
    if (!isValidInputRecord(input)) {
      throw new InputOperationalError(
        'PROBE_FAILED',
        `${input.errorCode}: ${input.message}`,
      );
    }

    const runId = this.createRunId();
    const artifactsDirectory = join(
      options.artifactsDirectory,
      'probes',
      runId,
    );
    const session = await this.browserFactory.open(options.headless);
    try {
      const collected = await this.crawlProduct.execute(session, input, {
        timeoutMs: options.timeoutMs,
        settleTimeoutMs: options.settleTimeoutMs,
        trace: options.trace,
        captureScreenshot: true,
        maxJsonBytes: options.maxJsonBytes,
        ...(options.maxRetryAfterMs === undefined
          ? {}
          : { maxRetryAfterMs: options.maxRetryAfterMs }),
      });
      const result = probeResultSchema.parse({
        runId,
        source: collected.result.source,
        pageState: collected.result.pageState,
        product: collected.result.product,
        artifactsDirectory,
        durationMs: collected.result.durationMs,
      });
      if (collected.page !== null) {
        await this.artifacts.write({
          directory: artifactsDirectory,
          result,
          page: collected.page,
          screenshotOnSuccess: false,
        });
      }
      return result;
    } finally {
      await session.close();
    }
  }
}
