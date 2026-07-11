import { describe, expect, it } from 'vitest';

import {
  productOutputSchema,
  receivedUrlSchema,
} from '../../../src/domain/index.js';
import { makeIfoodUrl } from '../../fixtures/input-values.js';

describe('domain contracts', () => {
  it('accepts a received URL contract', () => {
    expect(
      receivedUrlSchema.parse({
        originalIndex: 0,
        lineNumber: 1,
        value: makeIfoodUrl(),
      }),
    ).toMatchObject({ originalIndex: 0, lineNumber: 1 });
  });

  it('enforces exactly the seven output fields', () => {
    const output = {
      title: 'Produto',
      normal_price: 20,
      discount_price: 15,
      product_url: makeIfoodUrl(),
      image_url: 'https://static.ifood.com.br/image.png',
      status: 'success',
      error_message: null,
    } as const;

    expect(productOutputSchema.parse(output)).toEqual(output);
    expect(() =>
      productOutputSchema.parse({ ...output, accidental_field: true }),
    ).toThrow();
  });
});
