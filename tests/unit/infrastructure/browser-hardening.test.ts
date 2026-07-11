import type { Browser, BrowserContext, Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';

import {
  PlaywrightBrowserSessionFactory,
  shouldLoadResponseBody,
  type PlaywrightLauncher,
} from '../../../src/infrastructure/browser/playwright-browser-session.js';
import { sanitizeDiagnosticMessages } from '../../../src/infrastructure/browser/index.js';
import { createLogger } from '../../../src/observability/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

const input = {
  originalIndex: 0,
  lineNumber: null,
  originalUrl: makeIfoodUrl(),
  normalizedUrl: makeIfoodUrl(),
  storeBaseUrl: makeIfoodUrl().split('?')[0] ?? '',
  locality: 'local',
  storeSlug: 'store',
  merchantId: MERCHANT_ID,
  itemId: ITEM_ID,
};

const probeOptions = {
  timeoutMs: 100,
  settleTimeoutMs: 50,
  trace: false,
  captureScreenshot: false,
  maxJsonBytes: 1_000,
};

describe('Playwright browser hardening', () => {
  it('closes the browser when newContext fails', async () => {
    const browserClose = vi.fn(() => Promise.resolve());
    const newContext = vi.fn(() => Promise.reject(new Error('context failed')));
    const browser = { close: browserClose, newContext } as unknown as Browser;
    const launcher: PlaywrightLauncher = {
      launch: () => Promise.resolve(browser),
    };

    const session = await new PlaywrightBrowserSessionFactory(
      createLogger({ level: 'silent' }),
      launcher,
    ).open(true);
    await expect(session.probe(input, probeOptions)).rejects.toMatchObject({
      code: 'PROBE_FAILED',
    });
    await session.close();
    await session.close();
    expect(browserClose).toHaveBeenCalledOnce();
  });

  it('closes context and browser when newPage fails', async () => {
    const contextClose = vi.fn(() => Promise.resolve());
    const newPage = vi.fn(() => Promise.reject(new Error('page failed')));
    const context = {
      close: contextClose,
      newPage,
    } as unknown as BrowserContext;
    const browserClose = vi.fn(() => Promise.resolve());
    const browser = {
      close: browserClose,
      newContext: () => Promise.resolve(context),
    } as unknown as Browser;
    const launcher: PlaywrightLauncher = {
      launch: () => Promise.resolve(browser),
    };

    const session = await new PlaywrightBrowserSessionFactory(
      createLogger({ level: 'silent' }),
      launcher,
    ).open(true);
    await expect(session.probe(input, probeOptions)).rejects.toMatchObject({
      code: 'PROBE_FAILED',
    });
    await session.close();
    expect(contextClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });

  it('closes page, context and browser when setup fails after newPage', async () => {
    const pageClose = vi.fn(() => Promise.resolve());
    const page = {
      close: pageClose,
      setDefaultTimeout: () => {
        throw new Error('page setup failed');
      },
    } as unknown as Page;
    const contextClose = vi.fn(() => Promise.resolve());
    const context = {
      close: contextClose,
      newPage: () => Promise.resolve(page),
    } as unknown as BrowserContext;
    const browserClose = vi.fn(() => Promise.resolve());
    const browser = {
      close: browserClose,
      newContext: () => Promise.resolve(context),
    } as unknown as Browser;
    const launcher: PlaywrightLauncher = {
      launch: () => Promise.resolve(browser),
    };

    const session = await new PlaywrightBrowserSessionFactory(
      createLogger({ level: 'silent' }),
      launcher,
    ).open(true);
    await expect(session.probe(input, probeOptions)).rejects.toMatchObject({
      code: 'PROBE_FAILED',
    });
    await session.close();
    expect(pageClose).toHaveBeenCalledOnce();
    expect(contextClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });

  it.each([
    ['image', 'application/json', '/api/product', 10, false],
    ['font', 'application/json', '/api/product', 10, false],
    ['stylesheet', 'application/json', '/api/product', 10, false],
    ['media', 'application/json', '/api/product', 10, false],
    ['xhr', 'text/css', '/api/product', 10, false],
    ['xhr', 'application/json', '/health', 10, false],
    ['xhr', 'application/json', '/api/product', 1_001, false],
    ['xhr', 'application/json', '/api/product', 1_000, true],
  ] as const)(
    'body policy resource=%s content-type=%s url=%s length=%s',
    (resourceType, contentType, path, contentLength, expected) => {
      expect(
        shouldLoadResponseBody({
          resourceType,
          contentType,
          url: `https://example.test${path}`,
          contentLength,
          maxJsonBytes: 1_000,
          itemId: ITEM_ID,
          merchantId: MERCHANT_ID,
        }),
      ).toBe(expected);
    },
  );

  it('removes secrets and query strings while limiting diagnostics', () => {
    const messages = [
      'GET https://example.test/path?token=secret token=secret Bearer abc.def',
      'authorization: hidden',
      'third message',
    ];
    const sanitized = sanitizeDiagnosticMessages(messages, 2, 80);
    expect(sanitized).toHaveLength(2);
    expect(sanitized.join(' ')).not.toContain('secret');
    expect(sanitized.join(' ')).not.toContain('hidden');
    expect(sanitized[0]).not.toContain('?');
    expect(sanitized[0]).toContain('[Redacted]');
  });
});
