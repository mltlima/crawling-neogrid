import { join } from 'node:path';

import {
  probeResultSchema,
  type PageProbe,
  type PageState,
  type ProbeResult,
  type ProductOutput,
} from '../../domain/index.js';
import { InputOperationalError } from '../errors/input-operational-error.js';
import type { BrowserSession } from '../ports/browser-session.js';
import type { ProbeArtifactsWriter } from '../ports/probe-artifacts.js';
import type { ProductExtractionPipeline } from '../ports/product-extractor.js';
import {
  isValidInputRecord,
  validateReceivedUrl,
} from '../services/validate-url.js';

export interface ProbeProductOptions {
  readonly url: string;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly artifactsDirectory: string;
  readonly trace: boolean;
  readonly maxJsonBytes: number;
}

export class ProbeProductUseCase {
  public constructor(
    private readonly browser: BrowserSession,
    private readonly extractor: ProductExtractionPipeline,
    private readonly artifacts: ProbeArtifactsWriter,
    private readonly classifyPage: (
      page: PageProbe,
      product: ProductOutput | null,
    ) => PageState,
    private readonly createRunId: () => string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public async execute(options: ProbeProductOptions): Promise<ProbeResult> {
    const startedAt = this.now();
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
    const page = await this.browser.probe({
      input,
      headless: options.headless,
      timeoutMs: options.timeoutMs,
      trace: options.trace,
      maxJsonBytes: options.maxJsonBytes,
    });
    const extraction = await this.extractor.extract({ input, page });
    const pageState = this.classifyPage(page, extraction.product);
    const product: ProductOutput = extraction.product ?? {
      title: null,
      normal_price: null,
      discount_price: null,
      product_url: input.normalizedUrl,
      image_url: null,
      status: 'error',
      error_message: `Produto não extraído. Estado da página: ${pageState}.`,
    };
    const result = probeResultSchema.parse({
      runId,
      source: extraction.source,
      pageState,
      product,
      artifactsDirectory,
      durationMs: Math.max(0, this.now() - startedAt),
    });
    await this.artifacts.write({
      directory: artifactsDirectory,
      result,
      page,
      screenshotOnSuccess: false,
    });
    return result;
  }
}
