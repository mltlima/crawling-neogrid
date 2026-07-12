import {
  crawlItemResultSchema,
  type CrawlAttempt,
  type CrawlItemResult,
  type ValidInputRecord,
} from '../../domain/index.js';
import {
  calculateRetryDelay,
  type RetryDelayOptions,
} from '../services/retry-delay.js';
import { isRetryableFailure } from '../services/retry-policy.js';
import type { RequestPacer } from '../services/request-pacer.js';
import type {
  ManagedBrowserProbeOptions,
  ManagedBrowserSession,
} from '../ports/browser-session.js';
import type { CrawlProductCollector } from './crawl-product.js';

export interface BrowserLease {
  readonly session: ManagedBrowserSession;
  readonly generation: number;
}
export interface RecoverableBrowser {
  acquire(): Promise<BrowserLease>;
  invalidate(generation: number): Promise<void>;
}
export interface RetryExecutionOptions
  extends ManagedBrowserProbeOptions, Omit<RetryDelayOptions, 'random'> {
  readonly maxRetries: number;
  readonly random: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
}

export interface RetriedCrawlProduct {
  readonly result: CrawlItemResult;
  readonly retriesExhausted: boolean;
}

export class BrowserRecoveryError extends Error {
  public constructor() {
    super('Falha ao recuperar o browser.');
    this.name = 'BrowserRecoveryError';
  }
}

export class CrawlProductWithRetryUseCase {
  public constructor(
    private readonly browser: RecoverableBrowser,
    private readonly collector: CrawlProductCollector,
    private readonly pacer: RequestPacer,
  ) {}

  public async execute(
    input: ValidInputRecord,
    options: RetryExecutionOptions,
  ): Promise<RetriedCrawlProduct> {
    const attempts: CrawlAttempt[] = [];
    let finalResult: CrawlItemResult | null = null;
    let retriesExhausted = false;
    for (
      let attemptIndex = 0;
      attemptIndex <= options.maxRetries;
      attemptIndex += 1
    ) {
      await this.pacer.wait();
      let lease: BrowserLease;
      try {
        lease = await this.browser.acquire();
      } catch {
        throw new BrowserRecoveryError();
      }
      const collected = await this.collector.execute(
        lease.session,
        input,
        options,
      );
      finalResult = collected.result;
      const connected = lease.session.isConnected?.() ?? true;
      const retryable = isRetryableFailure({
        result: finalResult,
        browserConnected: connected,
      });
      const retryScheduled = retryable && attemptIndex < options.maxRetries;
      const retryDelayMs = retryScheduled
        ? calculateRetryDelay(
            attemptIndex,
            collected.page?.retryAfterMs ?? null,
            options,
          )
        : null;
      attempts.push({
        attemptNumber: attemptIndex + 1,
        pageState: finalResult.pageState,
        httpStatus: finalResult.httpStatus,
        operationalErrorCode: finalResult.operationalErrorCode,
        durationMs: finalResult.durationMs,
        retryable,
        retryScheduled,
        retryDelayMs,
        browserGeneration: lease.generation,
      });
      if (!retryScheduled) {
        retriesExhausted = retryable;
        break;
      }
      if (!connected) {
        try {
          await this.browser.invalidate(lease.generation);
          lease = await this.browser.acquire();
        } catch {
          throw new BrowserRecoveryError();
        }
      }
      if (retryDelayMs !== null && retryDelayMs > 0) {
        await options.sleep(retryDelayMs);
      }
    }
    if (finalResult === null) {
      throw new Error('Nenhuma tentativa executada.');
    }
    const retryCount = Math.max(0, attempts.length - 1);
    return {
      result: crawlItemResultSchema.parse({
        ...finalResult,
        attempts,
        attemptCount: attempts.length,
        retryCount,
        recoveredAfterRetry:
          retryCount > 0 && finalResult.product.status === 'success',
      }),
      retriesExhausted,
    };
  }
}
