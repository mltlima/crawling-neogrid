import type {
  ExtractionContext,
  ProductExtractor,
} from '../../../application/index.js';
import type { ProductOutput } from '../../../domain/index.js';
import { productFromDom } from './extractor-utils.js';

export class DomExtractor implements ProductExtractor {
  public readonly source = 'dom' as const;

  public extract(context: ExtractionContext): Promise<ProductOutput | null> {
    const dom = context.page.dom;
    return Promise.resolve(
      productFromDom(
        dom.title,
        dom.normalPrice,
        dom.discountPrice,
        dom.imageUrl,
        context.input.normalizedUrl,
      ),
    );
  }
}
