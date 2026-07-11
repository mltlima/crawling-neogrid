import type {
  ExtractionContext,
  ProductExtractor,
} from '../../../application/index.js';
import type { ProductOutput } from '../../../domain/index.js';
import { findProductObject, productFromObject } from './extractor-utils.js';

export class EmbeddedDataExtractor implements ProductExtractor {
  public readonly source = 'embedded-data' as const;

  public extract(context: ExtractionContext): Promise<ProductOutput | null> {
    const scripts = context.page.html.matchAll(
      /<script[^>]*(?:type=["']application\/(?:ld\+)?json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi,
    );
    for (const match of scripts) {
      try {
        const payload: unknown = JSON.parse(match[1] ?? '');
        const object = findProductObject(payload, context.input.itemId);
        if (object !== null) {
          return Promise.resolve(
            productFromObject(object, context.input.normalizedUrl),
          );
        }
      } catch {
        continue;
      }
    }
    return Promise.resolve(null);
  }
}
