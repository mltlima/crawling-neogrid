import { describe, expect, it, vi } from 'vitest';

import { ProbeProductUseCase } from '../../../src/application/index.js';
import type {
  BrowserSession,
  ExtractionContext,
  ProbeArtifactsWriter,
  ProductExtractionPipeline,
} from '../../../src/application/index.js';
import type { PageProbe } from '../../../src/domain/index.js';
import { makeIfoodUrl } from '../../fixtures/input-values.js';

const page: PageProbe = {
  finalUrl: makeIfoodUrl(),
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
  screenshot: new Uint8Array([1]),
  trace: null,
};

describe('ProbeProductUseCase', () => {
  it('validates, extracts, classifies and writes evidence', async () => {
    const browserProbe = vi.fn(() => Promise.resolve(page));
    const browser: BrowserSession = {
      probe: browserProbe,
    };
    const extractor: ProductExtractionPipeline = {
      extract: vi.fn((context: ExtractionContext) =>
        Promise.resolve({
          source: 'dom' as const,
          product: {
            title: 'Produto',
            normal_price: 1000,
            discount_price: null,
            product_url: context.input.normalizedUrl,
            image_url: null,
            status: 'success' as const,
            error_message: null,
          },
        }),
      ),
    };
    const artifactsWrite = vi.fn(() => Promise.resolve());
    const artifacts: ProbeArtifactsWriter = {
      write: artifactsWrite,
    };
    const useCase = new ProbeProductUseCase(
      browser,
      extractor,
      artifacts,
      () => 'PRODUCT_FOUND',
      () => 'run-1',
      () => 100,
    );
    const result = await useCase.execute({
      url: makeIfoodUrl(),
      headless: true,
      timeoutMs: 1000,
      settleTimeoutMs: 50,
      artifactsDirectory: 'artifacts',
      trace: false,
      maxJsonBytes: 100,
    });
    expect(result).toMatchObject({
      runId: 'run-1',
      source: 'dom',
      pageState: 'PRODUCT_FOUND',
    });
    expect(artifactsWrite).toHaveBeenCalledOnce();
  });

  it('rejects an invalid URL before opening a browser', async () => {
    const browserProbe = vi.fn(() => Promise.reject(new Error('must not run')));
    const browser: BrowserSession = {
      probe: browserProbe,
    };
    const extractor: ProductExtractionPipeline = { extract: vi.fn() };
    const artifacts: ProbeArtifactsWriter = { write: vi.fn() };
    const useCase = new ProbeProductUseCase(
      browser,
      extractor,
      artifacts,
      () => 'UNKNOWN_PAGE_STATE',
      () => 'run',
      () => 0,
    );
    await expect(
      useCase.execute({
        url: 'https://example.com',
        headless: true,
        timeoutMs: 1,
        settleTimeoutMs: 1,
        artifactsDirectory: 'artifacts',
        trace: false,
        maxJsonBytes: 1,
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
    expect(browserProbe).not.toHaveBeenCalled();
  });
});
