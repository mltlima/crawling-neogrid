import { describe, expect, it } from 'vitest';

import { classifyPageState } from '../../../src/adapters/crawler/ifood/index.js';
import type { PageProbe } from '../../../src/domain/index.js';
import type { ProductOutput } from '../../../src/domain/index.js';

function probe(overrides: Partial<PageProbe> = {}): PageProbe {
  return {
    finalUrl: 'https://example.test',
    httpStatus: 200,
    html: '',
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

describe('classifyPageState', () => {
  it.each([
    [probe({ timedOut: true }), 'NAVIGATION_TIMEOUT'],
    [probe({ httpStatus: 403 }), 'ACCESS_BLOCKED'],
    [
      probe({
        responses: [
          {
            summary: {
              url: 'https://example.test/items/target',
              method: 'GET',
              status: 403,
              contentType: 'text/html',
              durationMs: 1,
              approximateSizeBytes: 1,
              possibleProductData: true,
              payloadTruncated: false,
            },
            jsonPayload: null,
          },
        ],
      }),
      'ACCESS_BLOCKED',
    ],
    [probe({ httpStatus: 429 }), 'RATE_LIMITED'],
    [
      probe({
        responses: [
          {
            summary: {
              url: 'https://example.test/analytics',
              method: 'POST',
              status: 403,
              contentType: 'text/html',
              durationMs: 1,
              approximateSizeBytes: 1,
              possibleProductData: false,
              payloadTruncated: false,
            },
            jsonPayload: null,
          },
        ],
      }),
      'UNKNOWN_PAGE_STATE',
    ],
    [
      probe({
        finalUrl:
          'https://www.ifood.com.br/?item=22222222-2222-4222-8222-222222222222',
      }),
      'REDIRECTED_TO_HOME',
    ],
    [probe({ httpStatus: 500 }), 'HTTP_ERROR'],
    [
      probe({
        dom: {
          title: null,
          normalPrice: null,
          discountPrice: null,
          imageUrl: null,
          bodyText: 'Escolha seu endereço',
        },
      }),
      'LOCATION_REQUIRED',
    ],
    [
      probe({
        dom: {
          title: null,
          normalPrice: null,
          discountPrice: null,
          imageUrl: null,
          bodyText: 'Loja fechada',
        },
      }),
      'STORE_UNAVAILABLE',
    ],
    [
      probe({
        dom: {
          title: null,
          normalPrice: null,
          discountPrice: null,
          imageUrl: null,
          bodyText: 'Produto indisponível',
        },
      }),
      'PRODUCT_UNAVAILABLE',
    ],
    [probe({ pageErrors: ['boom'] }), 'PARSER_ERROR'],
    [probe(), 'UNKNOWN_PAGE_STATE'],
  ] as const)('classifies page independently as %s', (page, expected) => {
    expect(classifyPageState(page, null)).toBe(expected);
  });

  it('distinguishes extracted success, unavailable products and blocked text', () => {
    const success: ProductOutput = {
      title: 'Produto',
      normal_price: 100,
      discount_price: null,
      product_url: 'https://example.test/product',
      image_url: null,
      status: 'success',
      error_message: null,
    };
    const unavailable: ProductOutput = {
      ...success,
      status: 'error',
      error_message: 'Indisponível.',
    };
    expect(classifyPageState(probe(), success)).toBe('PRODUCT_FOUND');
    expect(
      classifyPageState(
        probe({
          responses: [
            {
              summary: {
                url: 'https://example.test/items/target',
                method: 'GET',
                status: 403,
                contentType: 'text/html',
                durationMs: 1,
                approximateSizeBytes: 1,
                possibleProductData: true,
                payloadTruncated: false,
              },
              jsonPayload: null,
            },
          ],
        }),
        success,
      ),
    ).toBe('PRODUCT_FOUND');
    expect(classifyPageState(probe(), unavailable)).toBe('PRODUCT_UNAVAILABLE');
    expect(
      classifyPageState(
        probe({
          dom: {
            title: null,
            normalPrice: null,
            discountPrice: null,
            imageUrl: null,
            bodyText: 'captcha access denied',
          },
        }),
        null,
      ),
    ).toBe('ACCESS_BLOCKED');
    expect(
      classifyPageState(
        probe({
          dom: {
            title: null,
            normalPrice: null,
            discountPrice: null,
            imageUrl: null,
            bodyText:
              'Fora da área de entrega - Verifique sua localização. Trocar endereço.',
          },
        }),
        null,
      ),
    ).toBe('LOCATION_REQUIRED');
    expect(
      classifyPageState(
        probe({
          dom: {
            title: null,
            normalPrice: null,
            discountPrice: null,
            imageUrl: null,
            bodyText:
              'Antes de continuarmos, pressione e segure para confirmar que você é um humano.',
          },
        }),
        null,
      ),
    ).toBe('ACCESS_BLOCKED');
  });
});
