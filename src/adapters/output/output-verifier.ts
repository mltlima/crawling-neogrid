import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { parse } from 'csv-parse/sync';

import {
  artifactManifestSchema,
  productOutputSchema,
  type ProductOutput,
} from '../../domain/index.js';
import { InputOperationalError } from '../../application/index.js';
import { writeAtomicUtf8 } from '../../infrastructure/persistence/index.js';

export interface OutputVerificationReport {
  readonly inputSha256: string;
  readonly records: number;
  readonly jsonlRecords: number;
  readonly csvRecords: number;
  readonly successRecords: number;
  readonly errorRecords: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const digest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const decodeUtf8 = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);

function jsonl(content: string): ProductOutput[] {
  if (!content.endsWith('\n')) {
    throw new Error('JSONL sem newline final.');
  }
  return content
    .slice(0, -1)
    .split('\n')
    .filter(Boolean)
    .map((line) => productOutputSchema.parse(JSON.parse(line) as unknown));
}

function csv(content: string): ProductOutput[] {
  if (!content.endsWith('\n')) {
    throw new Error('CSV sem newline final.');
  }
  const rows = parse<Record<string, string>>(content, {
    columns: true,
    skip_empty_lines: true,
  });
  return rows.map((row) =>
    productOutputSchema.parse({
      ...row,
      title: row.title === '' ? null : row.title,
      normal_price: row.normal_price === '' ? null : Number(row.normal_price),
      discount_price:
        row.discount_price === '' ? null : Number(row.discount_price),
      image_url: row.image_url === '' ? null : row.image_url,
      error_message: row.error_message === '' ? null : row.error_message,
    }),
  );
}

export class OutputVerifier {
  public async verify(options: {
    inputSha256: string;
    expectedUrls: readonly string[];
    jsonlPath: string;
    csvPath: string;
    manifestPath: string;
    reportPath: string;
    expectedRunId: string;
    expectedSuccessfulRecords: number;
    expectedFailedRecords: number;
  }): Promise<OutputVerificationReport> {
    const errors: string[] = [];
    let jsonlProducts: ProductOutput[] = [];
    let csvProducts: ProductOutput[] = [];
    try {
      const [jsonlBytes, csvBytes, rawManifest] = await Promise.all([
        readFile(options.jsonlPath),
        readFile(options.csvPath),
        readFile(options.manifestPath, 'utf8'),
      ]);
      const manifest = artifactManifestSchema.parse(
        JSON.parse(rawManifest) as unknown,
      );
      const expectedFiles = new Map([
        [options.jsonlPath.split(/[\\/]/).at(-1), jsonlBytes],
        [options.csvPath.split(/[\\/]/).at(-1), csvBytes],
      ]);
      if (manifest.inputSha256 !== options.inputSha256) {
        errors.push('Hash de entrada divergente.');
      }
      if (manifest.runId !== options.expectedRunId) {
        errors.push('runId divergente.');
      }
      for (const [name, bytes] of expectedFiles) {
        if (name === undefined) {
          throw new Error('Nome de artefato ausente.');
        }
        const file = manifest.files.find((entry) => entry.fileName === name);
        if (
          file?.sha256 !== digest(bytes) ||
          file.sizeBytes !== bytes.byteLength
        ) {
          errors.push(`Arquivo divergente: ${name}.`);
        }
      }
      jsonlProducts = jsonl(decodeUtf8(jsonlBytes));
      csvProducts = csv(decodeUtf8(csvBytes));
      if (
        manifest.productsCount !== options.expectedUrls.length ||
        jsonlProducts.length !== options.expectedUrls.length ||
        csvProducts.length !== options.expectedUrls.length
      ) {
        errors.push('Quantidade de produtos divergente.');
      }
      const successfulRecords = jsonlProducts.filter(
        (product) => product.status === 'success',
      ).length;
      const failedRecords = jsonlProducts.length - successfulRecords;
      if (
        manifest.summary.successfulRecords !== successfulRecords ||
        manifest.summary.failedRecords !== failedRecords ||
        manifest.productsCount !== successfulRecords + failedRecords ||
        successfulRecords !== options.expectedSuccessfulRecords ||
        failedRecords !== options.expectedFailedRecords
      ) {
        errors.push('Resumo do manifest divergente dos produtos.');
      }
      for (const [index, product] of jsonlProducts.entries()) {
        if (
          product.product_url !== options.expectedUrls[index] ||
          JSON.stringify(product) !== JSON.stringify(csvProducts[index])
        ) {
          errors.push(`Produto divergente no índice ${String(index)}.`);
        }
      }
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : 'Saída inválida.');
    }
    const report = {
      inputSha256: options.inputSha256,
      records: options.expectedUrls.length,
      jsonlRecords: jsonlProducts.length,
      csvRecords: csvProducts.length,
      successRecords: jsonlProducts.filter((p) => p.status === 'success')
        .length,
      errorRecords: jsonlProducts.filter((p) => p.status === 'error').length,
      valid: errors.length === 0,
      errors,
    };
    await writeAtomicUtf8(
      options.reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  public async verifyOrThrow(
    options: Parameters<OutputVerifier['verify']>[0],
  ): Promise<OutputVerificationReport> {
    const report = await this.verify(options);
    if (!report.valid) {
      throw new InputOperationalError(
        'OUTPUT_VERIFICATION_FAILED',
        `Verificação dos outputs falhou: ${report.errors.join(' ')}`,
      );
    }
    return report;
  }
}
