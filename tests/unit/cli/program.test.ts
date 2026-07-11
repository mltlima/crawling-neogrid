import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { createCli, runCli } from '../../../src/cli/program.js';

interface InvocationResult {
  readonly stderr: string;
  readonly stdout: string;
}

async function invokeCli(args: readonly string[]): Promise<InvocationResult> {
  let stdout = '';
  let stderr = '';
  const program = createCli('9.8.7');

  program.exitOverride();
  program.configureOutput({
    writeErr: (text) => {
      stderr += text;
    },
    writeOut: (text) => {
      stdout += text;
    },
  });

  try {
    await program.parseAsync([...args], { from: 'user' });
  } catch (error: unknown) {
    const expectedExitCodes = ['commander.helpDisplayed', 'commander.version'];
    if (
      !(error instanceof CommanderError) ||
      !expectedExitCodes.includes(error.code)
    ) {
      throw error;
    }
  }

  return { stderr, stdout };
}

describe('CLI', () => {
  it('prints help without starting a crawl', async () => {
    const result = await invokeCli(['--help']);

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: ifood-crawler [options]');
    expect(result.stdout).toContain('crawling is not implemented');
  });

  it('prints the package version', async () => {
    const result = await invokeCli(['--version']);

    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('9.8.7');
  });

  it('prints help when called without arguments', async () => {
    const result = await invokeCli([]);

    expect(result.stdout).toContain('Usage: ifood-crawler [options]');
  });

  it('runs with a process-style argument vector', async () => {
    await expect(runCli(['node', 'ifood-crawler'])).resolves.toBeUndefined();
  });
});
