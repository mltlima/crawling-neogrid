import type {
  ExtractionSource,
  PageProbe,
  ProductOutput,
  ValidInputRecord,
} from '../../domain/index.js';

export interface ExtractionContext {
  readonly input: ValidInputRecord;
  readonly page: PageProbe;
}

export interface ProductExtractor {
  readonly source: Exclude<ExtractionSource, 'none'>;
  extract(context: ExtractionContext): Promise<ProductOutput | null>;
}

export interface ExtractedProduct {
  readonly source: ExtractionSource;
  readonly product: ProductOutput | null;
}

export interface ProductExtractionPipeline {
  extract(context: ExtractionContext): Promise<ExtractedProduct>;
}
