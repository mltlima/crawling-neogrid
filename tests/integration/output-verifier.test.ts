import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { OutputVerifier } from '../../src/adapters/output/output-verifier.js';

const directories: string[] = [];
const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const product = {
  title: 'Produto',
  normal_price: 100,
  discount_price: null,
  product_url: 'https://example.test/product',
  image_url: null,
  status: 'success',
  error_message: null,
};
describe('OutputVerifier', () => {
  it('verifies matching JSONL and writes a report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'output-verifier-'));
    directories.push(directory);
    const content = `${JSON.stringify(product)}\n`;
    await writeFile(join(directory, 'products.jsonl'), content);
    await writeFile(
      join(directory, 'artifact-manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        runId: 'run',
        inputSha256: 'a'.repeat(64),
        generatedAt: '2026-01-01T00:00:00.000Z',
        productsCount: 1,
        pricesInCents: true,
        summary: { successfulRecords: 1, failedRecords: 0 },
        files: [
          {
            fileName: 'products.jsonl',
            sizeBytes: Buffer.byteLength(content),
            sha256: hash(content),
          },
        ],
      }),
    );
    const report = await new OutputVerifier().verify({
      inputSha256: 'a'.repeat(64),
      expectedUrls: [product.product_url],
      jsonlPath: join(directory, 'products.jsonl'),
      manifestPath: join(directory, 'artifact-manifest.json'),
      reportPath: join(directory, 'verification.json'),
    });
    expect(report).toMatchObject({
      valid: true,
      records: 1,
      jsonlRecords: 1,
      successRecords: 1,
    });
    expect(
      JSON.parse(await readFile(join(directory, 'verification.json'), 'utf8')),
    ).toMatchObject({ valid: true });
  });

  it('reports malformed or divergent output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'output-verifier-'));
    directories.push(directory);
    const report = await new OutputVerifier().verify({
      inputSha256: 'a'.repeat(64),
      expectedUrls: [],
      jsonlPath: join(directory, 'missing.jsonl'),
      manifestPath: join(directory, 'missing.json'),
      reportPath: join(directory, 'verification.json'),
    });
    expect(report.valid).toBe(false);
    expect(report.errors).not.toHaveLength(0);
  });
});
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
