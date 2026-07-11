import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inputValidationResultSchema } from '../../src/domain/index.js';
import { makeIfoodUrl } from '../fixtures/input-values.js';

interface CliProcessResult {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function runCli(args: readonly string[]): Promise<CliProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli/index.ts', ...args],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
      },
    );
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stderr, stdout });
    });
  });
}

describe('validate-input CLI reporting', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ifood-cli-reporting-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns exit code 0 when every record is valid', async () => {
    const inputPath = join(directory, 'valid.txt');
    await writeFile(inputPath, makeIfoodUrl(), 'utf8');

    const result = await runCli(['validate-input', '--input', inputPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      validRecords: 1,
      invalidRecords: 0,
      uniqueUrls: 1,
      uniqueItemIds: 1,
      uniqueLocalities: 1,
    });
  }, 15_000);

  it('returns exit code 2 while preserving JSON output for invalid records', async () => {
    const inputPath = join(directory, 'invalid.txt');
    await writeFile(inputPath, `${makeIfoodUrl()}\nnot-a-url`, 'utf8');

    const result = await runCli(['validate-input', '--input', inputPath]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      validRecords: 1,
      invalidRecords: 1,
      errorsByCode: { INVALID_URL: 1 },
    });
  }, 15_000);

  it('returns exit code 1 for an operational input error', async () => {
    const result = await runCli([
      'validate-input',
      '--input',
      join(directory, 'missing.txt'),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('FILE_NOT_FOUND');
  });

  it('writes the complete JSON report and creates parent directories', async () => {
    const inputPath = join(directory, 'valid.txt');
    const reportPath = join(directory, 'nested', 'report.json');
    await writeFile(inputPath, makeIfoodUrl(), 'utf8');

    const result = await runCli([
      'validate-input',
      '--input',
      inputPath,
      '--report',
      reportPath,
    ]);
    const reportContent: unknown = JSON.parse(
      await readFile(reportPath, 'utf8'),
    );
    const report = inputValidationResultSchema.parse(reportContent);

    expect(result.exitCode).toBe(0);
    expect(report.validRecords).toHaveLength(1);
    expect(report.batch.sourcePath).toBe(inputPath);
    expect(JSON.parse(result.stdout)).toEqual(report.summary);
  });

  it('returns exit code 1 when the report cannot be written', async () => {
    const inputPath = join(directory, 'valid.txt');
    const reportPath = join(directory, 'existing-directory');
    await writeFile(inputPath, makeIfoodUrl(), 'utf8');
    await mkdir(reportPath);

    const result = await runCli([
      'validate-input',
      '--input',
      inputPath,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('REPORT_WRITE_FAILED');
  });
});
