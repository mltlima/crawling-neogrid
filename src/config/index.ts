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

export const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CRAWLER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  CRAWLER_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  CRAWLER_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(1_000),
  BROWSER_HEADLESS: environmentBoolean.default(true),
  INPUT_PATH: z.string().trim().min(1).default('./input'),
  OUTPUT_PATH: z.string().trim().min(1).default('./artifacts/output.jsonl'),
});

export type AppConfig = Readonly<{
  nodeEnv: z.infer<typeof configSchema>['NODE_ENV'];
  logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
  crawlerConcurrency: number;
  crawlerMaxRetries: number;
  crawlerRetryDelayMs: number;
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
    browserHeadless: parsed.BROWSER_HEADLESS,
    inputPath: parsed.INPUT_PATH,
    outputPath: parsed.OUTPUT_PATH,
  };
}
