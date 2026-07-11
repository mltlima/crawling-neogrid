import { describe, expect, it, vi } from 'vitest';

import {
  CrawlProductUseCase,
  ProbeProductUseCase,
  type BrowserSessionFactory,
  type ExtractionContext,
  type ManagedBrowserSession,
  type ProbeArtifactsWriter,
  type ProductExtractionPipeline,
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
  it('uses shared collection, captures evidence and closes the session', async () => {
    const browserProbe = vi.fn(() => Promise.resolve(page));
    const sessionClose = vi.fn(() => Promise.resolve());
    const session: ManagedBrowserSession = {
      probe: browserProbe,
      close: sessionClose,
    };
    const factory: BrowserSessionFactory = {
      open: vi.fn(() => Promise.resolve(session)),
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
    const crawlProduct = new CrawlProductUseCase(
      extractor,
      () => 'PRODUCT_FOUND',
      () => 100,
    );
    const artifactsWrite = vi.fn(() => Promise.resolve());
    const artifacts: ProbeArtifactsWriter = { write: artifactsWrite };
    const useCase = new ProbeProductUseCase(
      factory,
      crawlProduct,
      artifacts,
      () => 'run-1',
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
    expect(browserProbe).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ captureScreenshot: true, trace: false }),
    );
    expect(artifactsWrite).toHaveBeenCalledOnce();
    expect(artifactsWrite).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotOnSuccess: false }),
    );
    expect(sessionClose).toHaveBeenCalledOnce();
  });

  it('rejects an invalid URL before opening a browser', async () => {
    const open = vi.fn(() => Promise.reject(new Error('must not run')));
    const factory: BrowserSessionFactory = { open };
    const crawlProduct = new CrawlProductUseCase(
      { extract: vi.fn() },
      () => 'UNKNOWN_PAGE_STATE',
    );
    const artifacts: ProbeArtifactsWriter = { write: vi.fn() };
    const useCase = new ProbeProductUseCase(
      factory,
      crawlProduct,
      artifacts,
      () => 'run',
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
    expect(open).not.toHaveBeenCalled();
  });
});
