import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import {
  createCli,
  runCli,
  type CliDependencies,
} from '../../../src/cli/program.js';
import type {
  CrawlBatchResult,
  InputValidationResult,
  ProbeResult,
} from '../../../src/domain/index.js';

function makeBatchResult(
  failedRecords = 0,
  invalidRecords = 0,
): CrawlBatchResult {
  return {
    runId: 'batch-1',
    source: { fileName: 'input.txt', format: 'txt' },
    invalidRecords: [],
    skippedInputs: [],
    results: [],
    summary: {
      totalRecords: invalidRecords,
      validRecords: 0,
      invalidRecords,
      selectedRecords: 0,
      processedRecords: failedRecords,
      successfulRecords: 0,
      failedRecords,
      successRatePercent: 0,
      recordsByPageState: {},
      recordsBySource: {},
      recordsByOperationalError: {},
      durationMs: 10,
      configuredConcurrency: 1,
      maxObservedConcurrency: 0,
      totalAttempts: 0,
      retriedRecords: 0,
      retriesPerformed: 0,
      recoveredRecords: 0,
      exhaustedRetries: 0,
      skippedRecords: 0,
      browserRestarts: 0,
      circuitBreakerOpened: false,
      circuitBreakerReason: null,
    },
  };
}

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
    crawlBatch: vi.fn(() => Promise.reject(new Error('not configured'))),
    writeBatchReport: vi.fn(() => Promise.resolve()),
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
    expect(result.stdout).toContain('crawl');
  });

  it('documents every crawl option in command help', () => {
    const program = createCli('9.8.7');
    const result =
      program.commands
        .find((command) => command.name() === 'crawl')
        ?.helpInformation() ?? '';
    for (const option of [
      '--input',
      '--report',
      '--limit',
      '--headed',
      '--timeout',
      '--settle-timeout',
      '--concurrency',
      '--max-retries',
      '--retry-delay',
      '--retry-max-delay',
      '--retry-jitter',
      '--min-request-interval',
      '--circuit-breaker-threshold',
    ]) {
      expect(result).toContain(option);
    }
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
      settleTimeoutMs: 5000,
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

  it('keeps trace disabled and uses the default settle timeout', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    const probeResult: ProbeResult = {
      runId: 'run-defaults',
      source: 'none',
      pageState: 'UNKNOWN_PAGE_STATE',
      product: {
        title: null,
        normal_price: null,
        discount_price: null,
        product_url:
          'https://www.ifood.com.br/delivery/local/loja/11111111-1111-4111-8111-111111111111?item=22222222-2222-4222-8222-222222222222',
        image_url: null,
        status: 'error',
        error_message: 'Não extraído.',
      },
      artifactsDirectory: 'artifacts/probes/run-defaults',
      durationMs: 1,
    };
    vi.mocked(dependencies.probeProduct).mockResolvedValueOnce(probeResult);
    await invokeCli(
      ['probe-url', '--url', probeResult.product.product_url],
      dependencies,
    );
    expect(dependencies.probeProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: false,
        headless: true,
        settleTimeoutMs: 5000,
      }),
    );
  });

  it('applies crawl defaults, writes the report and prints only its summary', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    const batch = makeBatchResult();
    vi.mocked(dependencies.crawlBatch).mockResolvedValueOnce(batch);
    const result = await invokeCli(
      ['crawl', '--input', 'input.txt'],
      dependencies,
    );
    expect(dependencies.crawlBatch).toHaveBeenCalledWith({
      inputPath: 'input.txt',
      headless: true,
      timeoutMs: 30000,
      settleTimeoutMs: 5000,
      concurrency: 2,
      maxRetries: 3,
      retryDelayMs: 1000,
      retryMaxDelayMs: 30000,
      retryJitterRatio: 0.2,
      minRequestIntervalMs: 500,
      circuitBreakerThreshold: 3,
    });
    expect(dependencies.writeBatchReport).toHaveBeenCalledWith(
      './artifacts/batch-report.json',
      batch,
    );
    expect(JSON.parse(result.stdout)).toEqual(batch.summary);
    expect(dependencies.setExitCode).toHaveBeenCalledWith(0);
  });

  it('sets crawl exit code 2 for invalid input or a failed product', async () => {
    for (const batch of [makeBatchResult(0, 1), makeBatchResult(1, 0)]) {
      const dependencies = makeDependencies(makeValidationResult());
      vi.mocked(dependencies.crawlBatch).mockResolvedValueOnce(batch);
      await invokeCli(['crawl', '--input', 'input.txt'], dependencies);
      expect(dependencies.setExitCode).toHaveBeenCalledWith(2);
    }
  });

  it('gives explicit resilience options precedence over environment defaults', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    vi.mocked(dependencies.crawlBatch).mockResolvedValueOnce(makeBatchResult());
    await invokeCli(
      [
        'crawl',
        '--input',
        'input.txt',
        '--concurrency',
        '4',
        '--max-retries',
        '1',
        '--retry-delay',
        '20',
        '--retry-max-delay',
        '200',
        '--retry-jitter',
        '0.5',
        '--min-request-interval',
        '10',
        '--circuit-breaker-threshold',
        '5',
      ],
      dependencies,
    );
    expect(dependencies.crawlBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 4,
        maxRetries: 1,
        retryDelayMs: 20,
        retryMaxDelayMs: 200,
        retryJitterRatio: 0.5,
        minRequestIntervalMs: 10,
        circuitBreakerThreshold: 5,
      }),
    );
  });

  it.each([
    ['--limit', '0'],
    ['--timeout', '-1'],
    ['--settle-timeout', 'invalid'],
    ['--concurrency', '21'],
    ['--max-retries', '-1'],
    ['--retry-delay', '-1'],
    ['--retry-max-delay', '10'],
    ['--retry-jitter', '1.1'],
    ['--min-request-interval', '-1'],
    ['--circuit-breaker-threshold', '0'],
  ])(
    'rejects invalid crawl %s before dependencies run',
    async (option, value) => {
      const dependencies = makeDependencies(makeValidationResult());
      await expect(
        invokeCli(
          ['crawl', '--input', 'input.txt', option, value],
          dependencies,
        ),
      ).rejects.toThrow(option);
      expect(dependencies.crawlBatch).not.toHaveBeenCalled();
      expect(dependencies.writeBatchReport).not.toHaveBeenCalled();
    },
  );

  it('propagates a fatal crawl error without writing a report or setting an exit code', async () => {
    const dependencies = makeDependencies(makeValidationResult());
    vi.mocked(dependencies.crawlBatch).mockRejectedValueOnce(
      new Error('launch failed'),
    );
    await expect(
      invokeCli(['crawl', '--input', 'input.txt'], dependencies),
    ).rejects.toThrow('launch failed');
    expect(dependencies.writeBatchReport).not.toHaveBeenCalled();
    expect(dependencies.setExitCode).not.toHaveBeenCalled();
  });
});
