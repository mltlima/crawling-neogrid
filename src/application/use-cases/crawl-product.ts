import {
  crawlItemResultSchema,
  type CrawlItemResult,
  type CrawlOperationalErrorCode,
  type PageProbe,
  type PageState,
  type ProductOutput,
  type ValidInputRecord,
} from '../../domain/index.js';
import type {
  ManagedBrowserProbeOptions,
  ManagedBrowserSession,
} from '../ports/browser-session.js';
import type { ProductExtractionPipeline } from '../ports/product-extractor.js';
import type { ExtractedProduct } from '../ports/product-extractor.js';

export interface CollectedCrawlProduct {
  readonly result: CrawlItemResult;
  readonly page: PageProbe | null;
}

export interface CrawlProductCollector {
  execute(
    session: ManagedBrowserSession,
    input: ValidInputRecord,
    options: ManagedBrowserProbeOptions,
  ): Promise<CollectedCrawlProduct>;
}

export class CrawlProductUseCase implements CrawlProductCollector {
  public constructor(
    private readonly extractor: ProductExtractionPipeline,
    private readonly classifyPage: (
      page: PageProbe,
      product: ProductOutput | null,
    ) => PageState,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public async execute(
    session: ManagedBrowserSession,
    input: ValidInputRecord,
    options: ManagedBrowserProbeOptions,
  ): Promise<CollectedCrawlProduct> {
    const startedAt = this.now();
    let page: PageProbe;
    try {
      page = await session.probe(input, options);
    } catch {
      return {
        result: this.failureResult(
          input,
          'BROWSER_OPERATIONAL_ERROR',
          'Falha operacional durante a navegação.',
          startedAt,
        ),
        page: null,
      };
    }

    let extraction: ExtractedProduct;
    try {
      extraction = await this.extractor.extract({ input, page });
    } catch {
      return {
        result: this.failureResult(
          input,
          'EXTRACTION_ERROR',
          'Falha ao extrair o produto.',
          startedAt,
        ),
        page,
      };
    }

    try {
      const pageState = this.classifyPage(page, extraction.product);
      const product: ProductOutput = extraction.product ?? {
        title: null,
        normal_price: null,
        discount_price: null,
        product_url: input.normalizedUrl,
        image_url: null,
        status: 'error',
        error_message: `Produto não extraído: ${pageState}.`,
      };
      return {
        result: crawlItemResultSchema.parse({
          originalIndex: input.originalIndex,
          lineNumber: input.lineNumber,
          merchantId: input.merchantId,
          itemId: input.itemId,
          source: extraction.source,
          pageState,
          product,
          durationMs: Math.max(0, this.now() - startedAt),
          operationalErrorCode: null,
          httpStatus: page.httpStatus,
          attempts: [
            {
              attemptNumber: 1,
              pageState,
              httpStatus: page.httpStatus,
              operationalErrorCode: null,
              durationMs: Math.max(0, this.now() - startedAt),
              retryable: false,
              retryScheduled: false,
              retryDelayMs: null,
              browserGeneration: 0,
            },
          ],
          attemptCount: 1,
          retryCount: 0,
          recoveredAfterRetry: false,
        }),
        page,
      };
    } catch {
      return {
        result: this.failureResult(
          input,
          'UNEXPECTED_ERROR',
          'Falha inesperada ao finalizar o produto.',
          startedAt,
        ),
        page,
      };
    }
  }

  private failureResult(
    input: ValidInputRecord,
    operationalErrorCode: CrawlOperationalErrorCode,
    errorMessage: string,
    startedAt: number,
  ): CrawlItemResult {
    return crawlItemResultSchema.parse({
      originalIndex: input.originalIndex,
      lineNumber: input.lineNumber,
      merchantId: input.merchantId,
      itemId: input.itemId,
      source: 'none',
      pageState: 'UNKNOWN_PAGE_STATE',
      product: {
        title: null,
        normal_price: null,
        discount_price: null,
        product_url: input.normalizedUrl,
        image_url: null,
        status: 'error',
        error_message: errorMessage,
      },
      durationMs: Math.max(0, this.now() - startedAt),
      operationalErrorCode,
      httpStatus: null,
      attempts: [
        {
          attemptNumber: 1,
          pageState: 'UNKNOWN_PAGE_STATE',
          httpStatus: null,
          operationalErrorCode,
          durationMs: Math.max(0, this.now() - startedAt),
          retryable: false,
          retryScheduled: false,
          retryDelayMs: null,
          browserGeneration: 0,
        },
      ],
      attemptCount: 1,
      retryCount: 0,
      recoveredAfterRetry: false,
    });
  }
}
