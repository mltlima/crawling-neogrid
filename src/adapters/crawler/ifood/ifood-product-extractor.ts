import type {
  ExtractedProduct,
  ExtractionContext,
  ProductExtractionPipeline,
  ProductExtractor,
} from '../../../application/index.js';

export class IfoodProductExtractor implements ProductExtractionPipeline {
  public constructor(
    private readonly extractors: readonly ProductExtractor[],
  ) {}

  public async extract(context: ExtractionContext): Promise<ExtractedProduct> {
    for (const extractor of this.extractors) {
      const product = await extractor.extract(context);
      if (product !== null) {
        return { source: extractor.source, product };
      }
    }
    return { source: 'none', product: null };
  }
}
