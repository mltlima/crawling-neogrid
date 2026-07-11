import { Command } from 'commander';

import type { InputValidationResult } from '../domain/index.js';
import { validateInputFile, writeValidationReport } from './composition.js';
import { VERSION } from './version.js';

export interface CliDependencies {
  readonly validateInput: (filePath: string) => Promise<InputValidationResult>;
  readonly writeReport: (
    filePath: string,
    report: InputValidationResult,
  ) => Promise<void>;
  readonly setExitCode: (exitCode: 0 | 2) => void;
}

const defaultDependencies: CliDependencies = {
  validateInput: validateInputFile,
  writeReport: writeValidationReport,
  setExitCode: (exitCode) => {
    process.exitCode = exitCode;
  },
};

interface ValidateInputOptions {
  readonly input: string;
  readonly report?: string;
}

export function createCli(
  version: string = VERSION,
  dependencies: CliDependencies = defaultDependencies,
): Command {
  const program = new Command();

  program
    .name('ifood-crawler')
    .description(
      'Batch crawler CLI (input validation only; crawling is not implemented).',
    )
    .version(version)
    .showHelpAfterError()
    .action(() => {
      program.outputHelp();
    });

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
      const output = `${JSON.stringify(result.summary, null, 2)}\n`;
      const outputConfiguration = program.configureOutput();
      if (outputConfiguration.writeOut === undefined) {
        process.stdout.write(output);
      } else {
        outputConfiguration.writeOut(output);
      }
      dependencies.setExitCode(result.invalidRecords.length === 0 ? 0 : 2);
    });

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  dependencies: CliDependencies = defaultDependencies,
): Promise<void> {
  await createCli(VERSION, dependencies).parseAsync([...argv]);
}
