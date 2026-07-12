import { z } from 'zod';

const environmentBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return value;
}, z.boolean());

export const configSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CRAWLER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    CRAWLER_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
    CRAWLER_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(1_000),
    CRAWLER_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).default(30_000),
    CRAWLER_RETRY_JITTER_RATIO: z.coerce.number().min(0).max(1).default(0.2),
    CRAWLER_MIN_REQUEST_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(0)
      .default(500),
    CRAWLER_CIRCUIT_BREAKER_THRESHOLD: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(3),
    BROWSER_HEADLESS: environmentBoolean.default(true),
    INPUT_PATH: z.string().trim().min(1).default('./input'),
    OUTPUT_PATH: z.string().trim().min(1).default('./artifacts/output.jsonl'),
  })
  .superRefine((config, context) => {
    if (config.CRAWLER_RETRY_MAX_DELAY_MS < config.CRAWLER_RETRY_DELAY_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CRAWLER_RETRY_MAX_DELAY_MS'],
        message:
          'CRAWLER_RETRY_MAX_DELAY_MS deve ser maior ou igual ao delay base.',
      });
    }
  });

export type AppConfig = Readonly<{
  nodeEnv: z.infer<typeof configSchema>['NODE_ENV'];
  logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
  crawlerConcurrency: number;
  crawlerMaxRetries: number;
  crawlerRetryDelayMs: number;
  crawlerRetryMaxDelayMs: number;
  crawlerRetryJitterRatio: number;
  crawlerMinRequestIntervalMs: number;
  crawlerCircuitBreakerThreshold: number;
  browserHeadless: boolean;
  inputPath: string;
  outputPath: string;
}>;

export function loadConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AppConfig {
  const parsed = configSchema.parse(environment);

  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    crawlerConcurrency: parsed.CRAWLER_CONCURRENCY,
    crawlerMaxRetries: parsed.CRAWLER_MAX_RETRIES,
    crawlerRetryDelayMs: parsed.CRAWLER_RETRY_DELAY_MS,
    crawlerRetryMaxDelayMs: parsed.CRAWLER_RETRY_MAX_DELAY_MS,
    crawlerRetryJitterRatio: parsed.CRAWLER_RETRY_JITTER_RATIO,
    crawlerMinRequestIntervalMs: parsed.CRAWLER_MIN_REQUEST_INTERVAL_MS,
    crawlerCircuitBreakerThreshold: parsed.CRAWLER_CIRCUIT_BREAKER_THRESHOLD,
    browserHeadless: parsed.BROWSER_HEADLESS,
    inputPath: parsed.INPUT_PATH,
    outputPath: parsed.OUTPUT_PATH,
  };
}
