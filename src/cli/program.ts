import { Command } from 'commander';

import type { InputValidationResult, ProbeResult } from '../domain/index.js';
import {
  probeProduct,
  validateInputFile,
  writeValidationReport,
} from './composition.js';
import { VERSION } from './version.js';

interface ProbeOptions {
  readonly url: string;
  readonly headless: boolean;
  readonly timeoutMs: number;
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
}

const defaultDependencies: CliDependencies = {
  validateInput: validateInputFile,
  writeReport: writeValidationReport,
  setExitCode: (exitCode) => {
    process.exitCode = exitCode;
  },
  probeProduct,
};

interface ValidateInputOptions {
  readonly input: string;
  readonly report?: string;
}

interface ProbeUrlOptions {
  readonly url: string;
  readonly headed?: boolean;
  readonly timeout: string;
  readonly artifactsDir: string;
  readonly trace?: boolean;
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
      '--artifacts-dir <diretório>',
      'diretório base das evidências',
      'artifacts',
    )
    .option('--trace', 'salva um trace Playwright')
    .action(async (options: ProbeUrlOptions) => {
      const timeoutMs = Number(options.timeout);
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout deve ser um inteiro positivo.');
      }
      const result = await dependencies.probeProduct({
        url: options.url,
        headless: options.headed !== true,
        timeoutMs,
        artifactsDirectory: options.artifactsDir,
        trace: options.trace === true,
      });
      writeJson(program, result);
      dependencies.setExitCode(result.product.status === 'success' ? 0 : 2);
    });

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  dependencies: CliDependencies = defaultDependencies,
): Promise<void> {
  await createCli(VERSION, dependencies).parseAsync([...argv]);
}
