import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { loadConfig } from '../../../src/config/index.js';

describe('loadConfig', () => {
  it('provides safe local defaults', () => {
    expect(loadConfig({})).toEqual({
      browserHeadless: true,
      crawlerConcurrency: 2,
      crawlerMaxRetries: 3,
      crawlerRetryDelayMs: 1_000,
      crawlerRetryMaxDelayMs: 30_000,
      crawlerRetryJitterRatio: 0.2,
      crawlerMinRequestIntervalMs: 500,
      crawlerCircuitBreakerThreshold: 3,
      inputPath: './input',
      logLevel: 'info',
      nodeEnv: 'development',
      outputPath: './artifacts/output.jsonl',
    });
  });

  it('coerces and maps supported environment values', () => {
    const config = loadConfig({
      BROWSER_HEADLESS: 'false',
      CRAWLER_CONCURRENCY: '5',
      CRAWLER_MAX_RETRIES: '0',
      CRAWLER_RETRY_DELAY_MS: '250',
      CRAWLER_RETRY_MAX_DELAY_MS: '5000',
      CRAWLER_RETRY_JITTER_RATIO: '0.5',
      CRAWLER_MIN_REQUEST_INTERVAL_MS: '25',
      CRAWLER_CIRCUIT_BREAKER_THRESHOLD: '8',
      INPUT_PATH: './custom-input',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'test',
      OUTPUT_PATH: './custom-output/results.jsonl',
    });

    expect(config).toMatchObject({
      browserHeadless: false,
      crawlerConcurrency: 5,
      crawlerMaxRetries: 0,
      crawlerRetryDelayMs: 250,
      crawlerRetryMaxDelayMs: 5000,
      crawlerRetryJitterRatio: 0.5,
      crawlerMinRequestIntervalMs: 25,
      crawlerCircuitBreakerThreshold: 8,
      logLevel: 'debug',
      nodeEnv: 'test',
    });
  });

  it.each([
    { CRAWLER_CONCURRENCY: '0' },
    { CRAWLER_MAX_RETRIES: '11' },
    { CRAWLER_RETRY_JITTER_RATIO: '1.1' },
    { CRAWLER_RETRY_MAX_DELAY_MS: '500', CRAWLER_RETRY_DELAY_MS: '1000' },
    { CRAWLER_CIRCUIT_BREAKER_THRESHOLD: '0' },
    { BROWSER_HEADLESS: 'sometimes' },
    { LOG_LEVEL: 'verbose' },
  ])('rejects invalid environment: %j', (environment) => {
    expect(() => loadConfig(environment)).toThrow(ZodError);
  });
});
