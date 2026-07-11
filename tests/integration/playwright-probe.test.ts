import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DomExtractor,
  EmbeddedDataExtractor,
  NetworkExtractor,
  classifyPageState,
} from '../../src/adapters/crawler/ifood/index.js';
import type { ManagedBrowserSession } from '../../src/application/index.js';
import { PlaywrightBrowserSessionFactory } from '../../src/infrastructure/browser/index.js';
import { createLogger } from '../../src/observability/index.js';
import type { PageProbe, ValidInputRecord } from '../../src/domain/index.js';
import { ITEM_ID, MERCHANT_ID } from '../fixtures/input-values.js';

describe('Playwright probe against a local server', () => {
  let server: Server;
  let origin: string;
  let browserSession: ManagedBrowserSession;
  const payload = JSON.stringify({
    product: {
      id: ITEM_ID,
      name: 'Produto local',
      price: { value: 2590 },
      available: true,
    },
  });

  beforeAll(async () => {
    server = createServer((request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      const path = new URL(request.url ?? '/', 'http://local').pathname;
      if (path === '/api/product') {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(payload);
      } else if (path === '/api/product-large') {
        const largePayload = JSON.stringify({
          itemId: ITEM_ID,
          data: 'x'.repeat(2_000),
        });
        response
          .writeHead(200, {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(largePayload)),
          })
          .end(largePayload);
      } else if (path === '/network') {
        response.end(
          `<script>fetch('/api/product?token=secret')</script><h1>Network</h1>`,
        );
      } else if (path === '/embedded') {
        response.end(`<script type="application/json">${payload}</script>`);
      } else if (path === '/dom') {
        response.end(
          '<h1 data-testid="product-title">Produto DOM</h1><span data-testid="normal-price">R$ 25,90</span><span data-testid="discount-price">R$ 19,90</span>',
        );
      } else if (path === '/unavailable') {
        response.end('<body>Produto indisponível</body>');
      } else if (path === '/large') {
        response.end(
          `<script>fetch('/api/product-large?authorization=secret')</script>`,
        );
      } else if (path === '/forbidden') {
        response.writeHead(403).end('forbidden');
      } else if (path === '/rate') {
        response.writeHead(429).end('rate limited');
      } else if (path === '/javascript-error') {
        response.end(
          '<script>setTimeout(() => { throw new Error("local boom") }, 0)</script>',
        );
      } else if (path === '/timeout') {
        setTimeout(() => response.end('late'), 500);
      } else if (path === '/cookie-set') {
        response.setHeader('set-cookie', 'session=first; Path=/');
        response.end('<h1 data-testid="product-title">Primeiro contexto</h1>');
      } else if (path === '/cookie-check') {
        const shared =
          request.headers.cookie?.includes('session=first') === true;
        response.end(
          `<h1 data-testid="product-title">${shared ? 'Cookie vazou' : 'Contexto isolado'}</h1>`,
        );
      } else {
        response.end('<body>unknown structure</body>');
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Local server failed');
    }
    origin = `http://127.0.0.1:${String(address.port)}`;
    browserSession = await new PlaywrightBrowserSessionFactory(
      createLogger({ level: 'silent' }),
    ).open(true);
  });

  afterAll(async () => {
    await browserSession.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  });

  function input(path: string): ValidInputRecord {
    const url = `${origin}${path}?item=${ITEM_ID}`;
    return {
      originalIndex: 0,
      lineNumber: null,
      originalUrl: url,
      normalizedUrl: url,
      storeBaseUrl: `${origin}${path}`,
      locality: 'local',
      storeSlug: 'test',
      merchantId: MERCHANT_ID,
      itemId: ITEM_ID,
    };
  }

  async function probe(
    path: string,
    timeoutMs = 2_000,
    maxJsonBytes = 1_000_000,
    settleTimeoutMs = 500,
  ): Promise<PageProbe> {
    return browserSession.probe(input(path), {
      timeoutMs,
      settleTimeoutMs,
      trace: false,
      captureScreenshot: true,
      maxJsonBytes,
    });
  }

  it('extracts in network, embedded and DOM modes without leaking query parameters', async () => {
    const networkPage = await probe('/network');
    const network = await new NetworkExtractor().extract({
      input: input('/network'),
      page: networkPage,
    });
    const embeddedPage = await probe('/embedded');
    const embedded = await new EmbeddedDataExtractor().extract({
      input: input('/embedded'),
      page: embeddedPage,
    });
    const domPage = await probe('/dom');
    const dom = await new DomExtractor().extract({
      input: input('/dom'),
      page: domPage,
    });
    expect(network?.title).toBe('Produto local');
    expect(
      networkPage.responses.every((item) => !item.summary.url.includes('?')),
    ).toBe(true);
    expect(embedded?.title).toBe('Produto local');
    expect(dom).toMatchObject({ normal_price: 2590, discount_price: 1990 });
  }, 30_000);

  it('classifies local HTTP, timeout, unavailable, JavaScript and unknown states', async () => {
    const cases = [
      ['/unavailable', 'PRODUCT_UNAVAILABLE', 2_000],
      ['/forbidden', 'ACCESS_BLOCKED', 2_000],
      ['/rate', 'RATE_LIMITED', 2_000],
      ['/timeout', 'NAVIGATION_TIMEOUT', 50],
      ['/javascript-error', 'PARSER_ERROR', 2_000],
      ['/unknown', 'UNKNOWN_PAGE_STATE', 2_000],
    ] as const;
    for (const [path, state, timeout] of cases) {
      const page = await probe(path, timeout);
      expect(classifyPageState(page, null)).toBe(state);
    }
  }, 30_000);

  it('does not parse JSON payloads above the configured limit', async () => {
    const page = await probe('/large', 2_000, 100);
    const candidate = page.responses.find((item) =>
      item.summary.url.includes('/api/product-large'),
    );
    expect(candidate?.summary.payloadTruncated).toBe(true);
    expect(candidate?.jsonPayload).toBeNull();
  });

  it('reuses the managed browser while isolating cookies between probes', async () => {
    await probe('/cookie-set');
    const isolated = await probe('/cookie-check');
    expect(isolated.html).toContain('Contexto isolado');
    expect(isolated.html).not.toContain('Cookie vazou');
  });

  it.each(['/network', '/dom', '/unavailable'])(
    'settles early when %s emits a terminal signal',
    async (path) => {
      const startedAt = Date.now();
      await probe(path, 5_000, 1_000_000, 3_000);
      expect(Date.now() - startedAt).toBeLessThan(2_500);
    },
    15_000,
  );

  it('stops at the configured settle timeout without terminal signals', async () => {
    const startedAt = Date.now();
    await probe('/unknown', 5_000, 1_000_000, 200);
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(2_000);
  });
});
