import { Command } from 'commander';

import type {
  CrawlBatchResult,
  InputValidationResult,
  ProbeResult,
} from '../domain/index.js';
import {
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
    .description('Processa sequencialmente um arquivo validado, sem retries.')
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
    .action(async (options: CrawlOptions) => {
      const limit =
        options.limit === undefined ? undefined : Number(options.limit);
      const timeoutMs = Number(options.timeout);
      const settleTimeoutMs = Number(options.settleTimeout);
      if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
        throw new Error('--limit deve ser um inteiro positivo.');
      }
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout deve ser um inteiro positivo.');
      }
      if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs <= 0) {
        throw new Error('--settle-timeout deve ser um inteiro positivo.');
      }
      const result = await dependencies.crawlBatch({
        inputPath: options.input,
        ...(limit === undefined ? {} : { limit }),
        headless: options.headed !== true,
        timeoutMs,
        settleTimeoutMs,
      });
      await dependencies.writeBatchReport(options.report, result);
      writeJson(program, result.summary);
      dependencies.setExitCode(
        result.summary.invalidRecords === 0 &&
          result.summary.failedRecords === 0
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
