import { Command } from 'commander';

import type {
  CrawlBatchResult,
  InputValidationResult,
  ProbeResult,
} from '../domain/index.js';
import {
  appConfig,
  crawlBatch,
  probeProduct,
  validateInputFile,
  writeBatchReport,
  writeValidationReport,
} from './composition.js';
import { VERSION } from './version.js';

interface ProbeOptions {
  readonly url: string;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly artifactsDirectory: string;
  readonly trace: boolean;
}

export interface CliDependencies {
  readonly validateInput: (filePath: string) => Promise<InputValidationResult>;
  readonly writeReport: (
    filePath: string,
    report: InputValidationResult,
  ) => Promise<void>;
  readonly setExitCode: (exitCode: 0 | 2) => void;
  readonly probeProduct: (options: ProbeOptions) => Promise<ProbeResult>;
  readonly crawlBatch: (options: {
    readonly inputPath: string;
    readonly limit?: number;
    readonly headless: boolean;
    readonly timeoutMs: number;
    readonly settleTimeoutMs: number;
    readonly concurrency: number;
    readonly maxRetries: number;
    readonly retryDelayMs: number;
    readonly retryMaxDelayMs: number;
    readonly retryJitterRatio: number;
    readonly minRequestIntervalMs: number;
    readonly circuitBreakerThreshold: number;
  }) => Promise<CrawlBatchResult>;
  readonly writeBatchReport: (
    filePath: string,
    report: CrawlBatchResult,
  ) => Promise<void>;
}

const defaultDependencies: CliDependencies = {
  validateInput: validateInputFile,
  writeReport: writeValidationReport,
  setExitCode: (exitCode) => {
    process.exitCode = exitCode;
  },
  probeProduct,
  crawlBatch,
  writeBatchReport,
};

interface ValidateInputOptions {
  readonly input: string;
  readonly report?: string;
}

interface ProbeUrlOptions {
  readonly url: string;
  readonly headed?: boolean;
  readonly timeout: string;
  readonly settleTimeout: string;
  readonly artifactsDir: string;
  readonly trace?: boolean;
}

interface CrawlOptions {
  readonly input: string;
  readonly report: string;
  readonly limit?: string;
  readonly headed?: boolean;
  readonly timeout: string;
  readonly settleTimeout: string;
  readonly concurrency: string;
  readonly maxRetries: string;
  readonly retryDelay: string;
  readonly retryMaxDelay: string;
  readonly retryJitter: string;
  readonly minRequestInterval: string;
  readonly circuitBreakerThreshold: string;
}

function writeJson(program: Command, value: unknown): void {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  const configuration = program.configureOutput();
  if (configuration.writeOut === undefined) {
    process.stdout.write(output);
  } else {
    configuration.writeOut(output);
  }
}

