import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import {
  createCli,
  runCli,
  type CliDependencies,
} from '../../../src/cli/program.js';
import type {
  InputValidationResult,
  ProbeResult,
} from '../../../src/domain/index.js';

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
    probeProduct: vi.fn(() => Promise.reject(new Error('not configured'))),
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
    expect(result.stdout).toContain('controlled single-product probing');
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

  it('maps probe-url options and prints the complete JSON result', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    const probeResult: ProbeResult = {
      runId: 'run-1',
      source: 'dom',
      pageState: 'PRODUCT_FOUND',
      product: {
        title: 'Produto',
        normal_price: 1000,
        discount_price: null,
        product_url:
          'https://www.ifood.com.br/delivery/local/loja/11111111-1111-4111-8111-111111111111?item=22222222-2222-4222-8222-222222222222',
        image_url: null,
        status: 'success',
        error_message: null,
      },
      artifactsDirectory: 'artifacts/probes/run-1',
      durationMs: 10,
    };
    vi.mocked(dependencies.probeProduct).mockResolvedValueOnce(probeResult);

    const result = await invokeCli(
      [
        'probe-url',
        '--url',
        probeResult.product.product_url,
        '--headed',
        '--timeout',
        '5000',
        '--artifacts-dir',
        'evidence',
        '--trace',
      ],
      dependencies,
    );

    expect(dependencies.probeProduct).toHaveBeenCalledWith({
      url: probeResult.product.product_url,
      headless: false,
      timeoutMs: 5000,
      artifactsDirectory: 'evidence',
      trace: true,
    });
    expect(JSON.parse(result.stdout)).toEqual(probeResult);
    expect(dependencies.setExitCode).toHaveBeenCalledWith(0);
  });

  it('rejects a non-positive probe timeout before opening the browser', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    await expect(
      invokeCli(
        ['probe-url', '--url', 'https://example.test', '--timeout', '0'],
        dependencies,
      ),
    ).rejects.toThrow('--timeout deve ser um inteiro positivo');
    expect(dependencies.probeProduct).not.toHaveBeenCalled();
  });
});
