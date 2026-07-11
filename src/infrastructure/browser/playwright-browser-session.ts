import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  chromium,
  errors,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from 'playwright';
import type { Logger } from 'pino';

import {
  InputOperationalError,
  type BrowserSessionFactory,
  type ManagedBrowserProbeOptions,
  type ManagedBrowserSession,
} from '../../application/index.js';
import type {
  DomSnapshot,
  PageProbe,
  ResponseCandidate,
  ValidInputRecord,
} from '../../domain/index.js';
import { sanitizeDiagnosticMessages } from './diagnostic-sanitizer.js';

const IGNORED_RESOURCE_TYPES = new Set([
  'image',
  'font',
  'stylesheet',
  'media',
]);
const CANDIDATE_URL_PATTERN = /product|catalog|item|merchant|menu/i;

export interface ResponseBodyPolicyInput {
  readonly resourceType: string;
  readonly contentType: string;
  readonly url: string;
  readonly contentLength: number | null;
  readonly maxJsonBytes: number;
  readonly itemId: string;
  readonly merchantId: string;
}

export function shouldLoadResponseBody(
  input: ResponseBodyPolicyInput,
): boolean {
  const ignoredResource = IGNORED_RESOURCE_TYPES.has(input.resourceType);
  const jsonContent = /(?:application|text)\/(?:[\w.+-]*\+)?json/i.test(
    input.contentType,
  );
  const urlCandidate =
    CANDIDATE_URL_PATTERN.test(input.url) ||
    input.url.includes(input.itemId) ||
    input.url.includes(input.merchantId);
  const declaredOversized =
    input.contentLength !== null && input.contentLength > input.maxJsonBytes;
  return !ignoredResource && jsonContent && urlCandidate && !declaredOversized;
}

export interface PlaywrightLauncher {
  launch(options: { readonly headless: boolean }): Promise<Browser>;
}

function sanitizedUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  return url.href;
}

