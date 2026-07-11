import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DomExtractor,
  EmbeddedDataExtractor,
  IfoodProductExtractor,
  NetworkExtractor,
} from '../../../src/adapters/crawler/ifood/index.js';
import { parsePriceToCents } from '../../../src/adapters/crawler/ifood/extractor-utils.js';
import type {
  ExtractionContext,
  ProductExtractor,
} from '../../../src/application/index.js';
import type { PageProbe, ValidInputRecord } from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

const input: ValidInputRecord = {
  originalIndex: 0,
  lineNumber: null,
  originalUrl: makeIfoodUrl(),
  normalizedUrl: makeIfoodUrl(),
  storeBaseUrl: makeIfoodUrl().split('?')[0] ?? '',
  locality: 'sao-paulo-sp',
  storeSlug: 'loja-teste',
  merchantId: MERCHANT_ID,
  itemId: ITEM_ID,
};

function page(overrides: Partial<PageProbe> = {}): PageProbe {
  return {
    finalUrl: input.normalizedUrl,
    httpStatus: 200,
    html: '<html></html>',
    responses: [],
    consoleErrors: [],
    pageErrors: [],
    dom: {
      title: null,
      normalPrice: null,
      discountPrice: null,
      imageUrl: null,
      bodyText: '',
    },
    timedOut: false,
    screenshot: new Uint8Array(),
    trace: null,
    ...overrides,
  };
}

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      join(process.cwd(), 'tests', 'fixtures', 'probe', name),
      'utf8',
    ),
  ) as unknown;
}

describe('product extractors', () => {
  it.each([
    ['product-success.json', 2590, null, 'success'],
    ['product-discount.json', 2590, 1990, 'success'],
    ['product-unavailable.json', 2590, null, 'error'],
  ] as const)(
    'parses sanitized network fixture %s',
    async (name, normal, discount, status) => {
      const context: ExtractionContext = {
        input,
        page: page({
          responses: [
            {
              summary: {
                url: 'https://www.ifood.com.br/api/product',
                method: 'GET',
                status: 200,
                contentType: 'application/json',
                durationMs: 1,
                approximateSizeBytes: 100,
                possibleProductData: true,
                payloadTruncated: false,
              },
              jsonPayload: await fixture(name),
            },
          ],
        }),
      };
      const product = await new NetworkExtractor().extract(context);
      expect(product).toMatchObject({
        normal_price: normal,
        discount_price: discount,
        status,
      });
    },
  );

  it('uses embedded data then DOM as fallbacks', async () => {
    const embeddedPayload = JSON.stringify(
      await fixture('product-success.json'),
    );
    const embedded = await new EmbeddedDataExtractor().extract({
      input,
      page: page({
        html: `<script type="application/json">${embeddedPayload}</script>`,
      }),
    });
    const dom = await new DomExtractor().extract({
      input,
      page: page({
        dom: {
          title: '  Produto   DOM ',
          normalPrice: 'R$ 25,90',
          discountPrice: 'R$ 19,90',
          imageUrl: 'https://example.test/a.png',
          bodyText: '',
        },
      }),
    });
    expect(embedded?.title).toBe('Produto de teste');
    expect(dom).toMatchObject({
      title: 'Produto DOM',
      normal_price: 2590,
      discount_price: 1990,
    });
  });

  it('stops after the first successful strategy', async () => {
    const product = {
      title: 'First',
      normal_price: 100,
      discount_price: null,
      product_url: input.normalizedUrl,
      image_url: null,
      status: 'success',
      error_message: null,
    } as const;
    const first: ProductExtractor = {
      source: 'network',
      extract: vi.fn(() => Promise.resolve(product)),
    };
    const secondExtract = vi.fn(() => Promise.resolve(product));
    const second: ProductExtractor = {
      source: 'dom',
      extract: secondExtract,
    };
    const result = await new IfoodProductExtractor([first, second]).extract({
      input,
      page: page(),
    });
    expect(result.source).toBe('network');
    expect(secondExtract).not.toHaveBeenCalled();
  });

  it('normalizes Brazilian monetary text to integer cents', () => {
    expect(parsePriceToCents('R$ 1.234,56')).toBe(123456);
    expect(parsePriceToCents('10.50')).toBe(1050);
    expect(parsePriceToCents(null)).toBeNull();
    expect(parsePriceToCents('invalid')).toBeNull();
  });

  it('returns none when every strategy rejects the page', async () => {
    const empty: ProductExtractor = {
      source: 'network',
      extract: () => Promise.resolve(null),
    };
    const result = await new IfoodProductExtractor([empty]).extract({
      input,
      page: page(),
    });
    expect(result).toEqual({ source: 'none', product: null });
    await expect(
      new EmbeddedDataExtractor().extract({
        input,
        page: page({
          html: '<script type="application/json">invalid-json</script>',
        }),
      }),
    ).resolves.toBeNull();
    await expect(
      new NetworkExtractor().extract({
        input,
        page: page({
          responses: [
            {
              summary: {
                url: 'https://example.test',
                method: 'GET',
                status: 200,
                contentType: 'application/json',
                durationMs: 0,
                approximateSizeBytes: 0,
                possibleProductData: false,
                payloadTruncated: false,
              },
              jsonPayload: null,
            },
          ],
        }),
      }),
    ).resolves.toBeNull();
  });
});