export function createCli(
  version: string = VERSION,
  dependencies: CliDependencies = defaultDependencies,
): Command {
  const program = new Command();
  program
    .name('ifood-crawler')
    .description('Batch crawler CLI with controlled single-product probing.')
    .version(version)
    .showHelpAfterError()
    .action(() => program.outputHelp());

  program
    .command('validate-input')
    .description('Valida e resume um arquivo de entrada sem acessar o iFood.')
    .requiredOption(
      '-i, --input <arquivo>',
      'arquivo .xlsx, .csv, .txt ou .json',
    )
    .option('--report <arquivo>', 'salva o relatório completo em JSON')
    .action(async (options: ValidateInputOptions) => {
      const result = await dependencies.validateInput(options.input);
      if (options.report !== undefined) {
        await dependencies.writeReport(options.report, result);
      }
      writeJson(program, result.summary);
      dependencies.setExitCode(result.invalidRecords.length === 0 ? 0 : 2);
    });

  program
    .command('probe-url')
    .description('Investiga um único produto com Playwright.')
    .requiredOption('--url <url>', 'URL de produto do iFood')
    .option('--headed', 'exibe o navegador durante o probe')
    .option('--timeout <ms>', 'timeout de navegação em milissegundos', '30000')
    .option(
      '--settle-timeout <ms>',
      'espera máxima por um sinal terminal da página',
      '5000',
    )
    .option(
      '--artifacts-dir <diretório>',
      'diretório base das evidências',
      'artifacts',
    )
    .option('--trace', 'salva um trace Playwright')
    .action(async (options: ProbeUrlOptions) => {
      const timeoutMs = Number(options.timeout);
      const settleTimeoutMs = Number(options.settleTimeout);
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout deve ser um inteiro positivo.');
      }
      if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs <= 0) {
        throw new Error('--settle-timeout deve ser um inteiro positivo.');
      }
      const result = await dependencies.probeProduct({
        url: options.url,
        headless: options.headed !== true,
        timeoutMs,
        settleTimeoutMs,
        artifactsDirectory: options.artifactsDir,
        trace: options.trace === true,
      });
      writeJson(program, result);
      dependencies.setExitCode(result.product.status === 'success' ? 0 : 2);
    });

  program
    .command('crawl')
    .description(
      'Processa um arquivo com concorrência limitada e retries seletivos.',
    )
    .requiredOption(
      '-i, --input <arquivo>',
      'arquivo .xlsx, .csv, .txt ou .json',
    )
    .option(
      '--report <arquivo>',
      'relatório técnico intermediário',
      './artifacts/batch-report.json',
    )
    .option('--limit <quantidade>', 'limita os registros válidos processados')
    .option('--headed', 'exibe o navegador durante o lote')
    .option('--timeout <ms>', 'timeout de navegação em milissegundos', '30000')
    .option('--settle-timeout <ms>', 'espera máxima por sinal terminal', '5000')
    .option(
      '--concurrency <quantidade>',
      'máximo de itens simultâneos',
      String(appConfig.crawlerConcurrency),
    )
    .option(
      '--max-retries <quantidade>',
      'tentativas adicionais',
      String(appConfig.crawlerMaxRetries),
    )
    .option(
      '--retry-delay <ms>',
      'delay base do backoff',
      String(appConfig.crawlerRetryDelayMs),
    )
    .option(
      '--retry-max-delay <ms>',
      'teto do backoff',
      String(appConfig.crawlerRetryMaxDelayMs),
    )
    .option(
      '--retry-jitter <razão>',
      'jitter entre 0 e 1',
      String(appConfig.crawlerRetryJitterRatio),
    )
    .option(
      '--min-request-interval <ms>',
      'intervalo global entre tentativas',
      String(appConfig.crawlerMinRequestIntervalMs),
    )
    .option(
      '--circuit-breaker-threshold <quantidade>',
      'limite de falhas sistêmicas consecutivas',
      String(appConfig.crawlerCircuitBreakerThreshold),
    )
    .action(async (options: CrawlOptions) => {
      const limit =
        options.limit === undefined ? undefined : Number(options.limit);
      const timeoutMs = Number(options.timeout);
      const settleTimeoutMs = Number(options.settleTimeout);
      const concurrency = Number(options.concurrency);
      const maxRetries = Number(options.maxRetries);
      const retryDelayMs = Number(options.retryDelay);
      const retryMaxDelayMs = Number(options.retryMaxDelay);
      const retryJitterRatio = Number(options.retryJitter);
      const minRequestIntervalMs = Number(options.minRequestInterval);
      const circuitBreakerThreshold = Number(options.circuitBreakerThreshold);
      if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
        throw new Error('--limit deve ser um inteiro positivo.');
      }
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout deve ser um inteiro positivo.');
      }
      if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs <= 0) {
        throw new Error('--settle-timeout deve ser um inteiro positivo.');
      }
      if (
        !Number.isInteger(concurrency) ||
        concurrency < 1 ||
        concurrency > 20
      ) {
        throw new Error('--concurrency deve ser um inteiro entre 1 e 20.');
      }
      if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
        throw new Error('--max-retries deve ser um inteiro entre 0 e 10.');
      }
      if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
        throw new Error('--retry-delay deve ser um inteiro não negativo.');
      }
      if (
        !Number.isInteger(retryMaxDelayMs) ||
        retryMaxDelayMs < retryDelayMs
      ) {
        throw new Error(
          '--retry-max-delay deve ser inteiro e maior ou igual ao delay base.',
        );
      }
      if (
        !Number.isFinite(retryJitterRatio) ||
        retryJitterRatio < 0 ||
        retryJitterRatio > 1
      ) {
        throw new Error('--retry-jitter deve estar entre 0 e 1.');
      }
      if (!Number.isInteger(minRequestIntervalMs) || minRequestIntervalMs < 0) {
        throw new Error(
          '--min-request-interval deve ser um inteiro não negativo.',
        );
      }
      if (
        !Number.isInteger(circuitBreakerThreshold) ||
        circuitBreakerThreshold < 1
      ) {
        throw new Error(
          '--circuit-breaker-threshold deve ser um inteiro positivo.',
        );
      }
      const result = await dependencies.crawlBatch({
        inputPath: options.input,
        ...(limit === undefined ? {} : { limit }),
        headless: options.headed !== true,
        timeoutMs,
        settleTimeoutMs,
        concurrency,
        maxRetries,
        retryDelayMs,
        retryMaxDelayMs,
        retryJitterRatio,
        minRequestIntervalMs,
        circuitBreakerThreshold,
      });
      await dependencies.writeBatchReport(options.report, result);
      writeJson(program, result.summary);
      dependencies.setExitCode(
        result.summary.invalidRecords === 0 &&
          result.summary.failedRecords === 0 &&
          result.summary.skippedRecords === 0 &&
          !result.summary.circuitBreakerOpened
          ? 0
          : 2,
      );
    });

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  dependencies: CliDependencies = defaultDependencies,
): Promise<void> {
  await createCli(VERSION, dependencies).parseAsync([...argv]);
}
