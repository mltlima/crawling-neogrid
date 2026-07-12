import { describe, expect, it } from 'vitest';

import {
  RequestPacer,
  SafetyCircuitBreaker,
  calculateRetryDelay,
  isRetryableFailure,
  parseRetryAfter,
} from '../../../src/application/index.js';
import type { CrawlItemResult } from '../../../src/domain/index.js';
import {
  ITEM_ID,
  MERCHANT_ID,
  makeIfoodUrl,
} from '../../fixtures/input-values.js';

function result(pageState: CrawlItemResult['pageState']): CrawlItemResult {
  const attempt = {
    attemptNumber: 1,
    pageState,
    httpStatus: pageState === 'HTTP_ERROR' ? 503 : 429,
    operationalErrorCode: null,
    durationMs: 1,
    retryable: false,
    retryScheduled: false,
    retryDelayMs: null,
    browserGeneration: 0,
  } as const;
  return {
    originalIndex: 0,
    lineNumber: 1,
    merchantId: MERCHANT_ID,
    itemId: ITEM_ID,
    source: 'none',
    pageState,
    product: {
      title: null,
      normal_price: null,
      discount_price: null,
      product_url: makeIfoodUrl(),
      image_url: null,
      status: 'error',
      error_message: 'Falha.',
    },
    durationMs: 1,
    operationalErrorCode: null,
    httpStatus: attempt.httpStatus,
    attempts: [attempt],
    attemptCount: 1,
    retryCount: 0,
    recoveredAfterRetry: false,
  };
}

describe('resilience services', () => {
  it.each([
    [0, 800],
    [0.5, 900],
    [0.999, 1000],
  ])('calculates bounded jitter for random %s', (random, expected) => {
    expect(
      calculateRetryDelay(0, null, {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        jitterRatio: 0.2,
        random: () => random,
      }),
    ).toBe(expected);
  });

  it('caps exponential overflow and respects a larger Retry-After', () => {
    expect(
      calculateRetryDelay(10_000, 4000, {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        jitterRatio: 0,
        random: () => 0,
      }),
    ).toBe(5000);
    expect(parseRetryAfter('3', 0, 5000)).toBe(3000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:04 GMT', 0, 5000)).toBe(
      4000,
    );
    expect(parseRetryAfter('invalid', 0, 5000)).toBeNull();
  });

  it('paces concurrent callers globally in FIFO order with a fake clock', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const pacer = new RequestPacer(100, {
      now: (): number => now,
      sleep: (delay): Promise<void> => {
        sleeps.push(delay);
        now += delay;
        return Promise.resolve();
      },
    });
    await Promise.all([pacer.wait(), pacer.wait(), pacer.wait()]);
    expect(sleeps).toEqual([100, 100]);
  });

  it('opens once after consecutive systemic failures but not individual unavailability', () => {
    const breaker = new SafetyCircuitBreaker(2);
    breaker.record(result('PRODUCT_UNAVAILABLE'), false);
    expect(breaker.opened).toBe(false);
    breaker.record(result('ACCESS_BLOCKED'), false);
    breaker.record(result('ACCESS_BLOCKED'), false);
    expect(breaker.reason).toBe('ACCESS_BLOCKED_THRESHOLD');
    breaker.openForRecoveryFailure();
    expect(breaker.reason).toBe('ACCESS_BLOCKED_THRESHOLD');
  });

  it('retries 429 and 5xx but rejects terminal states', () => {
    expect(
      isRetryableFailure({
        result: result('RATE_LIMITED'),
        browserConnected: true,
      }),
    ).toBe(true);
    expect(
      isRetryableFailure({
        result: result('HTTP_ERROR'),
        browserConnected: true,
      }),
    ).toBe(true);
    for (const state of [
      'ACCESS_BLOCKED',
      'LOCATION_REQUIRED',
      'PRODUCT_UNAVAILABLE',
      'PARSER_ERROR',
    ] as const) {
      expect(
        isRetryableFailure({ result: result(state), browserConnected: true }),
      ).toBe(false);
    }
  });
});
