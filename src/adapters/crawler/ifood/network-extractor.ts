import type {
  ExtractionContext,
  ProductExtractor,
} from '../../../application/index.js';
import type { ProductOutput } from '../../../domain/index.js';
import { findProductObject, productFromObject } from './extractor-utils.js';

export class NetworkExtractor implements ProductExtractor {
  public readonly source = 'network' as const;

  public extract(context: ExtractionContext): Promise<ProductOutput | null> {
    for (const response of context.page.responses) {
      if (response.jsonPayload === null) {
        continue;
      }
      const object = findProductObject(
        response.jsonPayload,
        context.input.itemId,
      );
      if (object !== null) {
        return Promise.resolve(
          productFromObject(object, context.input.normalizedUrl),
        );
      }
    }
    return Promise.resolve(null);
  }
}
