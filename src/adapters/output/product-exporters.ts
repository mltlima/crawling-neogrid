import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

import { InputOperationalError } from '../../application/index.js';
import {
  artifactManifestSchema,
  productOutputSchema,
  type ArtifactManifest,
  type ProductOutput,
} from '../../domain/index.js';
import { writeAtomicUtf8 } from '../../infrastructure/persistence/index.js';

/* v8 ignore start -- byte-level output is covered through integration artifacts. */

const CSV_HEADERS = [
  'title',
  'normal_price',
  'discount_price',
  'product_url',
  'image_url',
  'status',
  'error_message',
] as const;

function csv(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function productsInOrder(products: readonly ProductOutput[]): ProductOutput[] {
  return products.map((product) => productOutputSchema.parse(product));
}

export class JsonlProductExporter {
  public async write(
    filePath: string,
    products: readonly ProductOutput[],
  ): Promise<void> {
    try {
      await writeAtomicUtf8(
        filePath,
        `${productsInOrder(products)
          .map((p) => JSON.stringify(p))
          .join('\n')}\n`,
      );
    } catch (error: unknown) {
      throw new InputOperationalError(
        'EXPORT_FAILED',
        'Não foi possível exportar JSONL.',
        { cause: error },
      );
    }
  }
}

export class CsvProductExporter {
  public async write(
    filePath: string,
    products: readonly ProductOutput[],
  ): Promise<void> {
    try {
      const rows = productsInOrder(products).map((product) =>
        CSV_HEADERS.map((key) => csv(product[key])).join(','),
      );
      await writeAtomicUtf8(
        filePath,
        `${CSV_HEADERS.join(',')}\n${rows.join('\n')}\n`,
      );
    } catch (error: unknown) {
      throw new InputOperationalError(
        'EXPORT_FAILED',
        'Não foi possível exportar CSV.',
        { cause: error },
      );
    }
  }
}

async function artifact(
  filePath: string,
): Promise<{ fileName: string; sizeBytes: number; sha256: string }> {
  const [bytes, metadata] = await Promise.all([
    readFile(filePath),
    stat(filePath),
  ]);
  return {
    fileName: basename(filePath),
    sizeBytes: metadata.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export class ArtifactManifestWriter {
  public async write(
    filePath: string,
    input: Omit<ArtifactManifest, 'files'> & {
      readonly files: readonly string[];
    },
  ): Promise<void> {
    const files = await Promise.all(input.files.map(artifact));
    const manifest = artifactManifestSchema.parse({ ...input, files });
    await writeAtomicUtf8(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}
/* v8 ignore stop */
