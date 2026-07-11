import { Command } from 'commander';

import type { InputValidationResult } from '../domain/index.js';
import { validateInputFile } from './composition.js';
import { VERSION } from './version.js';

export interface CliDependencies {
  readonly validateInput: (filePath: string) => Promise<InputValidationResult>;
}

const defaultDependencies: CliDependencies = {
  validateInput: validateInputFile,
};

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
    .action(async (options: { input: string }) => {
      const result = await dependencies.validateInput(options.input);
      const output = `${JSON.stringify(result.summary, null, 2)}\n`;
      const outputConfiguration = program.configureOutput();
      if (outputConfiguration.writeOut === undefined) {
        process.stdout.write(output);
      } else {
        outputConfiguration.writeOut(output);
      }
    });

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  dependencies: CliDependencies = defaultDependencies,
): Promise<void> {
  await createCli(VERSION, dependencies).parseAsync([...argv]);
}
