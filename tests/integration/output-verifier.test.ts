import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { OutputVerifier } from '../../src/adapters/output/output-verifier.js';
import {
  ArtifactManifestWriter,
  CsvProductExporter,
  JsonlProductExporter,
} from '../../src/adapters/output/product-exporters.js';

const directories: string[] = [];
const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const product = {
  title: 'Produto',
  normal_price: 100,
  discount_price: null,
  product_url: 'https://example.test/product',
  image_url: null,
  status: 'success' as const,
  error_message: null,
};
describe('OutputVerifier', () => {
  it('verifies matching JSONL and writes a report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'output-verifier-'));
    directories.push(directory);
    const content = `${JSON.stringify(product)}\n`;
    await writeFile(join(directory, 'products.jsonl'), content);
    const csv =
      'title,normal_price,discount_price,product_url,image_url,status,error_message\nProduto,100,,https://example.test/product,,success,\n';
    await writeFile(join(directory, 'products.csv'), csv);
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
          {
            fileName: 'products.csv',
            sizeBytes: Buffer.byteLength(csv),
            sha256: hash(csv),
          },
        ],
      }),
    );
    const report = await new OutputVerifier().verify({
      inputSha256: 'a'.repeat(64),
      expectedUrls: [product.product_url],
      jsonlPath: join(directory, 'products.jsonl'),
      csvPath: join(directory, 'products.csv'),
      manifestPath: join(directory, 'artifact-manifest.json'),
      reportPath: join(directory, 'verification.json'),
      expectedRunId: 'run',
      expectedSuccessfulRecords: 1,
      expectedFailedRecords: 0,
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
      csvPath: join(directory, 'missing.csv'),
      manifestPath: join(directory, 'missing.json'),
      reportPath: join(directory, 'verification.json'),
      expectedRunId: 'run',
      expectedSuccessfulRecords: 0,
      expectedFailedRecords: 0,
    });
    expect(report.valid).toBe(false);
    expect(report.errors).not.toHaveLength(0);
  });

  it('verifies exporter output with quoted CSV and legitimate duplicates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'output-verifier-'));
    directories.push(directory);
    const duplicate = {
      ...product,
      title: 'Produto, "especial"\nsegunda linha',
    };
    const products = [duplicate, duplicate];
    const jsonlPath = join(directory, 'products.jsonl');
    const csvPath = join(directory, 'products.csv');
    const manifestPath = join(directory, 'artifacts-manifest.json');
    await new JsonlProductExporter().write(jsonlPath, products);
    await new CsvProductExporter().write(csvPath, products);
    await new ArtifactManifestWriter().write(manifestPath, {
      schemaVersion: 1,
      runId: 'duplicates',
      inputSha256: 'b'.repeat(64),
      generatedAt: '2026-01-01T00:00:00.000Z',
      productsCount: 2,
      pricesInCents: true,
      summary: { successfulRecords: 2, failedRecords: 0 },
      files: [jsonlPath, csvPath],
    });
    await expect(
      new OutputVerifier().verifyOrThrow({
        inputSha256: 'b'.repeat(64),
        expectedRunId: 'duplicates',
        expectedUrls: [product.product_url, product.product_url],
        expectedSuccessfulRecords: 2,
        expectedFailedRecords: 0,
        jsonlPath,
        csvPath,
        manifestPath,
        reportPath: join(directory, 'output-verification.json'),
      }),
    ).resolves.toMatchObject({ valid: true, csvRecords: 2 });
  });

  it('rejects URL order, manifest summary and malformed CSV', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'output-verifier-'));
    directories.push(directory);
    const jsonlPath = join(directory, 'products.jsonl');
    const csvPath = join(directory, 'products.csv');
    const manifestPath = join(directory, 'artifacts-manifest.json');
    await new JsonlProductExporter().write(jsonlPath, [product]);
    await writeFile(csvPath, 'invalid,"unterminated\n');
    await new ArtifactManifestWriter().write(manifestPath, {
      schemaVersion: 1,
      runId: 'bad',
      inputSha256: 'c'.repeat(64),
      generatedAt: '2026-01-01T00:00:00.000Z',
      productsCount: 1,
      pricesInCents: true,
      summary: { successfulRecords: 0, failedRecords: 1 },
      files: [jsonlPath, csvPath],
    });
    const options = {
      inputSha256: 'c'.repeat(64),
      expectedRunId: 'bad',
      expectedUrls: ['https://example.test/other'],
      expectedSuccessfulRecords: 1,
      expectedFailedRecords: 0,
      jsonlPath,
      csvPath,
      manifestPath,
      reportPath: join(directory, 'output-verification.json'),
    };
    await expect(
      new OutputVerifier().verifyOrThrow(options),
    ).rejects.toMatchObject({ code: 'OUTPUT_VERIFICATION_FAILED' });
  });

  it('rejects tampered artifact hashes and invalid product prices', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'output-verifier-'));
    directories.push(directory);
    const invalidProduct = { ...product, normal_price: 1.5 };
    const jsonl = `${JSON.stringify(invalidProduct)}\n`;
    const csv =
      'title,normal_price,discount_price,product_url,image_url,status,error_message\nProduto,1.5,,https://example.test/product,,success,\n';
    const jsonlPath = join(directory, 'products.jsonl');
    const csvPath = join(directory, 'products.csv');
    await writeFile(jsonlPath, jsonl);
    await writeFile(csvPath, csv);
    const manifestPath = join(directory, 'artifacts-manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        runId: 'tampered',
        inputSha256: 'd'.repeat(64),
        generatedAt: '2026-01-01T00:00:00.000Z',
        productsCount: 1,
        pricesInCents: true,
        summary: { successfulRecords: 1, failedRecords: 0 },
        files: [
          {
            fileName: 'products.jsonl',
            sizeBytes: Buffer.byteLength(jsonl) + 1,
            sha256: '0'.repeat(64),
          },
          {
            fileName: 'products.csv',
            sizeBytes: Buffer.byteLength(csv),
            sha256: hash(csv),
          },
        ],
      }),
    );
    const report = await new OutputVerifier().verify({
      inputSha256: 'd'.repeat(64),
      expectedRunId: 'tampered',
      expectedUrls: [product.product_url],
      expectedSuccessfulRecords: 1,
      expectedFailedRecords: 0,
      jsonlPath,
      csvPath,
      manifestPath,
      reportPath: join(directory, 'output-verification.json'),
    });
    expect(report.valid).toBe(false);
    expect(report.errors.join(' ')).toMatch(/Arquivo divergente|integer/i);
  });
});
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
