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

function makeValidationResult(hasInvalidRecord = false): InputValidationResult {
  return {
    batch: { sourcePath: 'input.txt', format: 'txt', records: [] },
    validRecords: [],
    invalidRecords: hasInvalidRecord
      ? [
          {
            originalIndex: 0,
            lineNumber: 1,
            originalValue: 'invalid',
            errorCode: 'INVALID_URL',
            message: 'URL inválida.',
          },
        ]
      : [],
    duplicates: { fullUrls: [], itemIds: [], merchantItems: [] },
    storeGroups: [],
    summary: {
      totalRecords: hasInvalidRecord ? 1 : 0,
      validRecords: 0,
      invalidRecords: hasInvalidRecord ? 1 : 0,
      emptyRecords: 0,
      uniqueMerchants: 0,
      duplicateFullUrls: 0,
      duplicateItemIds: 0,
      duplicateMerchantItems: 0,
      uniqueUrls: 0,
      uniqueItemIds: 0,
      uniqueLocalities: 0,
      recordsByMerchant: {},
      recordsByLocality: {},
      errorsByCode: hasInvalidRecord ? { INVALID_URL: 1 } : {},
      durationMs: 5,
    },
  };
}

function makeDependencies(result: InputValidationResult): CliDependencies {
  return {
    validateInput: vi.fn(() => Promise.resolve(result)),
    writeReport: vi.fn(() => Promise.resolve()),
    setExitCode: vi.fn(),
  } satisfies CliDependencies;
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
    const validationResult = makeValidationResult();
    const dependencies = makeDependencies(validationResult);

    const result = await invokeCli(
      ['validate-input', '--input', 'input.txt'],
      dependencies,
    );

    expect(dependencies.validateInput).toHaveBeenCalledWith('input.txt');
    expect(dependencies.setExitCode).toHaveBeenCalledWith(0);
    expect(JSON.parse(result.stdout)).toEqual(validationResult.summary);
  });

  it('sets exit code 2 when at least one record is invalid', async () => {
    const dependencies = makeDependencies(makeValidationResult(true));

    await invokeCli(['validate-input', '--input', 'input.txt'], dependencies);

    expect(dependencies.setExitCode).toHaveBeenCalledWith(2);
  });

  it('writes the complete report when --report is provided', async () => {
    const validationResult = makeValidationResult();
    const dependencies = makeDependencies(validationResult);

    await invokeCli(
      [
        'validate-input',
        '--input',
        'input.txt',
        '--report',
        'artifacts/report.json',
      ],
      dependencies,
    );

    expect(dependencies.writeReport).toHaveBeenCalledWith(
      'artifacts/report.json',
      validationResult,
    );
  });

  it('propagates report write errors before setting a validation exit code', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    vi.mocked(dependencies.writeReport).mockRejectedValueOnce(
      new Error('disk full'),
    );

    await expect(
      invokeCli(
        ['validate-input', '--input', 'input.txt', '--report', 'report.json'],
        dependencies,
      ),
    ).rejects.toThrow('disk full');
    expect(dependencies.setExitCode).not.toHaveBeenCalled();
  });
});
