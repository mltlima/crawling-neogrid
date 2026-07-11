import { Command } from 'commander';

import { VERSION } from './version.js';

export function createCli(version: string = VERSION): Command {
  const program = new Command();

  program
    .name('ifood-crawler')
    .description(
      'Batch crawler CLI (project foundation; crawling is not implemented).',
    )
    .version(version)
    .showHelpAfterError()
    .action(() => {
      program.outputHelp();
    });

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
): Promise<void> {
  await createCli().parseAsync([...argv]);
}
