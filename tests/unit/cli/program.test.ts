import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import {
  createCli,
  runCli,
  type CliDependencies,
} from '../../../src/cli/program.js';
import type { InputValidationResult } from '../../../src/domain/index.js';

interface InvocationResult {
  readonly stderr: string;
  readonly stdout: string;
}

async function invokeCli(
  args: readonly string[],
  dependencies?: CliDependencies,
): Promise<InvocationResult> {
  let stdout = '';
  let stderr = '';
  const program =
    dependencies === undefined
      ? createCli('9.8.7')
      : createCli('9.8.7', dependencies);

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

  it('validates an input through an injected use case and prints its summary', async () => {
    const validationResult: InputValidationResult = {
      batch: { sourcePath: 'input.txt', format: 'txt', records: [] },
      validRecords: [],
      invalidRecords: [],
      duplicates: { fullUrls: [], itemIds: [], merchantItems: [] },
      storeGroups: [],
      summary: {
        totalRecords: 3,
        validRecords: 2,
        invalidRecords: 1,
        emptyRecords: 0,
        uniqueMerchants: 1,
        duplicateFullUrls: 0,
        duplicateItemIds: 0,
        duplicateMerchantItems: 0,
      },
    };
    const validateInput = vi.fn(
      (filePath: string): Promise<InputValidationResult> => {
        expect(filePath).toBe('input.txt');
        return Promise.resolve(validationResult);
      },
    );

    const result = await invokeCli(['validate-input', '--input', 'input.txt'], {
      validateInput,
    });

    expect(validateInput).toHaveBeenCalledOnce();
    expect(JSON.parse(result.stdout)).toEqual(validationResult.summary);
  });
});
