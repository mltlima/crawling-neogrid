import { describe, expect, it } from 'vitest';

import { validateReceivedUrl } from '../../../src/application/index.js';
import type { ReceivedUrl } from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

function received(value: unknown): ReceivedUrl {
  return { originalIndex: 7, lineNumber: 9, value };
}

function expectError(value: unknown, errorCode: string): void {
  expect(validateReceivedUrl(received(value))).toMatchObject({
    originalIndex: 7,
    lineNumber: 9,
    errorCode,
  });
}

describe('validateReceivedUrl', () => {
  it('extracts fields and produces a deterministic normalized URL', () => {
    const original = `  https://www.ifood.com.br/delivery/sao-paulo-sp/loja-teste/${MERCHANT_ID.toUpperCase()}?z=2&item=${ITEM_ID.toUpperCase()}&a=1#menu  `;

    expect(validateReceivedUrl(received(original))).toEqual({
      originalIndex: 7,
      lineNumber: 9,
      originalUrl: original,
      normalizedUrl: `https://www.ifood.com.br/delivery/sao-paulo-sp/loja-teste/${MERCHANT_ID}?a=1&item=${ITEM_ID}&z=2`,
      storeBaseUrl: `https://www.ifood.com.br/delivery/sao-paulo-sp/loja-teste/${MERCHANT_ID}`,
      locality: 'sao-paulo-sp',
      storeSlug: 'loja-teste',
      merchantId: MERCHANT_ID,
      itemId: ITEM_ID,
    });
  });

  it.each([
    [null, 'EMPTY_VALUE'],
    ['  ', 'EMPTY_VALUE'],
    [42, 'INVALID_URL'],
    ['not-a-url', 'INVALID_URL'],
    [makeIfoodUrl().replace('https:', 'http:'), 'INVALID_PROTOCOL'],
    [
      makeIfoodUrl().replace('www.ifood.com.br', 'ifood.com.br'),
      'INVALID_HOST',
    ],
    [
      makeIfoodUrl().replace('https://', 'https://user:pass@'),
      'EMBEDDED_CREDENTIALS',
    ],
    [
      makeIfoodUrl().replace('www.ifood.com.br', 'www.ifood.com.br:444'),
      'CUSTOM_PORT',
    ],
    [makeIfoodUrl().replace('/delivery/', '/restaurant/'), 'INVALID_PATH'],
    [makeIfoodUrl('merchant'), 'INVALID_MERCHANT_ID'],
    [makeIfoodUrl().split('?')[0], 'MISSING_ITEM_ID'],
    [makeIfoodUrl(MERCHANT_ID, 'item'), 'INVALID_ITEM_ID'],
  ])('rejects %j with %s', (value, errorCode) => {
    expectError(value, errorCode);
  });
});