function declaredContentLength(response: Response): number | null {
  const raw = response.headers()['content-length'];
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function containsExactItemId(
  value: unknown,
  itemId: string,
  depth = 0,
): boolean {
  if (depth > 10) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((child) => containsExactItemId(child, itemId, depth + 1));
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const object = value as Readonly<Record<string, unknown>>;
  for (const key of ['id', 'itemId', 'item_id']) {
    const candidate = object[key];
    if (
      typeof candidate === 'string' &&
      candidate.toLowerCase() === itemId.toLowerCase()
    ) {
      return true;
    }
  }
  return Object.values(object).some((child) =>
    containsExactItemId(child, itemId, depth + 1),
  );
}

export class PlaywrightBrowserSessionFactory implements BrowserSessionFactory {
  public constructor(
    private readonly logger: Logger,
    private readonly launcher: PlaywrightLauncher = chromium,
  ) {}

  public async open(headless: boolean): Promise<ManagedBrowserSession> {
    try {
      const browser = await this.launcher.launch({ headless });
      this.logger.info('Browser opened');
      return new PlaywrightManagedBrowserSession(browser, this.logger);
    } catch (error: unknown) {
      throw new InputOperationalError(
        'PROBE_FAILED',
        'Falha ao abrir o browser.',
        {
          cause: error,
        },
      );
    }
  }
}

export class PlaywrightManagedBrowserSession implements ManagedBrowserSession {
  private closed = false;

  public constructor(
    private readonly browser: Browser,
    private readonly logger: Logger,
  ) {}

  public async probe(
    input: ValidInputRecord,
    options: ManagedBrowserProbeOptions,
  ): Promise<PageProbe> {
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let traceDirectory: string | null = null;

    try {
      if (this.closed) {
        throw new Error('Browser session is closed.');
      }
      context = await this.browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      });
      page = await context.newPage();
      page.setDefaultTimeout(options.timeoutMs);

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const responseTasks: Promise<ResponseCandidate>[] = [];
      const requestStartedAt = new WeakMap<object, number>();
      let candidateSignalResolve: (() => void) | null = null;
      const candidateSignal = new Promise<void>((resolve) => {
        candidateSignalResolve = resolve;
      });
      let timedOut = false;

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) =>
        requestStartedAt.set(request, Date.now()),
      );
      page.on('response', (response) => {
        responseTasks.push(
          this.inspectResponse(
            response,
            input,
            options,
            requestStartedAt,
            () => {
              candidateSignalResolve?.();
            },
          ),
        );
      });

      if (options.trace) {
        traceDirectory = await mkdtemp(join(tmpdir(), 'ifood-probe-trace-'));
        await context.tracing.start({ screenshots: true, snapshots: true });
      }

      let mainResponse: Response | null = null;
      try {
        mainResponse = await page.goto(input.normalizedUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeoutMs,
        });
        await this.waitForSettleSignal(
          page,
          candidateSignal,
          options.settleTimeoutMs,
        );
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
        options.captureScreenshot
          ? page
              .screenshot({
                fullPage: true,
                timeout: Math.max(options.timeoutMs, 5_000),
              })
              .catch(() => new Uint8Array())
          : Promise.resolve(new Uint8Array()),
        this.readDomSnapshot(page),
        Promise.all([...responseTasks]),
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
        consoleErrors: sanitizeDiagnosticMessages(consoleErrors),
        pageErrors: sanitizeDiagnosticMessages(pageErrors),
        dom,
        timedOut,
        screenshot,
        trace,
      };
    } catch (error: unknown) {
      throw new InputOperationalError(
        'PROBE_FAILED',
        'Falha durante o probe da página.',
        { cause: error },
      );
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      if (traceDirectory !== null) {
        await rm(traceDirectory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.browser.close().catch(() => undefined);
    this.logger.info('Browser closed');
  }

  private async waitForSettleSignal(
    page: Page,
    candidateSignal: Promise<void>,
    settleTimeoutMs: number,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutSignal = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, settleTimeoutMs);
    });
    const domSignal = page
      .waitForFunction(
        () => {
          const body = document.body.innerText.toLowerCase();
          const hasProduct =
            document.querySelector(
              '[data-testid="product-title"], [data-testid="product-price"], [data-testid="normal-price"]',
            ) !== null;
          const hasTerminalState =
            /antes de continuarmos|pressione e segure|captcha|produto indisponível|item indisponível|loja (?:fechada|indisponível)|escolha seu endereço|informe sua localização/.test(
              body,
            );
          return hasProduct || hasTerminalState;
        },
        undefined,
        { timeout: settleTimeoutMs, polling: 50 },
      )
      .then(async (handle) => handle.dispose())
      .catch(() => undefined);
    try {
      await Promise.race([candidateSignal, domSignal, timeoutSignal]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private async readDomSnapshot(page: Page): Promise<DomSnapshot> {
    return page
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
      }));
  }

  private async inspectResponse(
    response: Response,
    input: ValidInputRecord,
    options: ManagedBrowserProbeOptions,
    startedAt: WeakMap<object, number>,
    notifyExactItem: () => void,
  ): Promise<ResponseCandidate> {
    const contentType = response.headers()['content-type'] ?? '';
    const contentLength = declaredContentLength(response);
    const rawUrl = response.url();
    const resourceType = response.request().resourceType();
    const urlCandidate =
      CANDIDATE_URL_PATTERN.test(rawUrl) ||
      rawUrl.includes(input.itemId) ||
      rawUrl.includes(input.merchantId);
    const jsonContent = /(?:application|text)\/(?:[\w.+-]*\+)?json/i.test(
      contentType,
    );
    const declaredOversized =
      contentLength !== null && contentLength > options.maxJsonBytes;
    const shouldReadBody = shouldLoadResponseBody({
      resourceType,
      contentType,
      url: rawUrl,
      contentLength,
      maxJsonBytes: options.maxJsonBytes,
      itemId: input.itemId,
      merchantId: input.merchantId,
    });

    let body: Uint8Array = new Uint8Array();
    if (shouldReadBody) {
      try {
        body = await response.body();
      } catch {
        // Redirects and aborted responses may not expose a body.
      }
    }

    const loadedOversized = body.byteLength > options.maxJsonBytes;
    let jsonPayload: unknown = null;
    let containsItem = false;
    if (shouldReadBody && !loadedOversized) {
      try {
        jsonPayload = JSON.parse(Buffer.from(body).toString('utf8')) as unknown;
        containsItem = containsExactItemId(jsonPayload, input.itemId);
        if (containsItem) {
          notifyExactItem();
        }
      } catch {
        jsonPayload = null;
      }
    }

    const durationMs = Math.max(
      0,
      Date.now() - (startedAt.get(response.request()) ?? Date.now()),
    );
    const summary = {
      url: sanitizedUrl(rawUrl),
      method: response.request().method(),
      status: response.status(),
      contentType,
      durationMs,
      approximateSizeBytes: contentLength ?? body.byteLength,
      possibleProductData: urlCandidate && (containsItem || jsonContent),
      payloadTruncated: declaredOversized || loadedOversized,
    };
    this.logger.debug({ response: summary }, 'Observed browser response');
    return { summary, jsonPayload };
  }
}
