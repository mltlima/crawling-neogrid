import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, errors, type Response } from 'playwright';
import type { Logger } from 'pino';

import {
  InputOperationalError,
  type BrowserProbeOptions,
  type BrowserSession,
} from '../../application/index.js';
import type { PageProbe, ResponseCandidate } from '../../domain/index.js';

function sanitizedUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  return url.href;
}

export class PlaywrightBrowserSession implements BrowserSession {
  public constructor(private readonly logger: Logger) {}

  public async probe(options: BrowserProbeOptions): Promise<PageProbe> {
    const browser = await chromium.launch({ headless: options.headless });
    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const responseTasks: Promise<ResponseCandidate>[] = [];
    const requestStartedAt = new WeakMap<object, number>();
    let traceDirectory: string | null = null;
    let timedOut = false;

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requestStartedAt.set(request, Date.now()));
    page.on('response', (response) => {
      responseTasks.push(
        this.inspectResponse(response, options, requestStartedAt),
      );
    });

    try {
      if (options.trace) {
        traceDirectory = await mkdtemp(join(tmpdir(), 'ifood-probe-trace-'));
        await context.tracing.start({ screenshots: true, snapshots: true });
      }
      let mainResponse: Response | null = null;
      try {
        mainResponse = await page.goto(options.input.normalizedUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeoutMs,
        });
        await page.waitForTimeout(100);
      } catch (error: unknown) {
        if (error instanceof errors.TimeoutError) {
          timedOut = true;
          await page.evaluate(() => window.stop()).catch(() => undefined);
        } else {
          throw error;
        }
      }
      const [html, screenshot, dom, responses] = await Promise.all([
        page.content().catch(() => ''),
        page
          .screenshot({
            fullPage: true,
            timeout: Math.max(options.timeoutMs, 5_000),
          })
          .catch(() => new Uint8Array()),
        page
          .evaluate(() => {
            const text = (selector: string): string | null => {
              const element = document.querySelector(selector);
              return element === null ? null : element.textContent.trim();
            };
            const attribute = (selector: string, name: string): string | null =>
              document.querySelector(selector)?.getAttribute(name) ?? null;
            return {
              title:
                text('[data-testid="product-title"]') ??
                text('h1') ??
                attribute('meta[property="og:title"]', 'content'),
              normalPrice:
                text('[data-testid="normal-price"]') ??
                text('[data-testid="product-price"]'),
              discountPrice: text('[data-testid="discount-price"]'),
              imageUrl:
                attribute('[data-testid="product-image"]', 'src') ??
                attribute('meta[property="og:image"]', 'content'),
              bodyText: document.body.innerText,
            };
          })
          .catch(() => ({
            title: null,
            normalPrice: null,
            discountPrice: null,
            imageUrl: null,
            bodyText: '',
          })),
        Promise.all(responseTasks),
      ]);
      let trace: Uint8Array | null = null;
      if (options.trace && traceDirectory !== null) {
        const tracePath = join(traceDirectory, 'trace.zip');
        await context.tracing.stop({ path: tracePath });
        trace = await readFile(tracePath);
      }
      return {
        finalUrl: page.url(),
        httpStatus: mainResponse?.status() ?? null,
        html,
        responses,
        consoleErrors,
        pageErrors,
        dom,
        timedOut,
        screenshot,
        trace,
      };
    } catch (error: unknown) {
      throw new InputOperationalError(
        'PROBE_FAILED',
        'Falha durante o probe da página.',
        {
          cause: error,
        },
      );
    } finally {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      if (traceDirectory !== null) {
        await rm(traceDirectory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }

  private async inspectResponse(
    response: Response,
    options: BrowserProbeOptions,
    startedAt: WeakMap<object, number>,
  ): Promise<ResponseCandidate> {
    const contentType = response.headers()['content-type'] ?? '';
    let body: Uint8Array = new Uint8Array();
    try {
      body = await response.body();
    } catch {
      // Redirects and aborted responses may not expose a body.
    }
    const oversized = body.byteLength > options.maxJsonBytes;
    const bodyText = oversized ? '' : Buffer.from(body).toString('utf8');
    const possibleProductData =
      /product|catalog|item/i.test(response.url()) ||
      bodyText.includes(options.input.itemId) ||
      bodyText.includes(options.input.merchantId);
    let jsonPayload: unknown = null;
    if (/json/i.test(contentType) && !oversized && possibleProductData) {
      try {
        jsonPayload = JSON.parse(bodyText) as unknown;
      } catch {
        jsonPayload = null;
      }
    }
    const durationMs = Math.max(
      0,
      Date.now() - (startedAt.get(response.request()) ?? Date.now()),
    );
    const summary = {
      url: sanitizedUrl(response.url()),
      method: response.request().method(),
      status: response.status(),
      contentType,
      durationMs,
      approximateSizeBytes: body.byteLength,
      possibleProductData,
      payloadTruncated: oversized,
    };
    this.logger.debug({ response: summary }, 'Observed browser response');
    return { summary, jsonPayload };
  }
}
