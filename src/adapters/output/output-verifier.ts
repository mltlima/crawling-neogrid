import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  artifactManifestSchema,
  productOutputSchema,
  type ProductOutput,
} from '../../domain/index.js';
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
function products(content: string): ProductOutput[] {
  const lines = content.split('\n');
  if (lines.at(-1) !== '') {
    throw new Error('JSONL sem newline final.');
  }
  return lines
    .slice(0, -1)
    .map((line) => productOutputSchema.parse(JSON.parse(line) as unknown));
}
export class OutputVerifier {
  public async verify(options: {
    inputSha256: string;
    expectedUrls: readonly string[];
    jsonlPath: string;
    manifestPath: string;
    reportPath: string;
  }): Promise<OutputVerificationReport> {
    const errors: string[] = [];
    let output: ProductOutput[] = [];
    try {
      const [bytes, raw] = await Promise.all([
        readFile(options.jsonlPath),
        readFile(options.manifestPath, 'utf8'),
      ]);
      const manifest = artifactManifestSchema.parse(JSON.parse(raw) as unknown);
      if (manifest.inputSha256 !== options.inputSha256) {
        errors.push('Hash de entrada divergente.');
      }
      const file = manifest.files.find(
        (entry) => entry.fileName === options.jsonlPath.split(/[\\/]/).at(-1),
      );
      if (file?.sha256 !== digest(bytes)) {
        errors.push('Hash JSONL divergente.');
      }
      output = products(bytes.toString('utf8'));
      if (output.length !== options.expectedUrls.length) {
        errors.push('Quantidade de produtos divergente.');
      }
      for (const [index, product] of output.entries()) {
        if (product.product_url !== options.expectedUrls[index]) {
          errors.push(`URL divergente no índice ${String(index)}.`);
        }
      }
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : 'Saída inválida.');
    }
    const report: OutputVerificationReport = {
      inputSha256: options.inputSha256,
      records: options.expectedUrls.length,
      jsonlRecords: output.length,
      csvRecords: 0,
      successRecords: output.filter((product) => product.status === 'success')
        .length,
      errorRecords: output.filter((product) => product.status === 'error')
        .length,
      valid: errors.length === 0,
      errors,
    };
    await writeAtomicUtf8(
      options.reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }
}
